import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { MUTATE, startServer, withSession, type TestServer } from './helpers';

let s: TestServer;
afterEach(() => s?.close());

const json = (cookie: string, body: unknown, method = 'POST') => ({
  method,
  body: JSON.stringify(body),
  headers: { cookie, 'x-requested-with': 'mm', 'content-type': 'application/json' },
});
const others = (over: Record<string, unknown> = {}) => ({
  date: '2026-12-01',
  start_time: '10:30',
  topic: 'Review',
  ...over,
});

async function boot() {
  s = await startServer({ seed: 'demo' });
  const cookie = await s.signIn();
  const create = async (values = others(), id = newId(), category = 'others') => {
    const res = await s.get('/api/meetings', json(cookie, { id, category, values }));
    return { res, body: await res.json(), id };
  };
  return { cookie, create };
}

describe('meetings API', () => {
  it('creates a meeting (201) and returns it with an undo token', async () => {
    const { create } = await boot();
    const { res, body } = await create();
    expect(res.status).toBe(201);
    expect(body.meeting).toMatchObject({ rev: 1, title: 'Review', category_slug: 'others' });
    expect(body.meeting.values.end_time).toBe('11:30');
    expect(body.existing).toBe(false);
    expect(body.undo_token).toBeTruthy();
  });

  it('a retried create is 200 and makes nothing new', async () => {
    const { create, cookie } = await boot();
    const id = newId();
    expect((await create(others(), id)).res.status).toBe(201);
    const again = await create(others(), id);
    expect(again.res.status).toBe(200);
    expect(again.body.existing).toBe(true);
    const list = await (await s.get('/api/meetings?category=others', withSession(cookie))).json();
    expect(list.meetings.filter((m: { id: string }) => m.id === id)).toHaveLength(1);
  });

  it('missing details come back as a 400 with a message per field', async () => {
    const { create } = await boot();
    const { res, body } = await create({ date: '2026-12-01', start_time: '10:30' });
    expect(res.status).toBe(400);
    expect(body.error).toMatchObject({
      code: 'invalid',
      message: '1 thing needs your attention.',
      issues: [{ field: 'topic', message: 'Please fill in Topic.' }],
    });
  });

  it('reads one meeting, and says plainly when it does not exist', async () => {
    const { create, cookie } = await boot();
    const { id } = await create();
    const ok = await s.get(`/api/meetings/${id}`, withSession(cookie));
    expect((await ok.json()).meeting.id).toBe(id);
    const missing = await s.get(`/api/meetings/${newId()}`, withSession(cookie));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.message).toBe("We couldn't find that meeting.");
  });

  it('lists upcoming and past separately', async () => {
    const { cookie } = await boot();
    const up = await (await s.get('/api/meetings?scope=upcoming', withSession(cookie))).json();
    const past = await (await s.get('/api/meetings?scope=past', withSession(cookie))).json();
    expect(up.meetings.length).toBeGreaterThan(5);
    expect(past.meetings.length).toBeGreaterThan(2);
    const key = (m: { values: { date: string; start_time: string } }) =>
      `${m.values.date} ${m.values.start_time}`;
    expect(up.meetings.map(key)).toEqual([...up.meetings.map(key)].sort());
  });

  it('updates with the rev, and a stale rev is a 409 in plain words', async () => {
    const { create, cookie } = await boot();
    const { id } = await create();
    const ok = await s.get(
      `/api/meetings/${id}`,
      json(cookie, { rev: 1, values: { remarks: 'one' } }, 'PATCH'),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).meeting.rev).toBe(2);
    const stale = await s.get(
      `/api/meetings/${id}`,
      json(cookie, { rev: 1, values: { remarks: 'two' } }, 'PATCH'),
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toEqual({
      code: 'conflict',
      message: 'This meeting was changed somewhere else. Please reload it and try again.',
    });
  });

  it('reschedules with one request and the history shows old and new times', async () => {
    const { create, cookie } = await boot();
    const { id } = await create();
    const res = await s.get(
      `/api/meetings/${id}/reschedule`,
      json(cookie, { date: '2026-12-02', start_time: '2:30 pm', reason: 'Clash', rev: 1 }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meeting.values).toMatchObject({
      date: '2026-12-02',
      start_time: '14:30',
      end_time: '15:30',
      meeting_status: 'Rescheduled',
    });
    const history = await (await s.get(`/api/meetings/${id}/history`, withSession(cookie))).json();
    expect(history.reschedules[0]).toMatchObject({
      old_date: '2026-12-01',
      new_date: '2026-12-02',
      new_start: '14:30',
      reason: 'Clash',
    });
  });

  it('changes status, deletes and restores', async () => {
    const { create, cookie } = await boot();
    const { id } = await create();
    const cancelled = await (
      await s.get(`/api/meetings/${id}/status`, json(cookie, { status: 'Cancelled', rev: 1 }))
    ).json();
    expect(cancelled.meeting.values.meeting_status).toBe('Cancelled');
    const deleted = await s.get(`/api/meetings/${id}?rev=2`, {
      method: 'DELETE',
      ...withSession(cookie, MUTATE),
    });
    expect((await deleted.json()).meeting.deleted_at).toBeTruthy();
    const gone = await (await s.get('/api/meetings?category=others', withSession(cookie))).json();
    expect(gone.meetings.some((m: { id: string }) => m.id === id)).toBe(false);
    const back = await (
      await s.get(`/api/meetings/${id}/restore`, { method: 'POST', ...withSession(cookie, MUTATE) })
    ).json();
    expect(back.meeting.deleted_at).toBeNull();
  });

  it('undo reverses the last change', async () => {
    const { create, cookie } = await boot();
    const { id } = await create();
    const moved = await (
      await s.get(
        `/api/meetings/${id}/reschedule`,
        json(cookie, { date: '2026-12-09', start_time: '10:30', rev: 1 }),
      )
    ).json();
    const undone = await s.get(`/api/undo/${moved.undo_token}`, {
      method: 'POST',
      ...withSession(cookie, MUTATE),
    });
    const body = await undone.json();
    expect(undone.status).toBe(200);
    expect(body.label).toBe('Meeting moved');
    expect(body.meeting.values).toMatchObject({ date: '2026-12-01', meeting_status: 'Scheduled' });
    const again = await s.get(`/api/undo/${moved.undo_token}`, {
      method: 'POST',
      ...withSession(cookie, MUTATE),
    });
    expect(again.status).toBe(409);
  });

  it('undo says so when the meeting has changed since', async () => {
    const { create, cookie } = await boot();
    const { id, body } = await create();
    await s.get(
      `/api/meetings/${id}`,
      json(cookie, { rev: 1, values: { remarks: 'later' } }, 'PATCH'),
    );
    const res = await s.get(`/api/undo/${body.undo_token}`, {
      method: 'POST',
      ...withSession(cookie, MUTATE),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toBe(
      "This can't be undone because the meeting has changed since.",
    );
  });

  it('refuses a request it cannot read, in plain words', async () => {
    const { cookie } = await boot();
    const res = await s.get('/api/meetings', json(cookie, { nonsense: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(
      'That request was not understood. Please reload the page and try again.',
    );
    const broken = await s.get('/api/meetings', {
      method: 'POST',
      body: '{not json',
      headers: { cookie, 'x-requested-with': 'mm', 'content-type': 'application/json' },
    });
    expect(broken.status).toBe(400);
  });

  it('needs the CSRF header and a session', async () => {
    const { cookie } = await boot();
    expect(
      (
        await s.get('/api/meetings', {
          method: 'POST',
          body: '{}',
          headers: { cookie, 'content-type': 'application/json' },
        })
      ).status,
    ).toBe(403);
    expect((await s.get('/api/meetings')).status).toBe(401);
  });

  it('a Google outage is a calm 503 in plain words, and the same request works once Google is back', async () => {
    const { cookie } = await boot();
    s.mock.failures.set('network');
    const down = await s.get('/api/meetings', withSession(cookie));
    expect(down.status).toBe(503);
    expect((await down.json()).error).toEqual({
      code: 'google_unavailable',
      message: "We couldn't reach Google right now. Your changes are still here. Please try again.",
    });
    s.mock.failures.clear();
    const back = await s.get('/api/meetings', withSession(cookie));
    expect(back.status).toBe(200);
  });
});

describe('settings API', () => {
  it('reads and changes settings, validating each one', async () => {
    const { cookie } = await boot();
    const before = (await (await s.get('/api/settings', withSession(cookie))).json()).settings;
    expect(before).toMatchObject({
      timezone: 'Asia/Kolkata',
      default_duration_min: '60',
      default_reminders: '1440,60',
    });

    const res = await s.get(
      '/api/settings',
      json(
        cookie,
        { default_duration_min: 45, default_reminders: '60, 1440, 15', time_format: '24h' },
        'PATCH',
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toMatchObject({
      default_duration_min: '45',
      default_reminders: '1440,60,15',
      time_format: '24h',
    });
    expect(
      (await (await s.get('/api/settings', withSession(cookie))).json()).settings.time_format,
    ).toBe('24h');
  });

  it('refuses bad values with a plain message each', async () => {
    const { cookie } = await boot();
    const res = await s.get(
      '/api/settings',
      json(
        cookie,
        {
          timezone: 'Mars/Phobos',
          default_duration_min: 1,
          default_reminders: '1,2,3,4,5,6',
          week_starts_on: 'friday',
        },
        'PATCH',
      ),
    );
    expect(res.status).toBe(400);
    const issues = (await res.json()).error.issues;
    expect(issues.map((i: { field: string }) => i.field)).toEqual([
      'timezone',
      'default_duration_min',
      'default_reminders',
      'week_starts_on',
    ]);
    expect(issues[0].message).toBe('Please choose a time zone from the list.');
    expect(issues[2].message).toMatch(/at most 5/);
  });

  it('a new default length is used by the next meeting', async () => {
    const { create, cookie } = await boot();
    await s.get('/api/settings', json(cookie, { default_duration_min: 90 }, 'PATCH'));
    const { body } = await create(others({ start_time: '09:00' }));
    expect(body.meeting.values.end_time).toBe('10:30');
  });

  it('records a settings change in the change log', async () => {
    const { cookie } = await boot();
    await s.get('/api/settings', json(cookie, { time_format: '24h' }, 'PATCH'));
    const id = (await s.mock.state.read())!.activeSpreadsheetId!;
    const tab = (await s.mock.services.sheets.getTabs(id)).find((t) => t.title === '_audit')!;
    const rows = (await s.mock.services.sheets.batchGet(id, [tab.gid]))[tab.gid]!;
    expect(rows.some((r) => r[3] === 'config' && String(r[6]).includes('24h'))).toBe(true);
  });

  it('ignores a setting it does not know', async () => {
    const { cookie } = await boot();
    const res = await s.get('/api/settings', json(cookie, { made_up: 'x' }, 'PATCH'));
    expect(res.status).toBe(200);
    expect((await res.json()).settings).not.toHaveProperty('made_up');
  });
});

describe('refresh and meta', () => {
  it('Refresh picks up a change made directly in the Sheet', async () => {
    const { cookie } = await boot();
    const meta1 = await (await s.get('/api/meta', withSession(cookie))).json();
    expect(meta1.categories).toHaveLength(11);
    const id = (await s.mock.state.read())!.activeSpreadsheetId!;
    const cats = (await s.mock.services.sheets.getTabs(id)).find((t) => t.title === '_categories')!;
    const rows = (await s.mock.services.sheets.batchGet(id, [cats.gid]))[cats.gid]!;
    const r = [...rows[1]!];
    r[rows[0]!.indexOf('name')] = 'Conciliation';
    await s.mock.services.sheets.updateRow(id, cats.gid, 2, r);

    expect((await (await s.get('/api/meta', withSession(cookie))).json()).categories[0].name).toBe(
      'CCIE',
    ); // still the cached copy
    expect(
      (await s.get('/api/refresh', { method: 'POST', ...withSession(cookie, MUTATE) })).status,
    ).toBe(200);
    expect((await (await s.get('/api/meta', withSession(cookie))).json()).categories[0].name).toBe(
      'Conciliation',
    );
  });

  it('meta lists cells that need attention', async () => {
    const { cookie } = await boot();
    const id = (await s.mock.state.read())!.activeSpreadsheetId!;
    const tab = (await s.mock.services.sheets.getTabs(id)).find((t) => t.title === 'Others')!;
    const rows = (await s.mock.services.sheets.batchGet(id, [tab.gid]))[tab.gid]!;
    const row = rows[0]!.map((_, i) => rows[1]![i] ?? '');
    row[rows[0]!.indexOf('start_time')] = 'noon-ish';
    await s.mock.services.sheets.updateRow(id, tab.gid, 2, row);
    await s.get('/api/refresh', { method: 'POST', ...withSession(cookie, MUTATE) });
    const meta = await (await s.get('/api/meta', withSession(cookie))).json();
    expect(meta.attention).toEqual([
      { tab: 'Others', row: 2, message: 'Row 2: Time: "noon-ish" is not a time.' },
    ]);
  });
});
