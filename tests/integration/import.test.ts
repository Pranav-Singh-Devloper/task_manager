import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import {
  CATEGORY_HEADERS,
  FIELD_HEADERS,
  TAB,
  categoryTabHeaders,
  categoryToRow,
  fieldToRow,
  rowFromObject,
} from '../../shared/schema';
import { buildSeedConfig, coreFields } from '../../shared/seed';
import type { Cell, CategoryDef } from '../../shared/types';
import { buildPlan, dmy, mdy, stableId, type Raw } from '../../server/scripts/importPlan';
import { applyPlan } from '../../server/scripts/importApply';
import { createMockGoogle } from '../../server/services/google/mock';
import { bootstrap } from '../../server/services/bootstrap';
import { DataLayer } from '../../server/services/data';
import { logger } from './store-helpers';

/** A made-up previous database, shaped like a real one that was used for a few days. */
function oldDatabase(): { raw: Raw; gids: Map<number, string> } {
  const created = '2026-11-14T09:00:00.000Z';
  const seed = buildSeedConfig(created);
  const gids = new Map<number, string>();
  const cats: CategoryDef[] = seed.categories.map((c, i) => {
    gids.set(100 + i, seed.tabTitles[c.slug] as string);
    return { ...c, sheet_gid: 100 + i };
  });
  // The AT tab was renamed by hand.
  const atGid = cats.find((c) => c.slug === 'at')!.sheet_gid!;
  gids.set(atGid, 'Award');
  const custom = (slug: string, name: string, gid: number): CategoryDef => ({
    ...cats[0]!,
    slug,
    name,
    sort: 50,
    title_template: '',
    sheet_gid: gid,
    is_seed: false,
    created_at: created,
  });
  cats.push(custom('meeting_with_x', 'Meeting with X', 200), custom('targets', 'Targets', 201));
  gids.set(200, 'Meeting with X');
  gids.set(201, 'Targets');
  const fields = [
    // The owner had made Case Id and Project Name optional for CCIE.
    ...seed.fields.map((f) =>
      f.category_slug === 'ccie' && (f.key === 'case_id' || f.key === 'project_name')
        ? { ...f, required: false }
        : f,
    ),
    ...coreFields('meeting_with_x', false, created),
    // A kind used as a list: its Date and Time columns were renamed.
    ...coreFields('targets', false, created).map((f) =>
      f.key === 'date'
        ? { ...f, label: 'RO' }
        : f.key === 'start_time'
          ? { ...f, label: 'PIU' }
          : f,
    ),
  ];
  const headersOf = (slug: string) =>
    categoryTabHeaders(fields.filter((f) => f.category_slug === slug));
  const meeting = (slug: string, v: Record<string, Cell>) =>
    rowFromObject(headersOf(slug), {
      id: newId(),
      rev: 1,
      meeting_status: 'Scheduled',
      workspace: 'nhai',
      ...v,
    });

  const ccieH = headersOf('ccie');
  const ccie: Cell[][] = [
    ccieH,
    meeting('ccie', {
      date: '2030-01-10',
      start_time: '13:00',
      end_time: '14:00',
      topic: 'Hearing A',
    }),
    meeting('ccie', {
      date: '2030-01-10',
      start_time: '01:45',
      end_time: '02:15',
      topic: 'Hearing B',
    }),
    meeting('ccie', {
      date: '2026-11-15',
      start_time: '03:30',
      end_time: '04:30',
      project_name: 'testing',
    }),
    rowFromObject(ccieH, {
      case_id: 'XX/0001',
      status: 'Conciliation Settled',
      project_name: 'Some road',
      allocated_ccie: 'CCIE 1',
      date_of_initiation: '07/09/2026',
      numbers_of_meeting: '2',
    }),
  ];
  const atH = ['Sr. No.', 'Project Name', 'Mode', 'BDD', 'New BDD', 'Remarks', ...headersOf('at')];
  const award: Cell[][] = [
    atH,
    ['1', 'Bypass project', 'HAM', '31.12.2025', '15.01.2026', 'Land 90% ready'],
    ['2', 'IE for bypass', '', '06.01.2026', '06.01.2026'],
    ['3'],
  ];
  const othersH = headersOf('others');
  const work = (n: number, extra: Record<number, string>) => {
    const r: Cell[] = Array.from({ length: 23 }, () => '');
    Object.assign(r, {
      0: String(n),
      1: 'Member A',
      2: 'RO One',
      3: 'PIU One',
      4: `Work ${n}`,
      5: 'Road Safety,',
    });
    for (const [k, v] of Object.entries(extra)) r[Number(k) - 1] = v;
    return r;
  };
  const others: Cell[][] = [
    othersH,
    meeting('others', {
      date: '2030-02-01',
      start_time: '11:00',
      end_time: '11:30',
      topic: 'Board meeting',
    }),
    [],
    Array.from({ length: 23 }, (_, i) => `Column ${i + 1}`),
    work(1, { 10: '8', 11: 'Yes', 19: 'Yes', 22: 'N/0001/0001/XX' }),
    work(2, {
      10: '1.5',
      11: 'No',
      12: 'HQ',
      13: 'Approved',
      14: '-',
      19: 'No',
      20: '1/31/2027',
      23: 'DPR in progress',
    }),
  ];
  const raw: Raw = {
    [TAB.categories]: [[...CATEGORY_HEADERS], ...cats.map(categoryToRow)],
    [TAB.fields]: [[...FIELD_HEADERS], ...fields.map(fieldToRow)],
    [TAB.settings]: [
      ['key', 'value'],
      ['default_duration_min', '30'],
      ['default_reminders', '1440,60,15'],
    ],
    [TAB.files]: [['id'], ['f1']],
    [TAB.reschedules]: [['id']],
    CCIE: ccie,
    Award: award,
    Others: others,
    'Meeting with X': [
      headersOf('meeting_with_x'),
      meeting('meeting_with_x', {
        date: '2030-01-05',
        start_time: '12:00',
        end_time: '12:30',
        topic: 'Personal hearing',
      }),
    ],
    Targets: [headersOf('targets')],
  };
  return { raw, gids };
}

