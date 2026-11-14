import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { startServer, withSession, MUTATE, type TestServer } from './helpers';

let s: TestServer;
afterEach(() => s?.close());

const pdf = () =>
  new File([new Uint8Array(Buffer.from('%PDF-1.4 test'))], 'note.pdf', { type: 'application/pdf' });

function form(fields: Record<string, string>, file?: File): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (file) f.append('file', file);
  return f;
}
const valid = (id = newId()) => ({
  id,
  topic: 'Review meeting',
  date: '2026-11-20',
  start_time: '10:30',
  duration_min: '60',
});

async function post(cookie: string, body: FormData) {
  return s.get('/api/spike/meeting', { method: 'POST', body, ...withSession(cookie, MUTATE) });
}

async function ensureRows(tab: string) {
  const id = (await s.mock.state.read())!.activeSpreadsheetId!;
  const t = (await s.mock.services.sheets.getTabs(id)).find((x) => x.title === tab)!;
  return (await s.mock.services.sheets.batchGet(id, [t.gid]))[t.gid]!;
}

describe('working slice: App → Sheet → Calendar → Drive', () => {
  it('saves one meeting to the Sheet, Calendar and Drive, with a link back in the row', async () => {
    s = await startServer({ seed: 'empty' });
    const cookie = await s.signIn();
    const fields = valid();
    const res = await post(cookie, form(fields, pdf()));
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out).toMatchObject({ existing: false, calendar: 'ok' });
    expect(out.file.name).toBe('2026-11-20 — Review meeting — note.pdf');
    expect(out.file.viewLink).toContain('drive.mock.local');

    // Sheet row
    const rows = await ensureRows('Others');
    const headers = rows[0]!.map(String);
    const row = rows[1]!;
    const at = (k: string) => row[headers.indexOf(k)];
    expect(at('topic')).toBe('Review meeting');
    expect(at('date')).toBe('2026-11-20');
    expect(at('start_time')).toBe('10:30');
    expect(at('end_time')).toBe('11:30');
    expect(at('meeting_status')).toBe('Scheduled');
    expect(at('id')).toBe(fields.id);
    expect(at('calendar_sync')).toBe('ok');
    expect(String(at('calendar_event_id'))).toMatch(/^mm[0-9a-f]{32}$/);
    expect(at('files')).toBe(out.file.viewLink);
    expect(at('sr_no')).toBe(1);

    // Calendar event with reminders
    const event = s.mock.world.calendars.get('primary')!.get(String(at('calendar_event_id')))!;
    expect(event.summary).toBe('[Others] Review meeting');
    expect(event.start).toEqual({ dateTime: '2026-11-20T10:30:00', timeZone: 'Asia/Kolkata' });
    expect(event.reminders.overrides.map((o) => o.minutes)).toEqual([1440, 60]);

    // Drive: Meetings Manager / Others / 2026 / file
    const files = [...s.mock.world.files.values()];
    const uploaded = files.find((f) => f.name.endsWith('note.pdf'))!;
    expect(uploaded.size).toBe(Buffer.byteLength('%PDF-1.4 test'));
    const parent = files.find((f) => f.id === uploaded.parents[0])!;
    expect(parent.name).toBe('2026');
    expect(files.find((f) => f.id === parent.parents[0])!.name).toBe('Others');

    // _files
    const fileRows = await ensureRows('_files');
    expect(fileRows).toHaveLength(2);
    expect(fileRows[1]).toContain('attached');
  });

  it('works without a file', async () => {
    s = await startServer({ seed: 'empty' });
    const res = await post(await s.signIn(), form(valid()));
    expect(res.status).toBe(201);
    expect((await res.json()).file).toBeUndefined();
  });

  it('saving the same meeting twice makes one row and one event', async () => {
    s = await startServer({ seed: 'empty' });
    const cookie = await s.signIn();
    const fields = valid();
    const first = await post(cookie, form(fields));
    const second = await post(cookie, form(fields));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json()).existing).toBe(true);
    expect(await ensureRows('Others')).toHaveLength(2);
    expect(s.mock.world.calendars.get('primary')!.size).toBe(1);
  });

  it('numbers meetings one after another', async () => {
    s = await startServer({ seed: 'empty' });
    const cookie = await s.signIn();
    await post(cookie, form(valid()));
    await post(cookie, form(valid()));
    const rows = await ensureRows('Others');
    const sr = rows[0]!.indexOf('sr_no');
    expect(rows.slice(1).map((r) => r[sr])).toEqual([1, 2]);
  });

  it('a Calendar failure still saves the meeting and marks it for retry', async () => {
    s = await startServer({ seed: 'empty' });
    const cookie = await s.signIn();
    s.mock.failures.set('calendar');
    const res = await post(cookie, form(valid()));
    expect(res.status).toBe(201);
    expect((await res.json()).calendar).toBe('error');
    const rows = await ensureRows('Others');
    const headers = rows[0]!.map(String);
    expect(rows[1]![headers.indexOf('calendar_sync')]).toBe('error');
    expect(rows[1]![headers.indexOf('topic')]).toBe('Review meeting');
    expect(s.mock.world.calendars.get('primary')?.size ?? 0).toBe(0);
  });

  it('a Drive failure still saves the meeting and the Calendar event', async () => {
    s = await startServer({ seed: 'empty' });
    const cookie = await s.signIn();
    s.mock.failures.set('drive');
    const res = await post(cookie, form(valid(), pdf()));
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.calendar).toBe('ok');
    expect(out.file).toBeUndefined();
    expect(out.fileError).toBeTruthy();
    expect(await ensureRows('Others')).toHaveLength(2);
  });

  it('a Sheets failure shows a plain message, not a stack trace', async () => {
    s = await startServer({ seed: 'empty' });
    const cookie = await s.signIn();
    // The mock fails calls outright (the live adapter does the retrying); this checks what the person is told.
    s.mock.failures.set('sheets429');
    const res = await post(cookie, form(valid()));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /try again/,
    );
  });
});

