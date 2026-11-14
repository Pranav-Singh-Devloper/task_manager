import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { fieldToRow } from '../../shared/schema';
import type { FieldDef } from '../../shared/types';
import {
  ConflictError,
  NotFoundError,
  UndoUnavailableError,
  ValidationFailed,
} from '../../server/lib/errors';
import { MeetingService, canTransition, type Actor } from '../../server/services/meetings';
import { UndoService } from '../../server/services/undo';
import { fixture, type Fixture } from './store-helpers';

const dad: Actor = { email: 'dad@example.com', source: 'app' };

async function setup() {
  const f = await fixture();
  const undo = new UndoService(() => f.clock.now);
  const meetings = new MeetingService(f.store, undo);
  return { f, meetings, undo };
}

const ccie = (over: Record<string, unknown> = {}) => ({
  date: '2026-12-01',
  start_time: '10:30',
  case_id: 'C-101',
  project_name: 'NH-44 Four Laning',
  state: 'Madhya Pradesh',
  ...over,
});
const make = (m: MeetingService, category = 'ccie', values: Record<string, unknown> = ccie()) =>
  m.create({ id: newId(), category, values }, dad);

async function rowsOf(f: Fixture, tab: string) {
  const t = await f.tab(tab);
  return { ...t, at: (row: number, key: string) => t.rows[row - 1]?.[t.headers.indexOf(key)] };
}

