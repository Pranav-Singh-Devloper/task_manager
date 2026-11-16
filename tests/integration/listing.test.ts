import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { MeetingService, type Actor } from '../../server/services/meetings';
import { UndoService } from '../../server/services/undo';
import { fixture } from './store-helpers';

const dad: Actor = { email: 'dad@example.com', source: 'app' };

async function setup() {
  const f = await fixture();
  const meetings = new MeetingService(f.store, new UndoService(() => f.clock.now));
  return { f, meetings };
}
const titles = (ms: { title: string }[]) => ms.map((m) => m.title);

describe('search', () => {
  it('finds a value in a category-specific field, ignoring case', async () => {
    const { meetings } = await setup();
    expect((await meetings.list({ q: 'rajasthan' })).map((m) => m.category_slug)).toEqual(['ccie']); // State
    expect((await meetings.list({ q: 'RAJASTHAN' })).length).toBe(1);
    expect((await meetings.list({ q: 'marudhar' })).length).toBe(1); // Contractor
    expect((await meetings.list({ q: 'shree infra' })).length).toBe(3);
    expect((await meetings.list({ q: 'kanpur' })).map((m) => m.category_slug)).toEqual(['at']); // Name of Project
    expect((await meetings.list({ q: 'M/s Consulting' })).map((m) => m.category_slug)).toEqual([
      'at',
    ]); // AE/IE
    expect((await meetings.list({ q: 'dr. r. k. verma' })).length).toBe(3); // Allocated CCIE
  });

  it('finds a value in the core fields, the title, the category and the workspace', async () => {
    const { meetings } = await setup();
    expect((await meetings.list({ q: 'chairman' })).length).toBe(1); // topic
    expect((await meetings.list({ q: 'first sitting' })).length).toBe(1); // details
    expect((await meetings.list({ q: 'bring the quarterly' })).length).toBe(1); // remarks
    expect((await meetings.list({ q: 'court case' })).length).toBe(2); // category name
    expect((await meetings.list({ q: 'phd' })).map((m) => m.category_slug).sort()).toEqual([
      'phd_milestone',
      'supervisor_meeting',
    ]);
    expect((await meetings.list({ q: 'CCIE — NH-48' })).length).toBe(1); // the title built from the template
  });

  it('searches part of a word and finds nothing for a word that is not there', async () => {
    const { meetings } = await setup();
    expect((await meetings.list({ q: 'lani' })).length).toBe(4);
    expect((await meetings.list({ q: 'zzzzzz' })).length).toBe(0);
    expect((await meetings.list({ q: '   ' })).length).toBe(15);
  });

  it('does not match across the end of one field and the start of the next', async () => {
    const { meetings } = await setup();
    expect((await meetings.list({ q: 'gwaliorbhopal' })).length).toBe(0); // PIU Gwalior + RO Bhopal
  });

  it('every value typed into any column of any category can be found', async () => {
    const { f, meetings } = await setup();
    const snap = await f.store.snapshot();
    let checked = 0;
    for (const [slug, data] of snap.categories) {
      const cfg = snap.config.byCategory.get(slug)!;
      for (const entry of data.entries.values()) {
        for (const field of cfg.fields) {
          if (
            field.type === 'computed' ||
            field.type === 'auto_number' ||
            field.type === 'checkbox'
          )
            continue;
          const v = entry.record.values[field.key];
          if (v === null || v === undefined || v === '') continue;
          const text = Array.isArray(v) ? v.join(' ') : String(v);
          const hits = await meetings.list({ q: text });
          expect(
            hits.map((m) => m.id),
            `${slug}.${field.key} = ${text}`,
          ).toContain(entry.id);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('finds a meeting by the name of an attached file', async () => {
    const { f, meetings } = await setup();
    const target = (await meetings.list({ category: 'morth' }))[0]!;
    const files = await f.tab('_files');
    await f.mock.services.sheets.appendRows(f.spreadsheetId, files.gid, [
      files.headers.map(
        (h) =>
          ({ meeting_id: target.id, name: 'Quarterly-progress-sheet.pdf', status: 'attached' })[
            h as 'name'
          ] ?? '',
      ),
    ]);
    await f.store.refresh();
    expect((await meetings.list({ q: 'quarterly-progress' })).map((m) => m.id)).toEqual([
      target.id,
    ]);
  });
});

describe('filters', () => {
  it('filters on a category-specific column', async () => {
    const { meetings } = await setup();
    const r = await meetings.list({
      filters: [{ field: 'contractor', op: 'contains', value: 'infra' }],
    });
    expect(r.length).toBe(3);
    const none = await meetings.list({ filters: [{ field: 'state', op: 'is', value: 'Kerala' }] });
    expect(none.length).toBe(0);
  });

  it('combines filters with and', async () => {
    const { meetings } = await setup();
    const r = await meetings.list({
      filters: [
        { field: 'case_id', op: 'is', value: 'C-101' },
        { field: 'date', op: 'after', value: '2000-01-01' },
        { field: 'meeting_status', op: 'is', value: 'Completed' },
      ],
    });
    expect(r.length).toBe(2);
  });

  it('numbers compare as numbers, and meetings without the column do not match', async () => {
    const { meetings } = await setup();
    expect(
      (await meetings.list({ filters: [{ field: 'total_cost', op: 'greater', value: '1000' }] }))
        .length,
    ).toBe(1);
    expect(
      (await meetings.list({ filters: [{ field: 'total_cost', op: 'less', value: '1000' }] }))
        .length,
    ).toBe(0);
    expect(
      (
        await meetings.list({
          filters: [{ field: 'length', op: 'between', value: '40', value2: '45' }],
        })
      ).length,
    ).toBe(1);
    expect(
      (await meetings.list({ filters: [{ field: 'total_cost', op: 'is_empty' }] })).length,
    ).toBe(14);
  });

  it('dates and calculated columns work', async () => {
    const { meetings } = await setup();
    expect(
      (
        await meetings.list({
          filters: [{ field: 'date_of_initiation', op: 'before', value: '1 Jun 2025' }],
        })
      ).length,
    ).toBe(3);
    const long = await meetings.list({
      filters: [{ field: 'pendency_months', op: 'greater', value: '12' }],
    });
    expect(long.length).toBeGreaterThanOrEqual(3);
    expect(long.every((m) => Number(m.computed.pendency_months) > 12)).toBe(true);
  });

  it('title and category are filterable too', async () => {
    const { meetings } = await setup();
    expect(
      (
        await meetings.list({
          filters: [{ field: 'title', op: 'contains', value: 'writ petition' }],
        })
      ).length,
    ).toBe(2);
    expect(
      (await meetings.list({ filters: [{ field: 'category', op: 'is', value: 'Court Case' }] }))
        .length,
    ).toBe(2);
  });

  it('an unreadable value matches nothing instead of failing', async () => {
    const { meetings } = await setup();
    expect(
      (await meetings.list({ filters: [{ field: 'total_cost', op: 'greater', value: 'lots' }] }))
        .length,
    ).toBe(0);
  });

  it('search and filters work together', async () => {
    const { meetings } = await setup();
    const r = await meetings.list({
      q: 'laning',
      filters: [{ field: 'state', op: 'is', value: 'Rajasthan' }],
    });
    expect(r.length).toBe(1);
  });
});

describe('date range, status, workspace, category', () => {
  it('limits to an inclusive range of dates', async () => {
    const { meetings } = await setup();
    const all = await meetings.list({});
    const dates = all.map((m) => String(m.values.date)).sort();
    const mid = dates[Math.floor(dates.length / 2)]!;
    const inside = await meetings.list({ from: mid, to: mid });
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.every((m) => m.values.date === mid)).toBe(true);
    expect((await meetings.list({ from: dates[0], to: dates[dates.length - 1] })).length).toBe(
      all.length,
    );
    expect((await meetings.list({ from: '2100-01-01' })).length).toBe(0);
  });

  it('combines the simple filters', async () => {
    const { meetings } = await setup();
    const r = await meetings.list({ category: 'ccie', status: 'Completed', workspace: 'nhai' });
    expect(r.length).toBe(2);
  });
});

describe('sorting', () => {
  it('is oldest first by default, newest first for the past tab', async () => {
    const { meetings } = await setup();
    const key = (m: { values: Record<string, unknown> }) =>
      `${m.values.date} ${m.values.start_time}`;
    const up = await meetings.list({ scope: 'upcoming' });
    const past = await meetings.list({ scope: 'past' });
    expect(up.map(key)).toEqual([...up.map(key)].sort());
    expect(past.map(key)).toEqual([...past.map(key)].sort().reverse());
  });

  it('sorts by title, either way', async () => {
    const { meetings } = await setup();
    const asc = titles(await meetings.list({ sort: 'title', dir: 'asc' }));
    expect(asc).toEqual(
      [...asc].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase(), 'en', { numeric: true }),
      ),
    );
    expect(titles(await meetings.list({ sort: 'title', dir: 'desc' }))).toEqual([...asc].reverse());
  });

  it('sorts by category name and by a category-specific column', async () => {
    const { f, meetings } = await setup();
    const snap = await f.store.snapshot();
    const nameOf = (slug: string) => snap.config.byCategory.get(slug)!.category.name.toLowerCase();
    const order = (await meetings.list({ sort: 'category', dir: 'asc' })).map((m) =>
      nameOf(m.category_slug),
    );
    expect(new Set(order).size).toBeGreaterThan(5);
    expect(order).toEqual([...order].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    const desc = (await meetings.list({ sort: 'category', dir: 'desc' })).map((m) =>
      nameOf(m.category_slug),
    );
    expect(desc).toEqual([...order].reverse());
    const byState = (await meetings.list({ category: 'ccie', sort: 'state', dir: 'asc' })).map(
      (m) => m.values.state,
    );
    expect(byState).toEqual(['Madhya Pradesh', 'Madhya Pradesh', 'Madhya Pradesh', 'Rajasthan']);
  });

  it('sorts numbers as numbers and always puts blanks last', async () => {
    const { f, meetings } = await setup();
    await meetings.create(
      {
        id: newId(),
        category: 'at',
        values: {
          date: '2027-01-01',
          start_time: '10:00',
          name_of_project: 'Small',
          total_cost: '95',
        },
      },
      dad,
    );
    await meetings.create(
      {
        id: newId(),
        category: 'at',
        values: { date: '2027-01-02', start_time: '10:00', name_of_project: 'Blank' },
      },
      dad,
    );
    await f.store.refresh();
    const asc = (await meetings.list({ category: 'at', sort: 'total_cost', dir: 'asc' })).map(
      (m) => m.values.total_cost,
    );
    expect(asc).toEqual([95, 1710, null, null].slice(0, asc.length));
    const desc = (await meetings.list({ category: 'at', sort: 'total_cost', dir: 'desc' })).map(
      (m) => m.values.total_cost,
    );
    expect(desc).toEqual([1710, 95, null, null].slice(0, desc.length));
  });

  it('sorts by a calculated column', async () => {
    const { meetings } = await setup();
    const r = await meetings.list({ category: 'ccie', sort: 'pendency_months', dir: 'desc' });
    const values = r.map((m) => m.computed.pendency_months as number);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('keeps a steady order when values are equal', async () => {
    const { meetings } = await setup();
    const a = (await meetings.list({ sort: 'status', dir: 'asc' })).map((m) => m.id);
    const b = (await meetings.list({ sort: 'status', dir: 'asc' })).map((m) => m.id);
    expect(a).toEqual(b);
  });
});

describe('paging', () => {
  it('returns pages that add up to everything, with the total', async () => {
    const { meetings } = await setup();
    const first = await meetings.query({ limit: 6 });
    expect(first.total).toBe(15);
    expect(first.meetings).toHaveLength(6);
    expect(first.nextOffset).toBe(6);
    const second = await meetings.query({ limit: 6, offset: first.nextOffset! });
    const third = await meetings.query({ limit: 6, offset: second.nextOffset! });
    expect(third.meetings).toHaveLength(3);
    expect(third.nextOffset).toBeNull();
    const ids = [...first.meetings, ...second.meetings, ...third.meetings].map((m) => m.id);
    expect(new Set(ids).size).toBe(15);
    expect(ids).toEqual((await meetings.list({})).map((m) => m.id));
  });
});

describe('what the table and the calendar show', () => {
  it('upcoming and past together are exactly the calendar set, with no overlap', async () => {
    const { meetings } = await setup();
    const filters = { q: 'a' };
    const up = (await meetings.list({ ...filters, scope: 'upcoming' })).map((m) => m.id);
    const past = (await meetings.list({ ...filters, scope: 'past' })).map((m) => m.id);
    const all = (await meetings.list({ ...filters, scope: 'all' })).map((m) => m.id);
    expect(up.filter((id) => past.includes(id))).toEqual([]);
    expect([...up, ...past].sort()).toEqual([...all].sort());
  });
});

describe('attention and the next meeting', () => {
  it('the next meeting is the first open one, not a cancelled or finished one', async () => {
    const { meetings } = await setup();
    const first = (await meetings.summary()).next!;
    expect(first).toBeTruthy();
    const cancelled = await meetings.setStatus(first.id, 'Cancelled', first.rev, dad);
    const next = (await meetings.summary()).next!;
    expect(next.id).not.toBe(first.id);
    expect(cancelled.meeting.values.meeting_status).toBe('Cancelled');
    const up = await meetings.list({ scope: 'upcoming' });
    expect(
      up.find((m) => ['Scheduled', 'Rescheduled'].includes(String(m.values.meeting_status)))!.id,
    ).toBe(next.id);
  });

  it('lists the next three open meetings, soonest first, starting with the next one', async () => {
    const { meetings } = await setup();
    const before = await meetings.summary();
    expect(before.upcoming).toHaveLength(3);
    expect(before.upcoming[0]!.id).toBe(before.next!.id);
    const open = (await meetings.list({ scope: 'upcoming' })).filter((m) =>
      ['Scheduled', 'Rescheduled'].includes(String(m.values.meeting_status)),
    );
    expect(before.upcoming.map((m) => m.id)).toEqual(open.slice(0, 3).map((m) => m.id));

    // A cancelled one drops out and the fourth moves up.
    const second = before.upcoming[1]!;
    await meetings.setStatus(second.id, 'Cancelled', second.rev, dad);
    const after = await meetings.summary();
    expect(after.upcoming.map((m) => m.id)).toEqual(
      [open[0]!, open[2]!, open[3]!].map((m) => m.id),
    );
  });

  it('counts meetings with a required detail missing, and cases waiting for a next date', async () => {
    const { f, meetings } = await setup();
    expect(await meetings.summary()).toMatchObject({ incomplete: 0, waiting: 0 });

    const t = await f.tab('CCIE');
    const row = t.headers.map((_, i) => t.rows[1]![i] ?? '');
    row[t.headers.indexOf('project_name')] = '';
    await f.mock.services.sheets.updateRow(f.spreadsheetId, t.gid, 2, row);
    await f.store.refresh();
    expect((await meetings.summary()).incomplete).toBe(1);
    expect((await meetings.list({ incomplete: true })).length).toBe(1);

    const open = (await meetings.list({ category: 'ccie', scope: 'upcoming' }))[0]!;
    await meetings.complete(open.id, { awaitingNext: true, rev: open.rev }, dad);
    expect((await meetings.summary()).waiting).toBe(1);
    expect((await meetings.list({ awaiting: true })).map((m) => m.id)).toEqual([open.id]);
  });

  it('dismissing the wait clears it, and can be undone', async () => {
    const { meetings } = await setup();
    const open = (await meetings.list({ category: 'ccie', scope: 'upcoming' }))[0]!;
    const done = await meetings.complete(open.id, { awaitingNext: true, rev: open.rev }, dad);
    const dismissed = await meetings.dismissWaiting(open.id, done.meeting.rev, dad);
    expect(dismissed.meeting.awaiting_next).toBe(false);
    expect((await meetings.summary()).waiting).toBe(0);
    const back = await meetings.undoChange(dismissed.undoToken!, dad);
    expect(back.meeting.awaiting_next).toBe(true);
    // Nothing to dismiss: nothing changes.
    const again = await meetings.dismissWaiting(open.id, back.meeting.rev, dad);
    expect(again.meeting.awaiting_next).toBe(false);
    expect((await meetings.dismissWaiting(open.id, again.meeting.rev, dad)).undoToken).toBeNull();
  });
});

describe('Rescheduled ×N', () => {
  it('counts the reschedules already in the Sheet and new ones straight away', async () => {
    const { meetings } = await setup();
    const rescheduled = (await meetings.list({ status: 'Rescheduled' }))[0]!;
    expect(rescheduled.reschedule_count).toBe(1); // the demo data has one logged
    const moved = await meetings.reschedule(
      rescheduled.id,
      { date: '2027-03-01', start_time: '10:00', rev: rescheduled.rev },
      dad,
    );
    expect(moved.meeting.reschedule_count).toBe(2);
    expect((await meetings.get(rescheduled.id)).reschedule_count).toBe(2);
    const fresh = (await meetings.list({ category: 'others' }))[0]!;
    expect(fresh.reschedule_count).toBe(0);
  });
});