describe('reading dates the way each sheet wrote them', () => {
  it('day first, month first, and nonsense', () => {
    expect(dmy('15.01.2026')).toBe('2026-01-15');
    expect(dmy('07/09/2026')).toBe('2026-09-07');
    expect(mdy('10/22/2026')).toBe('2026-10-22');
    expect(mdy('2/1/2027')).toBe('2027-02-01');
    expect(mdy('22/10/2026')).toBeNull();
    expect(dmy('31.02.2026')).toBeNull();
    expect(stableId('x')).toBe(stableId('x'));
    expect(stableId('x')).toHaveLength(26);
  });
});

describe('the import plan', () => {
  const { raw, gids } = oldDatabase();
  const plan = buildPlan(raw, gids);

  it('copies real meetings, fixes a night-time slip, and leaves the test behind', () => {
    expect(plan.meetings.map((m) => m.title).sort()).toEqual([
      'Board meeting',
      'Hearing A',
      'Hearing B',
      'Personal hearing',
    ]);
    const b = plan.meetings.find((m) => m.title === 'Hearing B')!;
    expect(b.values).toMatchObject({ start_time: '13:45', end_time: '14:15' });
    expect(plan.notes.some((n) => n.includes('was a test'))).toBe(true);
  });

  it('makes the meeting kinds someone added again, except one used as a list', () => {
    expect(plan.categories.map((c) => c.name)).toEqual(['Meeting with X']);
    expect(
      plan.notes.some((n) => n.includes('"Targets" had its Date and Time columns renamed')),
    ).toBe(true);
  });

  it('sends the pasted award table to Award Plan with the newest BDD', () => {
    const award = plan.lists.find((l) => l.existingSlug === 'award_plan')!;
    expect(award.rows).toHaveLength(2);
    expect(award.rows[0]!.values).toMatchObject({
      project: 'Bypass project',
      mode: 'HAM',
      bdd: '2026-01-15',
      remarks: 'Original BDD: 31.12.2025.\nLand 90% ready',
    });
    expect(award.rows[1]!.values).toMatchObject({ bdd: '2026-01-06', remarks: null, mode: null });
  });

  it('turns the pasted cases into a CCIE Cases list', () => {
    const cases = plan.lists.find((l) => l.name === 'CCIE Cases')!;
    expect(cases.rows).toHaveLength(1);
    expect(cases.rows[0]!.values).toMatchObject({
      name: 'XX/0001',
      status: 'Conciliation Settled',
      date_of_initiation: '2026-09-07',
      numbers_of_meeting: 2,
    });
  });

  it('turns the headingless works table into an NRCW Targets list, keeping odd values in Remarks', () => {
    const works = plan.lists.find((l) => l.name === 'NRCW Targets')!;
    expect(works.rows).toHaveLength(2);
    expect(works.rows[0]!.values).toMatchObject({
      name: 'Work 1',
      status: 'Awarded',
      length_km: 8,
      sanctioned: 'Yes',
      upc: 'N/0001/0001/XX',
      category_of_work: 'Road Safety',
    });
    expect(works.rows[1]!.values).toMatchObject({
      status: 'Not awarded',
      due_date: '2027-01-31',
      sanction_pending_at: 'HQ',
      sanction_target_date: null,
      cost: null,
      remarks: 'DPR in progress\nTarget date of sanction: Approved',
    });
  });

  it('copies the changed settings', () => {
    expect(plan.settings).toEqual({ default_duration_min: '30', default_reminders: '1440,60,15' });
  });
});