describe('create', () => {
  it('saves a CCIE meeting with everything the app fills in', async () => {
    const { f, meetings } = await setup();
    const { meeting, existing, undoToken } = await make(meetings);

    expect(existing).toBe(false);
    expect(undoToken).toBeTruthy();
    expect(meeting.rev).toBe(1);
    expect(meeting.title).toBe('CCIE — NH-44 Four Laning (C-101)');
    expect(meeting.values).toMatchObject({
      date: '2026-12-01',
      start_time: '10:30',
      end_time: '11:30',
      meeting_status: 'Scheduled',
      workspace: 'nhai',
      sr_no: 5,
    });
    expect(meeting.calendar_sync).toBe('pending');
    expect(meeting.created_by).toBe('dad@example.com');

    const t = await rowsOf(f, 'CCIE');
    const last = t.rows.length;
    expect(t.at(last, 'id')).toBe(meeting.id);
    expect(t.at(last, 'end_time')).toBe('11:30');
    expect(t.at(last, 'pendency_months')).toBe(''); // computed columns are not stored
  });

  it('works out the calculated columns', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings, 'ccie', ccie({ date_of_initiation: '2025-02-10' }));
    expect(meeting.computed.numbers_of_meeting).toBe(4); // the 3 sittings of C-101 plus this one
    expect(meeting.computed.pendency_months).toBeGreaterThanOrEqual(20);
    const settled = await make(
      meetings,
      'ccie',
      ccie({ date_of_initiation: '2025-02-10', date_of_final_settlement_agreement: '2025-12-10' }),
    );
    expect(settled.meeting.computed.pendency_months).toBe(10);
  });

  it('saving twice with the same id gives one row', async () => {
    const { f, meetings } = await setup();
    const id = newId();
    const first = await meetings.create({ id, category: 'ccie', values: ccie() }, dad);
    const second = await meetings.create({ id, category: 'ccie', values: ccie() }, dad);
    expect(first.existing).toBe(false);
    expect(second.existing).toBe(true);
    expect(second.meeting.id).toBe(first.meeting.id);
    expect((await rowsOf(f, 'CCIE')).rows).toHaveLength(6); // header + 4 demo + 1
  });

  it('two saves at the same moment still give one row', async () => {
    const { f, meetings } = await setup();
    const id = newId();
    const results = await Promise.all(
      [1, 2, 3].map(() => meetings.create({ id, category: 'ccie', values: ccie() }, dad)),
    );
    expect(results.filter((r) => !r.existing)).toHaveLength(1);
    expect((await rowsOf(f, 'CCIE')).rows).toHaveLength(6);
  });

  it('refuses a meeting with missing details, in plain words, and writes nothing', async () => {
    const { f, meetings } = await setup();
    const err = await make(meetings, 'ccie', { date: '2026-12-01', start_time: '10:30' }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ValidationFailed);
    expect(err.message).toBe('2 things need your attention.');
    expect(err.issues.map((i: { message: string }) => i.message)).toEqual([
      'Please fill in Case Id.',
      'Please fill in Project Name.',
    ]);
    expect((await rowsOf(f, 'CCIE')).rows).toHaveLength(5);
  });

  it('refuses an id that is not a ULID and an unknown category', async () => {
    const { meetings } = await setup();
    await expect(
      meetings.create({ id: 'nope', category: 'ccie', values: ccie() }, dad),
    ).rejects.toThrow(/out of date/);
    await expect(
      meetings.create({ id: newId(), category: 'ghost', values: ccie() }, dad),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('always starts as Scheduled, whatever is sent', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings, 'others', {
      date: '2026-12-01',
      start_time: '10:00',
      topic: 'X',
      meeting_status: 'Completed',
    });
    expect(meeting.values.meeting_status).toBe('Scheduled');
  });

  it('will not make a default end time past midnight', async () => {
    const { meetings } = await setup();
    const err = await make(meetings, 'others', {
      date: '2026-12-01',
      start_time: '23:30',
      topic: 'Late',
    }).catch((e) => e);
    expect(err.issues[0].message).toMatch(/before midnight/);
    const ok = await make(meetings, 'others', {
      date: '2026-12-01',
      start_time: '23:30',
      end_time: '23:45',
      topic: 'Late',
    });
    expect(ok.meeting.values.end_time).toBe('23:45');
  });

  it('numbers each category on its own and never reuses a number', async () => {
    const { meetings } = await setup();
    const a = await make(meetings, 'others', {
      date: '2026-12-01',
      start_time: '10:00',
      topic: 'A',
    });
    const b = await make(meetings, 'others', {
      date: '2026-12-02',
      start_time: '10:00',
      topic: 'B',
    });
    await meetings.remove(b.meeting.id, b.meeting.rev, dad);
    const c = await make(meetings, 'others', {
      date: '2026-12-03',
      start_time: '10:00',
      topic: 'C',
    });
    expect([a, b, c].map((r) => r.meeting.values.sr_no)).toEqual([2, 3, 4]);
  });

  it('is written to the change log with the field values', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const log = await rowsOf(f, '_audit');
    const row = log.rows.findIndex((r) => r[log.headers.indexOf('row_id')] === meeting.id) + 1;
    expect(log.at(row, 'action')).toBe('create');
    expect(log.at(row, 'user_email')).toBe('dad@example.com');
    expect(log.at(row, 'table')).toBe('CCIE');
    expect(JSON.parse(String(log.at(row, 'changes'))).case_id).toEqual([null, 'C-101']);
  });
});

describe('a field added to the config changes validation, the Sheet and the API with no code change', () => {
  const venue = (over: Partial<FieldDef> = {}): FieldDef => ({
    category_slug: 'others',
    key: 'venue',
    label: 'Venue',
    type: 'select',
    required: true,
    options: ['Room 1', 'Room 2'],
    allow_new_options: false,
    default_value: '',
    help_text: '',
    placeholder: '',
    unit: '',
    order: 100,
    show_in_form: true,
    show_in_table: false,
    searchable: true,
    case_key: false,
    computed_expr: '',
    locked: false,
    archived: false,
    created_at: '',
    ...over,
  });

  it('is enforced, written to a new column, and returned', async () => {
    const { f, meetings } = await setup();
    const fields = await f.tab('_fields');
    await f.mock.services.sheets.appendRows(f.spreadsheetId, fields.gid, [fieldToRow(venue())]);
    await f.store.refresh();

    const base = { date: '2026-12-05', start_time: '10:00', topic: 'Review' };
    const missing = await make(meetings, 'others', base).catch((e) => e);
    expect(missing.issues).toEqual([{ field: 'venue', message: 'Please choose Venue.' }]);
    const wrong = await make(meetings, 'others', { ...base, venue: 'Room 9' }).catch((e) => e);
    expect(wrong.issues[0].message).toBe('Venue: "Room 9" is not one of the choices.');

    const { meeting } = await make(meetings, 'others', { ...base, venue: 'room 2' });
    expect(meeting.values.venue).toBe('Room 2');
    const t = await rowsOf(f, 'Others');
    expect(t.headers).toContain('venue');
    expect(t.at(t.rows.length, 'venue')).toBe('Room 2');
  });
});

