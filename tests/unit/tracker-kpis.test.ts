import { describe, expect, it } from 'vitest';
import { buildSeedTrackers } from '../../shared/trackerSeed';
import {
  financialYear,
  matchesPreset,
  rowName,
  trackerKpis,
  type TrackerRow,
} from '../../shared/trackerKpis';
import { currentStage, formatStage, parseStage, parseStages } from '../../shared/stages';
import type { FieldValue } from '../../shared/types';

const TODAY = '2026-11-21';
const seeds = buildSeedTrackers('2026-01-01T00:00:00.000Z');
const seed = (slug: string) => seeds.find((s) => s.tracker.slug === slug)!;
let n = 0;
const row = (values: Record<string, FieldValue>, extra: Partial<TrackerRow> = {}): TrackerRow => ({
  id: String(++n),
  rev: 1,
  values,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  deleted_at: '',
  incomplete: [],
  ...extra,
});
const kpis = (slug: string, rows: TrackerRow[]) =>
  trackerKpis(seed(slug).tracker, seed(slug).fields, rows, TODAY);
const tile = (k: ReturnType<typeof kpis>, id: string) => k.tiles.find((t) => t.id === id)!;

describe('financial year', () => {
  it('runs from 1 April to 31 March', () => {
    expect(financialYear('2026-11-21')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(financialYear('2027-02-01')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(financialYear('2026-04-01')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });
});

describe('DPR', () => {
  // Made-up DPRs: most in progress, several past their scheduled completion.
  const rows = [
    row({
      project: 'A',
      status: 'In progress',
      completion_date: '2026-09-15',
      length_km: 12,
      consultant: 'Alpha',
      stage: 'Draft DPR',
    }),
    row({
      project: 'B',
      status: 'In progress',
      completion_date: '2020-01-01',
      length_km: 100,
      consultant: 'Beta',
      stage: 'Appraisal',
    }),
    row({
      project: 'C',
      status: 'In progress',
      completion_date: '2027-03-01',
      length_km: 50,
      consultant: 'Gamma',
      stage: 'Alignment',
    }),
    row({
      project: 'D',
      status: 'In progress',
      completion_date: '2026-12-15',
      length_km: 5,
      consultant: 'Alpha',
      stage: 'Alignment',
    }),
    row({ project: 'E', status: 'In progress', length_km: 3 }),
    row({ project: 'F', status: 'Completed', completion_date: '2019-09-01', length_km: 1.94 }),
    row({ project: 'G', status: 'On hold', completion_date: '2021-06-01', length_km: 14.4 }),
    row(
      { project: 'H', status: 'In progress', completion_date: '2020-01-01' },
      { deleted_at: '2026-11-01' },
    ),
  ];
  const k = kpis('dpr', rows);

  it('counts late DPRs and the worst delay, leaving out ones on hold, done or deleted', () => {
    expect(tile(k, 'late')).toMatchObject({ value: 2, tone: 'alert', params: { worst: 2516 } });
  });

  it('counts DPRs due in the next 60 days', () => {
    expect(tile(k, 'dueSoon')).toMatchObject({ value: 1, days: 60 });
  });

  it('splits in progress, done and on hold, and adds up the km still being worked on', () => {
    expect(tile(k, 'statusMix')).toMatchObject({ value: 5, params: { done: 1, hold: 1 } });
    expect(tile(k, 'length').value).toBeCloseTo(12 + 100 + 50 + 5 + 3 + 14.4, 1);
  });

  it('shows the pipeline in the stage column’s own order, and late DPRs by consultant', () => {
    const byStage = k.breakdowns.find((b) => b.id === 'byStage')!;
    expect(byStage.items.map((i) => [i.label, i.count])).toEqual([
      ['Alignment', 2],
      ['Draft DPR', 1],
      ['Appraisal', 1],
    ]);
    const late = k.breakdowns.find((b) => b.id === 'lateByGroup')!;
    expect(late.items.map((i) => i.label).sort()).toEqual(['Alpha', 'Beta']);
  });
});

describe('Award Plan', () => {
  const rows = [
    row({
      project: 'Due soon',
      stage: 'Bids invited',
      bdd: '2026-11-30',
      length_km: 28.4,
      total_cost: 1015,
    }),
    row({
      project: 'BDD passed',
      stage: 'Bids received',
      bdd: '2026-11-10',
      length_km: 20,
      total_cost: 900,
    }),
    row({
      project: 'Awarded this year',
      stage: 'Awarded',
      awarded_on: '2026-06-01',
      length_km: 40,
      total_cost: 1400,
    }),
    row({
      project: 'Awarded last year',
      stage: 'Awarded',
      awarded_on: '2026-03-01',
      length_km: 10,
      total_cost: 100,
    }),
  ];
  const k = kpis('award_plan', rows);

  it('counts km and ₹ Cr awarded this financial year', () => {
    expect(tile(k, 'awardedYear')).toMatchObject({ value: 1, params: { km: 40, cr: 1400 } });
  });

  it('counts bids due in 30 days and bids whose due date has passed', () => {
    expect(tile(k, 'dueSoon')).toMatchObject({ value: 1, params: { km: 28.4 } });
    expect(tile(k, 'overdue')).toMatchObject({ value: 1, tone: 'alert' });
    expect(tile(k, 'pipeline')).toMatchObject({ value: 2, params: { km: 48.4, cr: 1915 } });
  });
});

describe('Discussions', () => {
  it('finds who has the most open topics, so they can all be raised together', () => {
    const k = kpis('discussions', [
      row({ discussion_with: 'Member(T)', topic: 'a', status: 'Pending', date: '2026-11-22' }),
      row({ discussion_with: 'Member(T)', topic: 'b', status: 'Pending', date: '2026-11-01' }),
      row({ discussion_with: 'Chairman', topic: 'c', status: 'Pending' }),
      row({ discussion_with: 'Chairman', topic: 'd', status: 'Done' }),
    ]);
    expect(tile(k, 'topGroup')).toMatchObject({ value: 2, group: 'Member(T)' });
    expect(tile(k, 'upcoming').value).toBe(1);
    expect(tile(k, 'overdue').value).toBe(1);
    expect(tile(k, 'open').value).toBe(3);
  });
});

describe('Track', () => {
  it('reads states, finds what has not moved in 15 days and groups by the current state', () => {
    const k = kpis('track', [
      row({ event: 'Stuck', status: 'Active', states: ['Sent (2026-10-01)', 'Approved'] }),
      row({
        event: 'Moving',
        status: 'Active',
        states: ['Sent (2026-11-10)', 'Back (2026-11-19)'],
      }),
      row(
        { event: 'Not started', status: 'Active', states: ['Sent'] },
        { created_at: '2026-11-20T00:00:00Z' },
      ),
      row(
        { event: 'Done', status: 'Closed', states: ['Sent (2026-11-02)'] },
        { updated_at: '2026-11-05T00:00:00Z' },
      ),
    ]);
    expect(tile(k, 'open').value).toBe(3);
    expect(tile(k, 'stale').value).toBe(1);
    expect(tile(k, 'moved').value).toBe(2);
    expect(tile(k, 'closedMonth').value).toBe(1);
    const at = k.breakdowns.find((b) => b.id === 'byState')!;
    expect(at.items).toEqual([
      { label: 'Back', count: 1 },
      { label: 'Sent', count: 1 },
      { label: '', count: 1 },
    ]);
  });

  it('writes and reads a state with and without a date', () => {
    expect(parseStage('Sent to Member (2026-11-12)')).toEqual({
      name: 'Sent to Member',
      date: '2026-11-12',
    });
    expect(parseStage('Approved')).toEqual({ name: 'Approved', date: null });
    expect(formatStage({ name: ' Filed ', date: '2026-01-02' })).toBe('Filed (2026-01-02)');
    expect(currentStage(parseStages(['A (2026-01-01)', 'B (2026-01-05)', 'C']))?.stage.name).toBe(
      'B',
    );
  });
});

describe('Under Observation', () => {
  it('flags items past their target and ones not looked at for 30 days', () => {
    const k = kpis('under_observation', [
      row({ work: 'a', status: 'At risk', target_date: '2026-11-01' }),
      row(
        { work: 'b', status: 'On track', target_date: '2026-11-30' },
        { updated_at: '2026-10-01T00:00:00Z' },
      ),
      row({ work: 'c', status: 'Closed', target_date: '2026-01-01' }),
    ]);
    expect(tile(k, 'watching').value).toBe(2);
    expect(tile(k, 'overdue').value).toBe(1);
    expect(tile(k, 'dueSoon').value).toBe(1);
    expect(tile(k, 'notReviewed').value).toBe(1);
  });
});

describe('a tracker with columns removed', () => {
  it('still works: tiles that need a missing column are left out', () => {
    const s = seed('under_observation');
    const k = trackerKpis(
      s.tracker,
      s.fields.filter((f) => f.key !== 'target_date'),
      [row({ work: 'a', status: 'On track' })],
      TODAY,
    );
    expect(k.tiles.map((t) => t.id)).toEqual(['watching', 'notReviewed']);
  });

  it('matches presets the same way the tiles count', () => {
    const roles = seed('dpr').tracker.settings.roles;
    const r = row({ status: 'On hold', completion_date: '2020-01-01' });
    expect(matchesPreset(r, 'overdue', { roles, today: TODAY })).toBe(false);
    expect(matchesPreset(r, 'open', { roles, today: TODAY })).toBe(true);
  });
});

describe('a row’s name in the list', () => {
  const roles = { ...seed('award_plan').tracker.settings.roles, short_key: 'short' };
  it('is the short name when there is one, else the full name', () => {
    expect(rowName({ project: 'A very long official name', short: 'Pkg-I' }, roles)).toBe('Pkg-I');
    expect(rowName({ project: 'A very long official name', short: '  ' }, roles)).toBe(
      'A very long official name',
    );
    expect(
      rowName({ project: 'Full', short: 'Short' }, seed('award_plan').tracker.settings.roles),
    ).toBe('Full');
  });
});
