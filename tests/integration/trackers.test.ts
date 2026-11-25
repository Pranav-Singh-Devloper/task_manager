import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { TAB } from '../../shared/schema';
import type { Actor } from '../../server/services/meetings';
import { TrackerService } from '../../server/services/trackers';
import { addTrackers } from '../../server/services/migrations';
import { createDatabase } from '../../server/services/databaseSeed';
import { createMockGoogle } from '../../server/services/google/mock';
import { fixture } from './store-helpers';

const dad: Actor = { email: 'dad@example.com', source: 'app' };

async function setup() {
  const f = await fixture();
  return { f, trackers: new TrackerService(f.store) };
}

describe('trackers migration', () => {
  it('adds the five trackers, each with its own tab and columns, to a database made before trackers', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const db = await createDatabase(services, new Date());
    const before = (await services.sheets.getTabs(db.spreadsheetId)).map((t) => t.title);
    expect(before).not.toContain(TAB.trackers);

    await addTrackers(services, db.spreadsheetId);
    const titles = (await services.sheets.getTabs(db.spreadsheetId)).map((t) => t.title);
    for (const t of [
      TAB.trackers,
      'Award Plan',
      'Discussions',
      'DPR',
      'Track',
      'Under Observation',
    ])
      expect(titles).toContain(t);

    // Running it again changes nothing.
    await addTrackers(services, db.spreadsheetId);
    const again = (await services.sheets.getTabs(db.spreadsheetId)).map((t) => t.title);
    expect(again).toEqual(titles);
  });

  it('keeps an existing tab that happens to have a tracker’s name, and uses a new one', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const db = await createDatabase(services, new Date());
    const [mine] = await services.sheets.addTabs(db.spreadsheetId, [{ title: 'DPR' }]);
    await services.sheets.writeBlocks(db.spreadsheetId, [
      { gid: mine!.gid, startRow: 1, rows: [['my own'], ['notes']] },
    ]);
    await addTrackers(services, db.spreadsheetId);
    const titles = (await services.sheets.getTabs(db.spreadsheetId)).map((t) => t.title);
    expect(titles).toContain('DPR 2');
    const kept = await services.sheets.batchGet(db.spreadsheetId, [mine!.gid]);
    expect(kept[mine!.gid]?.[1]).toEqual(['notes']);
  });
});