describe('update', () => {
  it('changes fields, raises the rev and logs old and new values', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const { meeting: after, undoToken } = await meetings.update(
      meeting.id,
      { remarks: 'Bring the file', state: 'Kerala' },
      meeting.rev,
      dad,
    );

    expect(after.rev).toBe(2);
    expect(after.values.remarks).toBe('Bring the file');
    expect(after.values.state).toBe('Kerala');
    expect(after.updated_at >= meeting.updated_at).toBe(true);
    expect(undoToken).toBeTruthy();

    const log = await rowsOf(f, '_audit');
    const idx = log.rows
      .map((r, i) =>
        r[log.headers.indexOf('row_id')] === meeting.id &&
        r[log.headers.indexOf('action')] === 'update'
          ? i
          : -1,
      )
      .filter((i) => i >= 0)[0]!;
    expect(JSON.parse(String(log.rows[idx]![log.headers.indexOf('changes')]))).toEqual({
      remarks: [null, 'Bring the file'],
      state: ['Madhya Pradesh', 'Kerala'],
    });
  });

  it('a change that changes nothing is not saved', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.update(meeting.id, { state: 'Madhya Pradesh' }, meeting.rev, dad);
    expect(r.meeting.rev).toBe(1);
    expect(r.undoToken).toBeNull();
  });

  it('refuses a stale rev with a 409 and changes nothing', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    await meetings.update(meeting.id, { remarks: 'first' }, 1, dad);
    const err = await meetings.update(meeting.id, { remarks: 'second' }, 1, dad).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.status).toBe(409);
    expect(err.message).toBe(
      'This meeting was changed somewhere else. Please reload it and try again.',
    );
    expect((await meetings.get(meeting.id)).values.remarks).toBe('first');
    expect((await rowsOf(f, 'CCIE')).rows).toHaveLength(6);
  });

  it('two edits at the same moment: one wins and one gets a 409', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const results = await Promise.allSettled([
      meetings.update(meeting.id, { remarks: 'A' }, 1, dad),
      meetings.update(meeting.id, { remarks: 'B' }, 1, dad),
      meetings.update(meeting.id, { remarks: 'C' }, 1, dad),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictError);
    expect((await meetings.get(meeting.id)).rev).toBe(2);
  });

  it('notices a change made in the Sheet since the app last looked', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const t = await f.tab('CCIE');
    const rowNo = t.rows.findIndex((r) => r[t.headers.indexOf('id')] === meeting.id) + 1;
    const row = [...t.rows[rowNo - 1]!];
    row[t.headers.indexOf('rev')] = 5;
    await f.mock.services.sheets.updateRow(f.spreadsheetId, t.gid, rowNo, row);
    await expect(meetings.update(meeting.id, { remarks: 'x' }, 1, dad)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('keeps columns the owner added by hand', async () => {
    const { f, meetings } = await setup();
    const others = await f.tab('Others');
    // The Sheet trims trailing blanks from a row, so pad it to the header before adding the extra cell.
    const padded = others.headers.map((_, i) => others.rows[1]![i] ?? '');
    await f.mock.services.sheets.updateRows(f.spreadsheetId, others.gid, 1, [
      [...others.headers, 'My notes'],
      [...padded, 'keep this'],
    ]);
    await f.store.refresh();
    const m = (await meetings.list({ category: 'others' }))[0]!;
    await meetings.update(m.id, { remarks: 'changed' }, m.rev, dad);
    const after = await rowsOf(f, 'Others');
    expect(after.at(2, 'My notes')).toBe('keep this');
    expect(after.at(2, 'remarks')).toBe('changed');
  });

  it('finds the right row after the owner sorted the Sheet', async () => {
    const { f, meetings } = await setup();
    const all = await meetings.list({ category: 'ccie' });
    const target = all[0]!;
    const t = await f.tab('CCIE');
    await f.mock.services.sheets.updateRows(f.spreadsheetId, t.gid, 1, [
      t.rows[0]!,
      ...t.rows.slice(1).reverse(),
    ]);

    const r = await meetings.update(target.id, { remarks: 'after the sort' }, target.rev, dad);
    expect(r.meeting.values.remarks).toBe('after the sort');
    const after = await f.tab('CCIE');
    const rows = after.rows.slice(1);
    const changed = rows.filter((x) => x[after.headers.indexOf('remarks')] === 'after the sort');
    expect(changed).toHaveLength(1);
    expect(changed[0]![after.headers.indexOf('id')]).toBe(target.id);
  });

  it('enforces required fields when a row that lacks them is edited (rule 14)', async () => {
    const { f, meetings } = await setup();
    const t = await f.tab('CCIE');
    const row = [...t.rows[1]!];
    row[t.headers.indexOf('project_name')] = '';
    await f.mock.services.sheets.updateRow(f.spreadsheetId, t.gid, 2, row);
    await f.store.refresh();
    const m = (await meetings.list({ category: 'ccie' })).find(
      (x) => x.values.project_name === null,
    )!;
    expect(m.incomplete).toEqual(['project_name']);
    const err = await meetings.update(m.id, { remarks: 'x' }, m.rev, dad).catch((e) => e);
    expect(err.issues).toEqual([
      { field: 'project_name', message: 'Please fill in Project Name.' },
    ]);
    const ok = await meetings.update(m.id, { remarks: 'x', project_name: 'Fixed' }, m.rev, dad);
    expect(ok.meeting.incomplete).toEqual([]);
  });

  it('ignores fields it manages itself', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.update(
      meeting.id,
      { sr_no: 99, pendency_months: 5, remarks: 'ok' },
      1,
      dad,
    );
    expect(r.meeting.values.sr_no).toBe(meeting.values.sr_no);
  });

  it('refuses to edit a meeting that is in the Trash', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    await meetings.remove(meeting.id, 1, dad);
    await expect(meetings.update(meeting.id, { remarks: 'x' }, 2, dad)).rejects.toThrow(/Trash/);
  });

  it('says so when the meeting does not exist', async () => {
    const { meetings } = await setup();
    await expect(meetings.update(newId(), { remarks: 'x' }, 1, dad)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(meetings.get(newId())).rejects.toThrow("We couldn't find that meeting.");
  });
});