describe('input checks, in plain words', () => {
  const cases: [string, Record<string, string>, RegExp][] = [
    ['empty topic', { ...valid(), topic: '  ' }, /add a topic/],
    ['bad date', { ...valid(), date: '2026-13-45' }, /valid date/],
    ['bad time', { ...valid(), start_time: '25:00' }, /valid start time/],
    ['bad length', { ...valid(), duration_min: '5' }, /between 15 minutes and 8 hours/],
    ['made-up id', { ...valid(), id: 'not-a-ulid' }, /out of date/],
  ];
  for (const [name, fields, message] of cases) {
    it(`rejects ${name}`, async () => {
      s = await startServer({ seed: 'empty' });
      const res = await post(await s.signIn(), form(fields));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(message);
      expect(await ensureRows('Others').catch(() => [[]])).toHaveLength(1);
    });
  }

  it('refuses a file type that is not allowed and saves nothing', async () => {
    s = await startServer({ seed: 'empty' });
    const exe = new File([new Uint8Array([77, 90])], 'run.exe', {
      type: 'application/x-msdownload',
    });
    const res = await post(await s.signIn(), form(valid(), exe));
    expect(res.status).toBe(415);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/PDF/);
  });

  it('refuses an upload without the CSRF header or a session', async () => {
    s = await startServer({ seed: 'empty' });
    const cookie = await s.signIn();
    expect(
      (
        await s.get('/api/spike/meeting', {
          method: 'POST',
          body: form(valid()),
          ...withSession(cookie),
        })
      ).status,
    ).toBe(403);
    expect(
      (await s.get('/api/spike/meeting', { method: 'POST', body: form(valid()), headers: MUTATE }))
        .status,
    ).toBe(401);
  });

  it('says the app is not set up before the owner has signed in', async () => {
    s = await startServer({ seed: 'demo' });
    const cookie = await s.signIn();
    await s.mock.state.write({ jobs: {} });
    const res = await post(cookie, form(valid()));
    expect(res.status).toBe(503);
  });

  it('refuses a file over the size limit before reading it', async () => {
    s = await startServer({ seed: 'empty' }, { MAX_UPLOAD_MB: '1' });
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    const res = await post(await s.signIn(), form(valid(), big));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /limit is 1 MB/,
    );
  });
});
