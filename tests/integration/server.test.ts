import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, withSession, MUTATE, type TestServer } from './helpers';

let s: TestServer;
beforeAll(async () => {
  s = await startServer({ seed: 'empty' });
});
afterAll(() => s.close());

describe('GET /api/health', () => {
  it('needs no sign-in and reports the process, mode and state file', async () => {
    const res = await s.get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      mode: 'mock',
      stateFile: 'ok',
      google: 'mock',
    });
  });

  it('reports a missing state file without failing', async () => {
    s.mock.state.lose();
    const body = (await (await s.get('/api/health')).json()) as { stateFile: string };
    expect(body.stateFile).toBe('missing');
    await s.mock.state.write({ jobs: {} });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await s.get('/api/health');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('API errors', () => {
  it('returns a plain-language JSON error for unknown routes once signed in', async () => {
    const cookie = await s.signIn();
    const res = await s.get('/api/nope', withSession(cookie));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).not.toMatch(/404|undefined|exception/i);
  });

  it('asks for sign-in, in plain words, when there is no session', async () => {
    const res = await s.get('/api/meta');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      'Please sign in to continue.',
    );
  });

  it('requires the CSRF header on mutating requests', async () => {
    const cookie = await s.signIn();
    const without = await s.get('/api/nope', { method: 'POST', ...withSession(cookie) });
    expect(without.status).toBe(403);
    const withHeader = await s.get('/api/nope', { method: 'POST', ...withSession(cookie, MUTATE) });
    expect(withHeader.status).toBe(404);
  });
});