describe('reschedule', () => {
  it('moves the meeting, keeps its length, marks it Rescheduled and logs old and new times', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const { meeting: moved } = await meetings.reschedule(
      meeting.id,
      { date: '2026-12-08', start_time: '14:00', reason: 'Officer unavailable', rev: 1 },
      dad,
    );
    expect(moved.values).toMatchObject({
      date: '2026-12-08',
      start_time: '14:00',
      end_time: '15:00',
      meeting_status: 'Rescheduled',
    });
    expect(moved.rev).toBe(2);
    expect(moved.calendar_sync).toBe('pending');

    const log = await rowsOf(f, '_reschedules');
    const row = log.rows.findIndex((r) => r[log.headers.indexOf('meeting_id')] === meeting.id) + 1;
    expect(log.at(row, 'old_date')).toBe('2026-12-01');
    expect(log.at(row, 'old_start')).toBe('10:30');
    expect(log.at(row, 'old_end')).toBe('11:30');
    expect(log.at(row, 'new_date')).toBe('2026-12-08');
    expect(log.at(row, 'new_start')).toBe('14:00');
    expect(log.at(row, 'new_end')).toBe('15:00');
    expect(log.at(row, 'reason')).toBe('Officer unavailable');
    expect(log.at(row, 'source')).toBe('app');
  });

  it('any change of date or time is a reschedule, even from the plain edit form', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.update(meeting.id, { date: '2026-12-02' }, 1, dad);
    expect(r.meeting.values.meeting_status).toBe('Rescheduled');
    expect((await rowsOf(f, '_reschedules')).rows.some((x) => x[1] === meeting.id)).toBe(true);
  });

  it('takes an explicit end time', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const { meeting: m } = await meetings.reschedule(
      meeting.id,
      { date: '2026-12-02', start_time: '09:00', end_time: '12:00', rev: 1 },
      dad,
    );
    expect(m.values.end_time).toBe('12:00');
  });

  it('will not push the end past midnight', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const err = await meetings
      .reschedule(meeting.id, { date: '2026-12-02', start_time: '23:30', rev: 1 }, dad)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationFailed);
    expect(err.issues[0]).toMatchObject({ field: 'end_time' });
    expect(err.issues[0].message).toMatch(/before midnight/);
  });

  it('asks for confirmation before moving a meeting that is already done', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const done = await meetings.setStatus(meeting.id, 'Completed', 1, dad);
    const err = await meetings
      .reschedule(
        meeting.id,
        { date: '2026-12-09', start_time: '10:30', rev: done.meeting.rev },
        dad,
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationFailed);
    expect(err.issues[0].message).toMatch(/already marked done/);
    const ok = await meetings.reschedule(
      meeting.id,
      { date: '2026-12-09', start_time: '10:30', rev: done.meeting.rev, confirmCompleted: true },
      dad,
    );
    expect(ok.meeting.values.meeting_status).toBe('Completed');
  });
});

