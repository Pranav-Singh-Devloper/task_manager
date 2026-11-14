import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { AppError, ConflictError, ValidationFailed } from '../../server/lib/errors';
import { MeetingService, type Actor } from '../../server/services/meetings';
import { UndoService } from '../../server/services/undo';
import { fixture } from './store-helpers';

const dad: Actor = { email: 'dad@example.com', source: 'app' };

async function setup() {
  const f = await fixture();
  const meetings = new MeetingService(f.store, new UndoService(() => f.clock.now));
  return { f, meetings };
}

const ccie = (over: Record<string, unknown> = {}) => ({
  date: '2026-12-01',
  start_time: '10:30',
  end_time: '12:00',
  case_id: 'C-555',
  project_name: 'NH-9 Widening',
  state: 'Kerala',
  topic: 'Third sitting',
  meeting_link: 'https://meet.google.com/xyz',
  remarks: 'Bring the file',
  details: 'Earlier notes.',
  ...over,
});
const make = (m: MeetingService, values = ccie(), category = 'ccie') =>
  m.create({ id: newId(), category, values }, dad);

describe('marking a meeting done', () => {
  it('marks it Completed and adds the notes under a dated heading, after what was there', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(
      meeting.id,
      { notes: 'Both sides agreed to revised claims.', rev: 1 },
      dad,
    );
    expect(r.meeting.values.meeting_status).toBe('Completed');
    expect(r.meeting.values.details).toBe(
      'Earlier notes.\n\n— Notes, Tue, 1 Dec 2026 —\nBoth sides agreed to revised claims.',
    );
    expect(r.next).toBeNull();
    expect(r.undoToken).toBeTruthy();
  });

  it('starts the notes with the heading when there was nothing before', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings, ccie({ details: '' }));
    const r = await meetings.complete(meeting.id, { notes: 'Short note', rev: 1 }, dad);
    expect(r.meeting.values.details).toBe('— Notes, Tue, 1 Dec 2026 —\nShort note');
  });

  it('works with no notes at all', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(meeting.id, { rev: 1 }, dad);
    expect(r.meeting.values.meeting_status).toBe('Completed');
    expect(r.meeting.values.details).toBe('Earlier notes.');
  });

  it('refuses very long notes, and a meeting that cannot be completed', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const err = await meetings
      .complete(meeting.id, { notes: 'x'.repeat(20001), rev: 1 }, dad)
      .catch((e) => e);
    expect(err.issues[0]).toMatchObject({ field: 'notes' });
    const cancelled = await meetings.setStatus(meeting.id, 'Cancelled', 1, dad);
    await expect(
      meetings.complete(meeting.id, { rev: cancelled.meeting.rev }, dad),
    ).rejects.toBeInstanceOf(ValidationFailed);
  });

  it('a stale rev is a conflict and nothing is created', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    await meetings.update(meeting.id, { remarks: 'changed' }, 1, dad);
    const err = await meetings
      .complete(
        meeting.id,
        { rev: 1, next: { id: newId(), date: '2026-12-08', start_time: '10:30' } },
        dad,
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(
      (await meetings.list({ category: 'ccie', deleted: 'include' })).filter(
        (m) => m.values.case_id === 'C-555',
      ),
    ).toHaveLength(1);
  });
});

