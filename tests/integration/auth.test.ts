import { afterEach, describe, expect, it } from 'vitest';
import { OWNER, SON, startServer, withSession, MUTATE, type TestServer } from './helpers';

let s: TestServer;
afterEach(() => s?.close());

describe('sign-in (mock Google)', () => {
  it('signs the owner in with a private cookie and goes to the dashboard', async () => {
    s = await startServer({ seed: 'demo' });
    const res = await s.get('/api/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('mm_session='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/); // 30 days
  });

  it('runs first-run setup on the owner sign-in, and reuses the database on the second', async () => {
    s = await startServer({ seed: 'empty' });
    expect((await s.mock.state.read())?.activeSpreadsheetId).toBeUndefined();
    await s.signIn();
    const first = (await s.mock.state.read())?.activeSpreadsheetId;
    expect(first).toBeTruthy();
    await s.signIn();
    expect((await s.mock.state.read())?.activeSpreadsheetId).toBe(first);
    expect(
      await s.mock.services.drive.findByAppProperties({
        app: 'meetings-manager',
        role: 'database',
      }),
    ).toHaveLength(1);
  });

  it('turns away an account that is not on the list, naming the account', async () => {
    s = await startServer({ seed: 'demo' });
    const res = await s.get('/api/auth/google?as=stranger@gmail.com');
    expect(res.headers.get('location')).toBe(
      '/login?error=wrong_account&email=stranger%40gmail.com',
    );
    expect(res.headers.getSetCookie().some((c) => c.startsWith('mm_session='))).toBe(false);
  });

  it('asks a non-owner to wait until the owner has signed in once', async () => {
    s = await startServer({ seed: 'demo' });
    const res = await s.get(`/api/auth/google?as=${SON}`);
    expect(res.headers.get('location')).toContain('error=not_set_up');
  });

  it('lets the second person in after the owner has set things up', async () => {
    s = await startServer({ seed: 'demo' });
    await s.signIn(OWNER);
    const cookie = await s.signIn(SON);
    const me = await (await s.get('/api/auth/me', withSession(cookie))).json();
    expect(me.user).toMatchObject({ email: SON, role: 'admin' });
  });

  it('GET /me describes the signed-in user and whether Google needs a new sign-in', async () => {
    s = await startServer({ seed: 'demo' });
    const cookie = await s.signIn();
    const me = await (await s.get('/api/auth/me', withSession(cookie))).json();
    expect(me.user).toMatchObject({ email: OWNER, role: 'owner' });
    expect(me.google).toEqual({ mode: 'mock', needsSignIn: false });
  });

  it('GET /me without a session is 401', async () => {
    s = await startServer({ seed: 'demo' });
    expect((await s.get('/api/auth/me')).status).toBe(401);
  });

  it('refuses a cookie that was tampered with', async () => {
    s = await startServer({ seed: 'demo' });
    const cookie = await s.signIn();
    const res = await s.get('/api/auth/me', withSession(cookie.slice(0, -3) + 'abc'));
    expect(res.status).toBe(401);
  });

  it('sign out clears the cookie and needs the CSRF header', async () => {
    s = await startServer({ seed: 'demo' });
    const cookie = await s.signIn();
    expect(
      (await s.get('/api/auth/logout', { method: 'POST', ...withSession(cookie) })).status,
    ).toBe(403);
    const res = await s.get('/api/auth/logout', { method: 'POST', ...withSession(cookie, MUTATE) });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().find((c) => c.startsWith('mm_session='))).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
  });

  it('shows a setup problem as a message, not a crash', async () => {
    s = await startServer({ seed: 'empty', failures: 'drive' });
    const res = await s.get('/api/auth/google');
    expect(res.headers.get('location')).toBe(
      `/login?error=setup_failed&email=${encodeURIComponent(OWNER)}`,
    );
  });

  it('the Google callback is not usable in mock mode', async () => {
    s = await startServer({ seed: 'demo' });
    expect((await s.get('/api/auth/google/callback?code=x&state=y')).headers.get('location')).toBe(
      '/login?error=try_again',
    );
  });
});

describe('GET /api/meta', () => {
  it('returns categories, fields, workspaces and settings from the Sheet', async () => {
    s = await startServer({ seed: 'demo' });
    const cookie = await s.signIn();
    const res = await s.get('/api/meta', withSession(cookie));
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.categories.map((c: { slug: string }) => c.slug)).toEqual([
      'ccie',
      'sfc_pppac',
      'morth',
      'pmg',
      'patsc_iac',
      'file_discussion',
      'at',
      'court_case',
      'others',
      'supervisor_meeting',
      'phd_milestone',
    ]);
    expect(meta.workspaces.map((w: { name: string }) => w.name)).toEqual([
      'NHAI',
      'PhD',
      'Personal',
    ]);
    expect(meta.settings.timezone).toBe('Asia/Kolkata');
    expect(meta.problems).toEqual([]);

    const ccie = meta.fields.filter((f: { category_slug: string }) => f.category_slug === 'ccie');
    const caseId = ccie.find((f: { key: string }) => f.key === 'case_id');
    expect(caseId).toMatchObject({ required: true, case_key: true, type: 'text' });
    expect(ccie.find((f: { key: string }) => f.key === 'state').options).toHaveLength(36);
    expect(ccie.find((f: { key: string }) => f.key === 'pendency_months')).toMatchObject({
      type: 'computed',
    });
    expect(meta.categories.find((c: { slug: string }) => c.slug === 'ccie').sheet_gid).toBe(0);
  });

  it('skips a broken config row and says so, instead of failing', async () => {
    s = await startServer({ seed: 'demo' });
    const cookie = await s.signIn();
    const id = (await s.mock.state.read())!.activeSpreadsheetId!;
    const tabs = await s.mock.services.sheets.getTabs(id);
    const fields = tabs.find((t) => t.title === '_fields')!;
    await s.mock.services.sheets.appendRows(id, fields.gid, [
      ['ccie', 'oops', 'Oops', 'not_a_type'],
      ['ccie', 'bad_options', 'Bad', 'select', 'FALSE', '[not json'],
    ]);
    const meta = await (await s.get('/api/meta', withSession(cookie))).json();
    expect(meta.problems).toHaveLength(2);
    expect(meta.problems.join(' ')).toMatch(/unknown type "not_a_type"/);
    expect(meta.problems.join(' ')).toMatch(/not a valid list/);
    expect(meta.fields.find((f: { key: string }) => f.key === 'oops')).toBeUndefined();
    expect(meta.fields.find((f: { key: string }) => f.key === 'case_id')).toBeDefined();
  });

  it('says the app is not set up when the owner has not signed in', async () => {
    s = await startServer({ seed: 'demo' });
    const cookie = await s.signIn();
    await s.mock.state.write({ jobs: {} });
    const res = await s.get('/api/meta', withSession(cookie));
    expect(res.status).toBe(503);
  });
});
