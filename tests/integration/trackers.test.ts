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