describe('status', () => {
  it('follows the allowed moves', () => {
    expect(canTransition('Scheduled', 'Completed')).toBe(true);
    expect(canTransition('Rescheduled', 'Cancelled')).toBe(true);
    expect(canTransition('Completed', 'Scheduled')).toBe(true); // reopen
    expect(canTransition('Cancelled', 'Scheduled')).toBe(true); // restore
    expect(canTransition('Completed', 'Cancelled')).toBe(false);
    expect(canTransition('Cancelled', 'Completed')).toBe(false);
    expect(canTransition('Scheduled', 'Rescheduled')).toBe(false); // only ever automatic
    expect(canTransition('Scheduled', 'Scheduled')).toBe(true);
  });

  it('cancel, then bring back', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const cancelled = await meetings.setStatus(meeting.id, 'Cancelled', 1, dad);
    expect(cancelled.meeting.values.meeting_status).toBe('Cancelled');
    expect(cancelled.meeting.calendar_sync).toBe('pending');
    const back = await meetings.setStatus(meeting.id, 'Scheduled', 2, dad);
    expect(back.meeting.values.meeting_status).toBe('Scheduled');
  });

  it('refuses a move that is not allowed', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const done = await meetings.setStatus(meeting.id, 'Completed', 1, dad);
    const err = await meetings
      .setStatus(meeting.id, 'Cancelled', done.meeting.rev, dad)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationFailed);
    expect(err.issues).toEqual([
      { field: 'meeting_status', message: 'That change of status is not possible.' },
    ]);
    await expect(
      meetings.setStatus(meeting.id, 'Rescheduled', done.meeting.rev, dad),
    ).rejects.toBeInstanceOf(ValidationFailed);
  });
});