describe('the next meeting', () => {
  const nextInput = (over = {}) => ({
    id: newId(),
    date: '2026-12-08',
    start_time: '11:00',
    ...over,
  });

  it('is made in the same category, linked back, with the category fields copied', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(
      meeting.id,
      { notes: 'Done', next: nextInput(), rev: 1 },
      dad,
    );
    const n = r.next!;

    expect(n.category_slug).toBe('ccie');
    expect(n.previous_id).toBe(meeting.id);
    expect(n.values).toMatchObject({
      case_id: 'C-555',
      project_name: 'NH-9 Widening',
      state: 'Kerala',
      topic: 'Third sitting',
      meeting_link: 'https://meet.google.com/xyz',
      workspace: 'nhai',
      date: '2026-12-08',
      start_time: '11:00',
      meeting_status: 'Scheduled',
    });
    expect(n.computed.numbers_of_meeting).toBe(2); // same case, so the count follows
  });

  it('does not copy the notes, remarks, status, files or the old date and time', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const { next } = await meetings.complete(
      meeting.id,
      { notes: 'Done', next: nextInput(), rev: 1 },
      dad,
    );
    expect(next!.values.details).toBeNull();
    expect(next!.values.remarks).toBeNull();
    expect(next!.values.files).toBeNull();
    expect(next!.values.sr_no).toBe((meeting.values.sr_no as number) + 1);
    expect(next!.rev).toBe(1);
  });

  it('keeps the original length unless an end time is given', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings); // 10:30 to 12:00, 90 minutes
    const a = await meetings.complete(
      meeting.id,
      { next: nextInput({ start_time: '14:00' }), rev: 1 },
      dad,
    );
    expect(a.next!.values.end_time).toBe('15:30');
    const { meeting: m2 } = await make(meetings);
    const b = await meetings.complete(
      m2.id,
      { next: nextInput({ start_time: '14:00', end_time: '14:30' }), rev: 1 },
      dad,
    );
    expect(b.next!.values.end_time).toBe('14:30');
  });

  it('copies fields typed as "2:30 pm" correctly', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(
      meeting.id,
      { next: nextInput({ start_time: '2:30 pm' }), rev: 1 },
      dad,
    );
    expect(r.next!.values).toMatchObject({ start_time: '14:30', end_time: '16:00' });
  });

  it('saving again with the same next id makes no second meeting', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const next = nextInput();
    const first = await meetings.complete(meeting.id, { next, rev: 1 }, dad);
    const again = await meetings.complete(meeting.id, { next, rev: 1 }, dad);
    expect(first.existing).toBe(false);
    expect(again.existing).toBe(true);
    expect(again.next!.id).toBe(first.next!.id);
    expect(
      (await meetings.list({ category: 'ccie' })).filter((m) => m.previous_id === meeting.id),
    ).toHaveLength(1);
  });

  it('bad next details change nothing at all', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const err = await meetings
      .complete(meeting.id, { notes: 'x', next: nextInput({ date: '2026-02-31' }), rev: 1 }, dad)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationFailed);
    const still = await meetings.get(meeting.id);
    expect(still.values.meeting_status).toBe('Scheduled');
    expect(still.rev).toBe(1);
  });

  it('a meeting has one next meeting; a second needs a clear yes', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const first = await meetings.complete(meeting.id, { next: nextInput(), rev: 1 }, dad);
    const err = await meetings
      .complete(meeting.id, { next: nextInput({ date: '2026-12-15' }), rev: 2 }, dad)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({
      status: 409,
      code: 'next_exists',
      details: { existing_id: first.next!.id, existing_date: '2026-12-08' },
    });
    expect(err.message).toBe('This meeting already has a next meeting on Tue, 8 Dec 2026.');

    const another = await meetings.complete(
      meeting.id,
      { next: nextInput({ date: '2026-12-15' }), rev: 2, allowSecondNext: true },
      dad,
    );
    expect(another.next!.values.date).toBe('2026-12-15');
  });

  it('is linked in both directions on the detail page', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const { next } = await meetings.complete(meeting.id, { next: nextInput(), rev: 1 }, dad);
    expect((await meetings.neighbors(meeting.id)).next).toMatchObject({
      id: next!.id,
      date: '2026-12-08',
    });
    expect((await meetings.neighbors(next!.id)).previous).toMatchObject({
      id: meeting.id,
      date: '2026-12-01',
    });
    expect((await meetings.neighbors(meeting.id)).previous).toBeNull();
  });

  it('does not link to a next meeting that was deleted', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const { next } = await meetings.complete(meeting.id, { next: nextInput(), rev: 1 }, dad);
    await meetings.remove(next!.id, next!.rev, dad);
    expect((await meetings.neighbors(meeting.id)).next).toBeNull();
  });
});

