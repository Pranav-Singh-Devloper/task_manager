import { afterEach, describe, expect, it } from 'vitest';
import { calendarEventIdFor, newId } from '../../shared/ids';
import { MUTATE, OWNER, startServer, type TestServer } from './helpers';

// Responses are checked field by field in these tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

let server: TestServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function boot(extraEnv: Record<string, string> = {}) {
  server = await startServer({ seed: 'demo' }, extraEnv);
  const cookie = await server.signIn(OWNER);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await server!.get(`/api${path}`, {
      method,
      headers: { cookie, ...MUTATE, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: (await res.json()) as Json };
  };
  const upload = async (
    fields: Record<string, string>,
    file: { name: string; type: string; bytes: number },
  ) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
    const res = await server!.get('/api/files', {
      method: 'POST',
      headers: { cookie, ...MUTATE },
      body: form,
    });
    return { status: res.status, body: (await res.json()) as Json };
  };
  return { call, upload, mock: server.mock };
}

const tomorrow = () => {
  const d = new Date(Date.now() + 36 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};
const ccie = (over: Record<string, unknown> = {}) => ({
  date: tomorrow(),
  start_time: '10:30',
  end_time: '11:30',
  case_id: 'C-900',
  project_name: 'NH-9',
  state: 'Kerala',
  topic: 'Sync check',
  ...over,
});
const events = (mock: Awaited<ReturnType<typeof boot>>['mock']) =>
  mock.world.calendars.get('primary') ?? new Map();

describe('calendar sync', () => {
  it('puts a new meeting on the calendar with reminders, and remembers the event', async () => {
    const { call, mock } = await boot();
    const id = newId();
    const r = await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    expect(r.status).toBe(201);
    expect(r.body.meeting.calendar_sync).toBe('ok');
    expect(r.body.meeting.calendar_event_id).toBe(calendarEventIdFor(id));
    const event = events(mock).get(calendarEventIdFor(id))!;
    expect(event.summary).toBe('[CCIE] Sync check');
    expect(event.reminders.overrides.map((o: { minutes: number }) => o.minutes)).toEqual([
      1440, 60,
    ]);
    expect(event.status).toBe('confirmed');
  });

  it('moves the event when rescheduled, removes it when cancelled and brings it back when restored', async () => {
    const { call, mock } = await boot();
    const id = newId();
    const made = await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    const eid = calendarEventIdFor(id);

    const moved = await call('POST', `/meetings/${id}/reschedule`, {
      date: ccie().date,
      start_time: '15:00',
      end_time: '16:00',
      rev: made.body.meeting.rev,
    });
    expect(events(mock).get(eid)!.start.dateTime).toContain('T15:00:00');
    expect(moved.body.meeting.calendar_sync).toBe('ok');

    const cancelled = await call('POST', `/meetings/${id}/status`, {
      status: 'Cancelled',
      rev: moved.body.meeting.rev,
    });
    expect(events(mock).get(eid)!.status).toBe('cancelled');

    const back = await call('POST', `/meetings/${id}/status`, {
      status: 'Scheduled',
      rev: cancelled.body.meeting.rev,
    });
    expect(back.body.meeting.calendar_sync).toBe('ok');
    expect(events(mock).get(eid)!.status).toBe('confirmed');
    expect(events(mock).size).toBe(1 + demoEventCount(mock, eid));
  });

  it('removes the event on delete and restores it on undo', async () => {
    const { call, mock } = await boot();
    const id = newId();
    const made = await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    const gone = await call('DELETE', `/meetings/${id}?rev=${made.body.meeting.rev}`);
    expect(events(mock).get(calendarEventIdFor(id))!.status).toBe('cancelled');
    const undone = await call('POST', `/undo/${gone.body.undo_token}`);
    expect(undone.status).toBe(200);
    expect(undone.body.meeting.calendar_sync).toBe('ok');
    expect(events(mock).get(calendarEventIdFor(id))!.status).toBe('confirmed');
  });

  it('still saves when Calendar is down, shows it, and catches up on retry without a second event', async () => {
    const { call, mock } = await boot();
    mock.failures.set('calendar');
    const id = newId();
    const r = await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    expect(r.status).toBe(201);
    expect(r.body.meeting.calendar_sync).toBe('error');
    expect(events(mock).has(calendarEventIdFor(id))).toBe(false);

    mock.failures.clear();
    const again = await call('POST', `/calendar/retry/${id}`);
    expect(again.body.meeting.calendar_sync).toBe('ok');
    expect(events(mock).has(calendarEventIdFor(id))).toBe(true);
  });

  it('retries every meeting that missed the calendar', async () => {
    const { call, mock } = await boot();
    mock.failures.set('calendar');
    const ids = [newId(), newId()];
    for (const id of ids) await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    mock.failures.clear();
    const r = await call('POST', '/calendar/retry-all');
    expect(r.body.failed).toBe(0);
    expect(r.body.ok).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect(events(mock).has(calendarEventIdFor(id))).toBe(true);
  });

  it('saving the same meeting twice makes one event', async () => {
    const { call, mock } = await boot();
    const id = newId();
    await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    const before = events(mock).size;
    const again = await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    expect(again.status).toBe(200);
    expect(events(mock).size).toBe(before);
  });

  it('keeps a past meeting off the calendar', async () => {
    const { call, mock } = await boot();
    const id = newId();
    const r = await call('POST', '/meetings', {
      id,
      category: 'ccie',
      values: ccie({ date: '2020-01-10' }),
    });
    expect(r.body.meeting.calendar_sync).toBe('none');
    expect(events(mock).has(calendarEventIdFor(id))).toBe(false);
  });
});

function demoEventCount(
  mock: { world: { calendars: Map<string, Map<string, unknown>> } },
  mine: string,
) {
  const all = mock.world.calendars.get('primary') ?? new Map();
  return [...all.keys()].filter((k) => k !== mine).length;
}

describe('files', () => {
  const pdf = { name: 'Order sheet.pdf', type: 'application/pdf', bytes: 2048 };

  it('keeps an upload pending until the meeting is saved, then attaches it and mirrors the link', async () => {
    const { call, upload, mock } = await boot();
    const id = newId();
    const up = await upload(
      { meeting_id: id, category: 'ccie', date: ccie().date, title: 'Sync check' },
      pdf,
    );
    expect(up.status).toBe(201);
    expect(up.body.file.status).toBe('pending');
    expect(up.body.meeting).toBeNull();

    const made = await call('POST', '/meetings', {
      id,
      category: 'ccie',
      values: ccie(),
      file_ids: [up.body.file.id],
    });
    expect(made.body.meeting.files).toHaveLength(1);
    expect(made.body.meeting.files[0].name).toBe('Order sheet.pdf');
    expect(made.body.meeting.values.files).toBe(up.body.file.view_link);
    expect(made.body.meeting.rev).toBe(1);

    const stored = [...mock.world.files.values()].find(
      (f) => f.id === up.body.file.view_link.split('/')[4],
    );
    expect(stored?.name).toBe(`${ccie().date} — Sync check — Order sheet.pdf`);
    // Files are described in the calendar event too.
    const event = mock.world.calendars.get('primary')!.get(calendarEventIdFor(id))!;
    expect(event.description).toContain(up.body.file.view_link);
  });

  it('files it under the category and year', async () => {
    const { upload, mock } = await boot();
    const up = await upload(
      { meeting_id: newId(), category: 'ccie', date: '2027-03-04', title: 'X' },
      pdf,
    );
    const file = mock.world.files.get(up.body.file.view_link.split('/')[4])!;
    const year = mock.world.files.get(file.parents[0]!)!;
    const category = mock.world.files.get(year.parents[0]!)!;
    expect([category.name, year.name]).toEqual(['CCIE', '2027']);
  });

  it('refuses a kind of file that is not allowed, and one that is too big', async () => {
    const { upload } = await boot({ MAX_UPLOAD_MB: '1' });
    const bad = await upload(
      { meeting_id: newId(), category: 'ccie' },
      { name: 'run.exe', type: 'application/x-msdownload', bytes: 100 },
    );
    expect(bad.status).toBe(400);
    const big = await upload(
      { meeting_id: newId(), category: 'ccie' },
      { name: 'huge.pdf', type: 'application/pdf', bytes: 2 * 1024 * 1024 },
    );
    expect(big.status).toBe(413);
    expect(big.body.error.message).toContain('1 MB');
  });

  it('removing a file detaches it, clears the link and moves the Drive file to the trash', async () => {
    const { call, upload, mock } = await boot();
    const id = newId();
    await call('POST', '/meetings', { id, category: 'ccie', values: ccie() });
    const up = await upload({ meeting_id: id, category: 'ccie', attach: '1' }, pdf);
    expect(up.body.file.status).toBe('attached');
    expect(up.body.meeting.files).toHaveLength(1);

    const removed = await call('DELETE', `/files/${up.body.file.id}`);
    expect(removed.body.meeting.files).toHaveLength(0);
    expect(removed.body.meeting.values.files ?? '').toBe('');
    const drive = mock.world.files.get(up.body.file.view_link.split('/')[4])!;
    expect(drive.trashed).toBe(true);
    expect((await call('DELETE', `/files/${up.body.file.id}`)).status).toBe(404);
  });

  it('tells a restored draft which files are still waiting', async () => {
    const { call, upload } = await boot();
    const id = newId();
    const up = await upload({ meeting_id: id, category: 'ccie' }, pdf);
    await call('DELETE', `/files/${up.body.file.id}`);
    const other = await upload({ meeting_id: id, category: 'ccie' }, pdf);
    const r = await call(
      'GET',
      `/files/check?meeting_id=${id}&ids=${up.body.file.id},${other.body.file.id}`,
    );
    expect(r.body.ok).toEqual({ [up.body.file.id]: false, [other.body.file.id]: true });
  });

  it('a Drive outage does not break saving a meeting, and a failed upload leaves nothing behind', async () => {
    const { call, upload, mock } = await boot();
    mock.failures.set('drive');
    const up = await upload({ meeting_id: newId(), category: 'ccie' }, pdf);
    expect(up.status).toBe(503);
    mock.failures.clear();
    const made = await call('POST', '/meetings', { id: newId(), category: 'ccie', values: ccie() });
    expect(made.status).toBe(201);
  });
});