describe('delete and restore', () => {
  it('deleting hides the meeting but keeps the row; restoring brings it back', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const removed = await meetings.remove(meeting.id, 1, dad);
    expect(removed.meeting.deleted_at).toBeTruthy();
    expect((await meetings.list({ category: 'ccie' })).some((m) => m.id === meeting.id)).toBe(
      false,
    );
    expect((await meetings.list({ deleted: 'only' })).map((m) => m.id)).toEqual([meeting.id]);
    expect((await rowsOf(f, 'CCIE')).rows).toHaveLength(6); // still in the Sheet

    const back = await meetings.restore(meeting.id, dad);
    expect(back.meeting.deleted_at).toBeNull();
    expect((await meetings.list({ category: 'ccie' })).some((m) => m.id === meeting.id)).toBe(true);
  });

  it('deleting twice, or restoring something that is not deleted, changes nothing', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    expect((await meetings.restore(meeting.id, dad)).undoToken).toBeNull();
    const first = await meetings.remove(meeting.id, 1, dad);
    const again = await meetings.remove(meeting.id, first.meeting.rev, dad);
    expect(again.meeting.rev).toBe(first.meeting.rev);
  });

  it('deleted meetings are not counted in a case', async () => {
    const { meetings } = await setup();
    const a = await make(meetings, 'ccie', ccie({ case_id: 'C-777' }));
    expect(a.meeting.computed.numbers_of_meeting).toBe(1);
    const b = await make(meetings, 'ccie', ccie({ case_id: 'C-777' }));
    expect(b.meeting.computed.numbers_of_meeting).toBe(2);
    await meetings.remove(a.meeting.id, a.meeting.rev, dad);
    expect((await meetings.get(b.meeting.id)).computed.numbers_of_meeting).toBe(1);
  });
});

describe('listing', () => {
  it('upcoming is oldest first, past is newest first, and they do not overlap', async () => {
    const { meetings } = await setup();
    const up = await meetings.list({ scope: 'upcoming' });
    const past = await meetings.list({ scope: 'past' });
    const key = (m: { values: Record<string, unknown> }) =>
      `${m.values.date} ${m.values.start_time}`;
    expect(up.length).toBeGreaterThan(5);
    expect(past.length).toBeGreaterThan(2);
    expect([...up].map(key)).toEqual([...up].map(key).sort());
    expect([...past].map(key)).toEqual([...past].map(key).sort().reverse());
    const ids = new Set(up.map((m) => m.id));
    expect(past.some((m) => ids.has(m.id))).toBe(false);
  });

  it('filters by category, workspace and status', async () => {
    const { meetings } = await setup();
    expect(
      (await meetings.list({ category: 'ccie' })).every((m) => m.category_slug === 'ccie'),
    ).toBe(true);
    expect((await meetings.list({ workspace: 'phd' })).map((m) => m.category_slug).sort()).toEqual([
      'phd_milestone',
      'supervisor_meeting',
    ]);
    expect(
      (await meetings.list({ status: 'Completed' })).every(
        (m) => m.values.meeting_status === 'Completed',
      ),
    ).toBe(true);
  });

  it('reads a meeting by id and links a series with previous_id', async () => {
    const { meetings } = await setup();
    const third = (await meetings.list({ category: 'ccie' })).find((m) => m.previous_id)!;
    expect((await meetings.get(third.id)).previous_id).toBe(third.previous_id);
  });
});