describe('tracker rows', () => {
  it('lists the demo rows of every tracker, without meetings mixed in', async () => {
    const { f, trackers } = await setup();
    const snap = await f.store.snapshot();
    expect(snap.config.trackers.map((t) => t.slug)).toEqual([
      'award_plan',
      'discussions',
      'dpr',
      'track',
      'under_observation',
    ]);
    expect((await trackers.list('dpr')).rows).toHaveLength(5);
    expect([...snap.categories.keys()]).not.toContain('dpr');
    expect(snap.config.fields.some((x) => x.category_slug === 'dpr')).toBe(false);
  });

  it('adds a row with the next number and the column defaults, and a retry does not add a second', async () => {
    const { f, trackers } = await setup();
    const id = newId();
    const made = await trackers.create(
      'discussions',
      { id, values: { discussion_with: 'Member(T)', topic: 'Budget' } },
      dad,
    );
    expect(made.existing).toBe(false);
    expect(made.row.values.status).toBe('Pending');
    expect(made.row.values.sr_no).toBe(5);
    const again = await trackers.create(
      'discussions',
      { id, values: { discussion_with: 'Member(T)', topic: 'Budget' } },
      dad,
    );
    expect(again.existing).toBe(true);
    expect((await trackers.list('discussions')).rows).toHaveLength(5);
    const sheet = await f.tab('Discussions');
    expect(sheet.rows.filter((r) => r.includes('Budget'))).toHaveLength(1);
  });

  it('says plainly what is missing', async () => {
    const { trackers } = await setup();
    await expect(
      trackers.create('discussions', { id: newId(), values: { topic: 'No person' } }, dad),
    ).rejects.toMatchObject({ issues: [{ field: 'discussion_with' }] });
  });

  it('edits with the rev it saw, and refuses a stale rev', async () => {
    const { trackers } = await setup();
    const row = (await trackers.list('under_observation')).rows[0]!;
    const changed = await trackers.update(
      'under_observation',
      row.id,
      { values: { status: 'Delayed' }, rev: row.rev },
      dad,
    );
    expect(changed.values.status).toBe('Delayed');
    expect(changed.rev).toBe(row.rev + 1);
    await expect(
      trackers.update(
        'under_observation',
        row.id,
        { values: { status: 'Closed' }, rev: row.rev },
        dad,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('moves a row to the Trash and back', async () => {
    const { trackers } = await setup();
    const row = (await trackers.list('award_plan')).rows[0]!;
    await trackers.remove('award_plan', row.id, row.rev, dad);
    expect((await trackers.list('award_plan')).rows.map((r) => r.id)).not.toContain(row.id);
    expect((await trackers.list('award_plan', { deleted: true })).rows.map((r) => r.id)).toContain(
      row.id,
    );
    await trackers.restore('award_plan', row.id, dad);
    expect((await trackers.list('award_plan')).rows.map((r) => r.id)).toContain(row.id);
  });

  it('a new dropdown value is learned, so it is offered next time', async () => {
    const { f, trackers } = await setup();
    await trackers.create(
      'dpr',
      { id: newId(), values: { project: 'New DPR', consultant: 'Delta Consultants' } },
      dad,
    );
    const snap = await f.store.refresh();
    const consultant = snap.config.trackerFields.find(
      (x) => x.category_slug === 'dpr' && x.key === 'consultant',
    );
    expect(consultant?.options).toContain('Delta Consultants');
  });

  it('keeps Track states readable in the Sheet: one per line, with the date reached', async () => {
    const { f, trackers } = await setup();
    const made = await trackers.create(
      'track',
      {
        id: newId(),
        values: { event: 'File 99', states: ['Sent (2026-11-01)', 'Returned', ''] },
      },
      dad,
    );
    expect(made.row.values.states).toEqual(['Sent (2026-11-01)', 'Returned']);
    const sheet = await f.tab('Track');
    const row = sheet.rows.find((r) => r.includes('File 99'))!;
    expect(row[sheet.headers.indexOf('states')]).toBe('Sent (2026-11-01)\nReturned');
  });

  it('a row pasted straight into the Sheet becomes a real row', async () => {
    const { f, trackers } = await setup();
    const sheet = await f.tab('Under Observation');
    const cells = sheet.headers.map((h) => (h === 'work' ? 'Pasted by hand' : ''));
    await f.mock.services.sheets.appendRows(f.spreadsheetId, sheet.gid, [cells]);
    await f.store.refresh();
    const rows = (await trackers.list('under_observation')).rows;
    const pasted = rows.find((r) => r.values.work === 'Pasted by hand');
    expect(pasted?.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(pasted?.values.status).toBe('On track');
  });

  it('reads a column whose heading was retyped in the Sheet, and writes back to it without adding another', async () => {
    const { f, trackers } = await setup();
    const sheet = await f.tab('Award Plan');
    const retyped = sheet.headers.map((h) => (h === 'bdd' ? 'BDD' : h === 'ae_ie' ? 'AE_IE' : h));
    const at = sheet.headers.indexOf('bdd');
    await f.mock.services.sheets.writeBlocks(f.spreadsheetId, [
      { gid: sheet.gid, startRow: 1, rows: [retyped] },
      {
        gid: sheet.gid,
        startRow: 2,
        rows: [sheet.rows[1]!.map((c, k) => (k === at ? '15.01.2027' : c))],
      },
    ]);
    await f.store.refresh();
    const id = String(sheet.rows[1]![sheet.headers.indexOf('id')]);
    const first = (await trackers.list('award_plan')).rows.find((r) => r.id === id)!;
    expect(first.values.bdd).toBe('2027-01-15');

    await trackers.update(
      'award_plan',
      first.id,
      { values: { bdd: '2027-02-01' }, rev: first.rev },
      dad,
    );
    const after = await f.tab('Award Plan');
    expect(after.headers).toEqual(retyped); // the owner's wording stays, and no second bdd column
    expect(after.rows[1]![at]).toBe('2027-02-01');
  });

  it('shows a short name in the list when one is chosen, and only a text column can be one', async () => {
    const { f } = await setup();
    const { addField } = await import('../../server/services/admin/columns');
    const { updateTracker } = await import('../../server/services/admin/trackers');
    const short = await addField(
      f.store,
      'award_plan',
      { label: 'Name in short', type: 'long_text' },
      dad,
    );
    const changed = await updateTracker(
      f.store,
      'award_plan',
      { roles: { short_key: short.key } },
      dad,
    );
    expect(changed.settings.roles.short_key).toBe('name_in_short');
    await expect(
      updateTracker(f.store, 'award_plan', { roles: { short_key: 'length_km' } }, dad),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps the owner’s own order of rows, drops unknown ids, and goes back to the date order', async () => {
    const { f, trackers } = await setup();
    const ids = (await trackers.list('award_plan')).rows.map((r) => r.id);
    const mine = [...ids].reverse();
    const saved = await trackers.setOrder(
      'award_plan',
      [...mine, '0ZZZZZZZZZZZZZZZZZZZZZZZZZ'],
      dad,
    );
    expect(saved.settings.order).toEqual(mine);
    expect((await trackers.list('award_plan')).tracker.settings.order).toEqual(mine);

    // Changing the list's settings in Admin keeps the order.
    const { updateTracker } = await import('../../server/services/admin/trackers');
    await updateTracker(f.store, 'award_plan', { name: 'Award Plan' }, dad);
    expect((await trackers.list('award_plan')).tracker.settings.order).toEqual(mine);

    await trackers.setOrder('award_plan', [], dad);
    expect((await trackers.list('award_plan')).tracker.settings.order).toEqual([]);
  });

  it('sets the award target, and the dashboard reads it', async () => {
    const { trackers } = await setup();
    await trackers.setTargets('award_plan', { km: 500, cr: 9000 }, dad);
    const award = (await trackers.summaries()).find((s) => s.tracker.slug === 'award_plan')!;
    const tile = award.kpis.tiles.find((t) => t.id === 'awardedYear')!;
    expect(tile.params).toMatchObject({ targetKm: 500, targetCr: 9000 });
    await expect(
      trackers.setTargets('award_plan', { km: -1, cr: null }, dad),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('tracker columns in Admin', () => {
  it('adds, renames, hides and removes a column of a tracker, the same way as a meeting column', async () => {
    const { f, trackers } = await setup();
    const { addField, updateField, removeField } =
      await import('../../server/services/admin/columns');
    const added = await addField(f.store, 'dpr', { label: 'Land status', type: 'text' }, dad);
    expect(added.key).toBe('land_status');
    expect((await f.tab('DPR')).headers).toContain('land_status');

    const row = (await trackers.list('dpr')).rows[0]!;
    const changed = await trackers.update(
      'dpr',
      row.id,
      { values: { land_status: '80% acquired' }, rev: row.rev },
      dad,
    );
    expect(changed.values.land_status).toBe('80% acquired');

    await updateField(f.store, 'dpr', 'land_status', { label: 'Land', archived: true }, dad);
    const hidden = (await f.store.snapshot()).config.byTracker
      .get('dpr')!
      .fields.find((x) => x.key === 'land_status');
    expect(hidden).toMatchObject({ label: 'Land', archived: true });

    await removeField(f.store, 'dpr', 'land_status', 'Land', dad);
    const gone = (await f.store.snapshot()).config.byTracker
      .get('dpr')!
      .fields.some((x) => x.key === 'land_status');
    expect(gone).toBe(false);
  });

  it('keeps the name column, which every row needs', async () => {
    const { f } = await setup();
    const { updateField } = await import('../../server/services/admin/columns');
    await expect(
      updateField(f.store, 'award_plan', 'project', { archived: true }, dad),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('a new list (ADD++)', () => {
  it('makes a list with its own tab and a working dashboard, and its roles can be changed', async () => {
    const { f, trackers } = await setup();
    const { createTracker, updateTracker } = await import('../../server/services/admin/trackers');
    const made = await createTracker(
      f.store,
      { name: 'Site Visits', item_name: 'visit', color: '#1D4ED8' },
      dad,
    );
    expect(made).toMatchObject({ slug: 'site_visits', kind: 'custom' });
    expect((await f.tab('Site Visits')).headers.slice(0, 5)).toEqual([
      'sr_no',
      'name',
      'status',
      'due_date',
      'remarks',
    ]);
    await trackers.create(
      'site_visits',
      { id: newId(), values: { name: 'Bridge at Km 12', due_date: '2020-01-01' } },
      dad,
    );
    const summary = (await trackers.summaries()).find((s) => s.tracker.slug === 'site_visits')!;
    expect(summary.kpis.tiles.find((t) => t.id === 'overdue')?.value).toBe(1);

    await expect(
      updateTracker(f.store, 'site_visits', { roles: { due_key: 'remarks' } }, dad),
    ).rejects.toMatchObject({ issues: [{ field: 'due_key' }] });
    const changed = await updateTracker(
      f.store,
      'site_visits',
      { name: 'Visits', roles: { group_key: 'status', closed_values: ['Done', 'Dropped'] } },
      dad,
    );
    expect(changed.name).toBe('Visits');
    expect(changed.settings.roles).toMatchObject({
      group_key: 'status',
      closed_values: ['Done', 'Dropped'],
    });
  });

  it('refuses a name that is already used, and never takes the slug "new"', async () => {
    const { f } = await setup();
    const { createTracker } = await import('../../server/services/admin/trackers');
    await expect(
      createTracker(f.store, { name: 'DPR', item_name: 'x', color: '#1D4ED8' }, dad),
    ).rejects.toMatchObject({ issues: [{ field: 'name' }] });
    const made = await createTracker(
      f.store,
      { name: 'New', item_name: 'thing', color: '#1D4ED8' },
      dad,
    );
    expect(made.slug).toBe('new_2');
  });
});

describe('lists on Google Calendar', () => {
  const events = (f: Awaited<ReturnType<typeof setup>>['f']) =>
    [...(f.mock.world.calendars.get('primary')?.values() ?? [])].filter(
      (e) => e.status !== 'cancelled' && e.extendedProperties.private.mmTracker,
    );

  it('puts an open discussion on the calendar as an all-day event, and takes it off when done', async () => {
    const { f, trackers } = await setup();
    const id = newId();
    await trackers.create(
      'discussions',
      { id, values: { discussion_with: 'Member(T)', topic: 'EoT file', date: '2030-05-10' } },
      dad,
    );
    await trackers.settle();
    const ev = events(f).find((e) => e.extendedProperties.private.mmTrackerRowId === id)!;
    expect(ev.summary).toBe('[Discussions] EoT file (Member(T))');
    expect(ev.start).toEqual({ date: '2030-05-10' });
    expect(ev.end).toEqual({ date: '2030-05-11' });
    expect(ev.description).toContain(`/trackers/discussions/${id}`);
    const row = await trackers.get('discussions', id);
    expect(row.rev).toBe(1); // recording the calendar never changes the rev

    await trackers.update('discussions', id, { values: { status: 'Done' }, rev: 1 }, dad);
    await trackers.settle();
    expect(events(f).some((e) => e.extendedProperties.private.mmTrackerRowId === id)).toBe(false);
  });

  it('puts a bid due date on the calendar, keeps DPR dates off it, and follows the setting', async () => {
    const { f, trackers } = await setup();
    const bid = newId();
    await trackers.create(
      'award_plan',
      { id: bid, values: { project: 'Bypass', bdd: '2030-01-15' } },
      dad,
    );
    const dpr = newId();
    await trackers.create(
      'dpr',
      { id: dpr, values: { project: 'Some DPR', completion_date: '2030-01-20' } },
      dad,
    );
    await trackers.settle();
    expect(events(f).some((e) => e.extendedProperties.private.mmTrackerRowId === bid)).toBe(true);
    expect(events(f).some((e) => e.extendedProperties.private.mmTrackerRowId === dpr)).toBe(false);

    const { updateTracker } = await import('../../server/services/admin/trackers');
    await updateTracker(f.store, 'award_plan', { calendar: false }, dad);
    await trackers.resync('award_plan');
    expect(events(f).some((e) => e.extendedProperties.private.mmTrackerRowId === bid)).toBe(false);
  });

  it('a calendar failure is kept as "error" and retried later', async () => {
    const { f, trackers } = await setup();
    f.mock.failures.load('calendar');
    const id = newId();
    await trackers.create(
      'discussions',
      { id, values: { discussion_with: 'Chairman', topic: 'Plan', date: '2030-02-01' } },
      dad,
    );
    await trackers.settle();
    const snap = await f.store.snapshot();
    expect(snap.trackers.get('discussions')!.entries.get(id)!.record.system.calendar_sync).toBe(
      'error',
    );
    f.mock.failures.clear();
    expect(await trackers.resync()).toMatchObject({ failed: 0 });
    expect(events(f).some((e) => e.extendedProperties.private.mmTrackerRowId === id)).toBe(true);
  });
});

describe('migration 3: calendar for Discussions and Award Plan', () => {
  it('switches the calendar on where it was never set, and leaves a chosen setting alone', async () => {
    const { services } = await createMockGoogle({ seed: 'empty' });
    const db = await createDatabase(services, new Date());
    await addTrackers(services, db.spreadsheetId);
    const { calendarForSeedLists } = await import('../../server/services/migrations');
    const { parseTrackers } = await import('../../shared/configRows');
    const tab = (await services.sheets.getTabs(db.spreadsheetId)).find(
      (t) => t.title === TAB.trackers,
    )!;
    const read = async () =>
      parseTrackers((await services.sheets.batchGet(db.spreadsheetId, [tab.gid]))[tab.gid] ?? [])
        .items;
    // Like a list made before the setting existed: no "calendar" in its settings.
    const rows = (await services.sheets.batchGet(db.spreadsheetId, [tab.gid]))[tab.gid]!;
    const col = rows[0]!.indexOf('settings');
    const blocks = rows.slice(1).map((r, i) => {
      const s = JSON.parse(String(r[col])) as Record<string, unknown>;
      delete s.calendar;
      if (r[0] === 'award_plan') s.calendar = false; // someone chose off
      const next = [...r];
      next[col] = JSON.stringify(s);
      return { gid: tab.gid, startRow: i + 2, rows: [next] };
    });
    await services.sheets.writeBlocks(db.spreadsheetId, blocks);

    await calendarForSeedLists(services, db.spreadsheetId);
    const after = await read();
    expect(after.find((t) => t.slug === 'discussions')?.settings.calendar).toBe(true);
    expect(after.find((t) => t.slug === 'award_plan')?.settings.calendar).toBe(false);
    expect(after.find((t) => t.slug === 'dpr')?.settings.calendar).toBe(false);
  });
});

describe('migration 4: meeting kinds that are now lists', () => {
  it('hides AT (Award Target) and File Discussion, and keeps their meetings', async () => {
    const { f } = await setup();
    const snap = await f.store.snapshot();
    const kind = (slug: string) => snap.config.categories.find((c) => c.slug === slug);
    expect(kind('at')?.active).toBe(false);
    expect(kind('file_discussion')?.active).toBe(false);
    expect(kind('ccie')?.active).toBe(true);
    // Their meetings are still there.
    expect(snap.categories.get('at')?.entries.size).toBeGreaterThan(0);
  });
});