describe('applying the plan', () => {
  it('copies everything through the app, and a second run adds nothing', async () => {
    const mock = await createMockGoogle({ seed: 'empty' });
    await bootstrap(mock.services);
    const data = new DataLayer(mock.services, { logger });
    const ctx = await data.use();
    const { raw, gids } = oldDatabase();
    const plan = buildPlan(raw, gids);

    expect(await applyPlan(plan, ctx)).toEqual([]);
    const snap = await ctx.store.refresh();
    expect(snap.config.categories.some((c) => c.name === 'Meeting with X')).toBe(true);
    for (const m of plan.meetings) expect((await ctx.meetings.get(m.id)).title).toBeTruthy();
    expect(
      (await ctx.meetings.get(plan.meetings.find((m) => m.title === 'Hearing B')!.id)).values
        .start_time,
    ).toBe('13:45');
    const award = await ctx.trackers.list('award_plan');
    expect(award.rows).toHaveLength(2);
    expect(award.rows.every((r) => !r.values.stage)).toBe(true); // no made-up stage
    const nrcw = snap.config.trackers.find((t) => t.name === 'NRCW Targets')!;
    expect(nrcw.settings.roles).toMatchObject({
      status_key: 'status',
      group_key: 'ro',
      due_key: 'due_date',
    });
    expect((await ctx.trackers.list(nrcw.slug)).rows).toHaveLength(2);
    const ro = snap.config.byTracker.get(nrcw.slug)!.fields.find((f) => f.key === 'ro')!;
    expect(ro.options).toEqual(['RO One']); // the dropdown learned its value
    const cases = snap.config.trackers.find((t) => t.name === 'CCIE Cases')!;
    expect((await ctx.trackers.list(cases.slug)).rows).toHaveLength(1);
    expect(snap.config.settings.default_duration_min).toBe('30');
    const caseId = snap.config.byCategory.get('ccie')!.fields.find((f) => f.key === 'case_id')!;
    expect(caseId.required).toBe(false); // the owner's change came across

    // Running it again adds nothing.
    expect(await applyPlan(plan, ctx)).toEqual([]);
    expect((await ctx.trackers.list('award_plan')).rows).toHaveLength(2);
    expect((await ctx.trackers.list(nrcw.slug)).rows).toHaveLength(2);
    const again = await ctx.store.refresh();
    expect(again.config.categories.filter((c) => c.name === 'Meeting with X')).toHaveLength(1);
    expect(again.config.trackers.filter((t) => t.name === 'NRCW Targets')).toHaveLength(1);
  });
});