describe('undo', () => {
  it('puts back the old values of a change, as a new change that is logged', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const { undoToken } = await meetings.update(
      meeting.id,
      { remarks: 'oops', state: 'Kerala' },
      1,
      dad,
    );
    const undone = await meetings.undoChange(undoToken!, dad);
    expect(undone.label).toBe('Meeting changed');
    expect(undone.meeting.values.remarks).toBeNull();
    expect(undone.meeting.values.state).toBe('Madhya Pradesh');
    expect(undone.meeting.rev).toBe(3); // undo is itself a change

    const log = await rowsOf(f, '_audit');
    const entries = log.rows
      .filter((r) => r[log.headers.indexOf('row_id')] === meeting.id)
      .map((r) => `${r[log.headers.indexOf('action')]}/${r[log.headers.indexOf('source')]}`);
    expect(entries).toEqual(['create/app', 'update/app', 'undo/undo']);
  });

  it('undoing a move puts back the time and the status, and logs it with source "undo"', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const moved = await meetings.reschedule(
      meeting.id,
      { date: '2026-12-08', start_time: '14:00', rev: 1 },
      dad,
    );
    const undone = await meetings.undoChange(moved.undoToken!, dad);
    expect(undone.label).toBe('Meeting moved');
    expect(undone.meeting.values).toMatchObject({
      date: '2026-12-01',
      start_time: '10:30',
      end_time: '11:30',
      meeting_status: 'Scheduled',
    });

    const log = await rowsOf(f, '_reschedules');
    const sources = log.rows
      .filter((r) => r[log.headers.indexOf('meeting_id')] === meeting.id)
      .map((r) => r[log.headers.indexOf('source')]);
    expect(sources).toEqual(['app', 'undo']);
  });

  it('undoing a cancel brings the meeting back to its earlier status', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const { undoToken } = await meetings.setStatus(meeting.id, 'Cancelled', 1, dad);
    expect((await meetings.undoChange(undoToken!, dad)).meeting.values.meeting_status).toBe(
      'Scheduled',
    );
  });

  it('undoing a create removes the meeting (into Trash)', async () => {
    const { meetings } = await setup();
    const { meeting, undoToken } = await make(meetings);
    const undone = await meetings.undoChange(undoToken!, dad);
    expect(undone.meeting.deleted_at).toBeTruthy();
    expect((await meetings.list({ category: 'ccie' })).some((m) => m.id === meeting.id)).toBe(
      false,
    );
  });

  it('undoing a delete restores, and undoing a restore deletes again', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const removed = await meetings.remove(meeting.id, 1, dad);
    const restored = await meetings.undoChange(removed.undoToken!, dad);
    expect(restored.meeting.deleted_at).toBeNull();
    const again = await meetings.remove(meeting.id, restored.meeting.rev, dad);
    const back = await meetings.restore(meeting.id, dad);
    expect((await meetings.undoChange(back.undoToken!, dad)).meeting.deleted_at).toBeTruthy();
    expect(again.meeting.deleted_at).toBeTruthy();
  });

  it('is refused if the meeting has changed since', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const first = await meetings.update(meeting.id, { remarks: 'one' }, 1, dad);
    await meetings.update(meeting.id, { remarks: 'two' }, 2, dad);
    const err = await meetings.undoChange(first.undoToken!, dad).catch((e) => e);
    expect(err).toBeInstanceOf(UndoUnavailableError);
    expect(err.message).toBe("This can't be undone because the meeting has changed since.");
    expect((await meetings.get(meeting.id)).values.remarks).toBe('two');
  });

  it('works once, and only for ten minutes', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    const a = await meetings.update(meeting.id, { remarks: 'a' }, 1, dad);
    await meetings.undoChange(a.undoToken!, dad);
    await expect(meetings.undoChange(a.undoToken!, dad)).rejects.toBeInstanceOf(
      UndoUnavailableError,
    );

    const b = await meetings.update(meeting.id, { remarks: 'b' }, 3, dad);
    f.clock.advance(10 * 60 * 1000 + 1000);
    await expect(meetings.undoChange(b.undoToken!, dad)).rejects.toThrow(/10 minutes/);
  });

  it('only the person who made the change can undo it, and a made-up token fails', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.update(meeting.id, { remarks: 'a' }, 1, dad);
    await expect(
      meetings.undoChange(r.undoToken!, { email: 'someone@else.com', source: 'app' }),
    ).rejects.toBeInstanceOf(UndoUnavailableError);
    await expect(meetings.undoChange('made-up', dad)).rejects.toBeInstanceOf(UndoUnavailableError);
  });
});

describe('history', () => {
  it('lists the change log and the reschedules of one meeting', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    await meetings.reschedule(
      meeting.id,
      { date: '2026-12-08', start_time: '14:00', reason: 'Clash', rev: 1 },
      dad,
    );
    const h = await meetings.history(meeting.id);
    expect(h.audit.map((a) => a.action)).toEqual(['create', 'update']);
    expect(h.reschedules).toHaveLength(1);
    expect(h.reschedules[0]).toMatchObject({
      old_date: '2026-12-01',
      new_date: '2026-12-08',
      reason: 'Clash',
    });
  });
});