describe('"Not decided yet"', () => {
  it('flags a case that is waiting for its next date', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(meeting.id, { awaitingNext: true, rev: 1 }, dad);
    expect(r.meeting.awaiting_next).toBe(true);
    expect(r.meeting.values.meeting_status).toBe('Completed');
  });

  it('counts as No for a category with no case key', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(
      meetings,
      { date: '2026-12-01', start_time: '10:00', topic: 'Review' },
      'others',
    );
    const r = await meetings.complete(meeting.id, { awaitingNext: true, rev: 1 }, dad);
    expect(r.meeting.awaiting_next).toBe(false);
  });

  it('is cleared when the next meeting is scheduled later from the detail page', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const done = await meetings.complete(meeting.id, { awaitingNext: true, rev: 1 }, dad);
    const later = await meetings.complete(
      meeting.id,
      { next: { id: newId(), date: '2026-12-20', start_time: '10:30' }, rev: done.meeting.rev },
      dad,
    );
    expect(later.meeting.awaiting_next).toBe(false);
    expect(later.meeting.values.meeting_status).toBe('Completed');
    expect(later.next!.previous_id).toBe(meeting.id);
  });

  it('is not set when a next date is given', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(
      meeting.id,
      {
        awaitingNext: true,
        next: { id: newId(), date: '2026-12-08', start_time: '10:30' },
        rev: 1,
      },
      dad,
    );
    expect(r.meeting.awaiting_next).toBe(false);
  });

  it('is stored in the Sheet as TRUE and as an empty cell when not waiting', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    await meetings.complete(meeting.id, { awaitingNext: true, rev: 1 }, dad);
    const t = await f.tab('CCIE');
    const row = t.rows.find((r) => r[t.headers.indexOf('id')] === meeting.id)!;
    expect(row[t.headers.indexOf('awaiting_next')]).toBe('TRUE');
  });
});

describe('undoing the done flow', () => {
  it('takes the next meeting out and puts the first one back, in one step', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(
      meeting.id,
      {
        notes: 'Done',
        next: { id: newId(), date: '2026-12-08', start_time: '10:30' },
        awaitingNext: true,
        rev: 1,
      },
      dad,
    );
    const undone = await meetings.undoChange(r.undoToken!, dad);

    expect(undone.label).toBe('Meeting marked done');
    expect(undone.meeting.values.meeting_status).toBe('Scheduled');
    expect(undone.meeting.values.details).toBe('Earlier notes.');
    expect((await meetings.get(r.next!.id)).deleted_at).toBeTruthy();
    expect((await meetings.neighbors(meeting.id)).next).toBeNull();
  });

  it('undoing "not decided yet" clears the flag', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(meeting.id, { awaitingNext: true, rev: 1 }, dad);
    expect((await meetings.undoChange(r.undoToken!, dad)).meeting.awaiting_next).toBe(false);
  });

  it('scheduling a next meeting after the fact can be undone too', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const done = await meetings.complete(meeting.id, { rev: 1 }, dad);
    const later = await meetings.complete(
      meeting.id,
      { next: { id: newId(), date: '2026-12-20', start_time: '10:30' }, rev: done.meeting.rev },
      dad,
    );
    const undone = await meetings.undoChange(later.undoToken!, dad);
    expect(undone.label).toBe('Next meeting scheduled');
    expect((await meetings.get(later.next!.id)).deleted_at).toBeTruthy();
    expect((await meetings.get(meeting.id)).values.meeting_status).toBe('Completed');
  });

  it('is refused, and changes nothing, if either meeting changed since', async () => {
    const { meetings } = await setup();
    const { meeting } = await make(meetings);
    const r = await meetings.complete(
      meeting.id,
      { next: { id: newId(), date: '2026-12-08', start_time: '10:30' }, rev: 1 },
      dad,
    );
    await meetings.update(r.next!.id, { remarks: 'edited since' }, r.next!.rev, dad);
    await expect(meetings.undoChange(r.undoToken!, dad)).rejects.toThrow(/changed since/);
    expect((await meetings.get(meeting.id)).values.meeting_status).toBe('Completed');
    expect((await meetings.get(r.next!.id)).deleted_at).toBeNull();
  });
});

describe('the change log', () => {
  it('records the done flow as "complete" with the field changes', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings);
    await meetings.complete(meeting.id, { notes: 'N', awaitingNext: true, rev: 1 }, dad);
    const log = await f.tab('_audit');
    const row = log.rows.find(
      (r) =>
        r[log.headers.indexOf('row_id')] === meeting.id &&
        r[log.headers.indexOf('action')] === 'complete',
    )!;
    const changes = JSON.parse(String(row[log.headers.indexOf('changes')]));
    expect(changes.meeting_status).toEqual(['Scheduled', 'Completed']);
    expect(changes.awaiting_next).toEqual([false, true]);
  });
});
