import { formatInTimeZone } from 'date-fns-tz';
import { shiftDate } from '../../../../shared/dates';
import { newId } from '../../../../shared/ids';
import { parseTrackers } from '../../../../shared/configRows';
import { TAB, rowFromObject } from '../../../../shared/schema';
import type { Cell } from '../../../../shared/types';
import type { GoogleServices } from '../types';

type Row = Record<string, Cell | [string, number | null][]>;

/**
 * Made-up rows for every tracker in mock mode. Dates are days from today, so the demo always has something late, due
 * soon and done. `[name, offset]` pairs are Track states; a null offset is a state not reached yet.
 */
const DEMO: Record<string, Row[]> = {
  award_plan: [
    {
      project: '4L Ring Road, Package 3',
      mode: 'HAM',
      length_km: 28.4,
      civil_cost: 640,
      total_cost: 1015,
      bdd: 5,
      stage: 'Bids invited',
    },
    {
      project: '6L Expressway Spur, Package 1',
      mode: 'EPC',
      length_km: 21.4,
      civil_cost: 610,
      total_cost: 905,
      bdd: -4,
      stage: 'Bids received',
    },
    {
      project: 'Town Bypass, Package 2',
      mode: 'HAM',
      length_km: 18,
      civil_cost: 420,
      total_cost: 690,
      bdd: 40,
      stage: 'Gazette notification',
    },
    {
      project: 'NH Widening, Package 5',
      mode: 'EPC',
      length_km: 42,
      civil_cost: 980,
      total_cost: 1420,
      bdd: -30,
      stage: 'Awarded',
      awarded_on: -1,
    },
  ],
  discussions: [
    {
      discussion_with: 'Member(T)',
      topic: 'File 4521: extension of time',
      date: 1,
      status: 'Pending',
    },
    { discussion_with: 'Member(T)', topic: 'Land acquisition review', date: -3, status: 'Pending' },
    { discussion_with: 'Chairman', topic: 'Annual award plan', date: 5, status: 'Pending' },
    {
      discussion_with: 'Member(P)',
      topic: 'Toll plaza shifting',
      date: -10,
      status: 'Done',
      outcome: 'Agreed to shift by 2 km.',
    },
  ],
  dpr: [
    {
      project: 'Bypass DPR',
      consultant: 'Alpha Consultants',
      piu: 'PIU Alpha',
      ro: 'RO Demo',
      state: 'Maharashtra',
      length_km: 30,
      completion_date: -60,
      stage: 'Alignment',
      status: 'In progress',
    },
    {
      project: 'Flyover DPR',
      consultant: 'Beta Infra',
      piu: 'PIU Beta',
      ro: 'RO Demo',
      state: 'Maharashtra',
      length_km: 3.5,
      completion_date: 30,
      stage: 'Draft DPR',
      status: 'In progress',
    },
    {
      project: 'Ring Road DPR',
      consultant: 'Alpha Consultants',
      piu: 'PIU Alpha',
      ro: 'RO Demo',
      state: 'Maharashtra',
      length_km: 120,
      completion_date: -200,
      stage: 'Appraisal',
      status: 'In progress',
    },
    {
      project: 'Coastal Road DPR',
      consultant: 'Gamma Engineers',
      piu: 'PIU Gamma',
      ro: 'RO Demo',
      state: 'Goa',
      length_km: 15,
      completion_date: -400,
      stage: 'Final DPR',
      status: 'Completed',
    },
    {
      project: 'Spur Road DPR',
      consultant: 'Beta Infra',
      piu: 'PIU Beta',
      ro: 'RO Demo',
      state: 'Maharashtra',
      length_km: 10,
      completion_date: -90,
      stage: 'Feasibility',
      status: 'On hold',
    },
  ],
  track: [
    {
      event: 'File 7781: EoT approval',
      states: [
        ['Sent to GM', -20],
        ['With Member', -18],
        ['Approved', null],
      ],
      status: 'Active',
    },
    {
      event: 'Tender 12: technical evaluation',
      states: [
        ['Bids opened', -3],
        ['Evaluation', -1],
        ['Financial bid', null],
      ],
      status: 'Active',
    },
    {
      event: 'Court reply draft',
      states: [
        ['Draft', -12],
        ['Vetted', -6],
        ['Filed', -2],
      ],
      status: 'Closed',
    },
  ],
  under_observation: [
    {
      work: 'Bridge repair, Km 45',
      status: 'At risk',
      target_date: -5,
      remarks_1: 'Contractor asked for more time.',
    },
    { work: 'Toll plaza works', status: 'On track', target_date: 10 },
    { work: 'Drainage works', status: 'Delayed', target_date: 40 },
  ],
};

const DATE_KEYS = new Set(['bdd', 'awarded_on', 'date', 'completion_date', 'target_date']);

export async function seedDemoTrackers(
  google: Pick<GoogleServices, 'sheets'>,
  spreadsheetId: string,
  now: Date,
  timezone: string,
): Promise<void> {
  const today = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const tabs = await google.sheets.getTabs(spreadsheetId);
  const trackersTab = tabs.find((t) => t.title === TAB.trackers);
  if (!trackersTab) return;
  const trackers = parseTrackers(
    (await google.sheets.batchGet(spreadsheetId, [trackersTab.gid]))[trackersTab.gid] ?? [],
  ).items;
  const gids = trackers.map((t) => t.sheet_gid).filter((g): g is number => g !== null);
  const contents = await google.sheets.batchGet(spreadsheetId, gids);
  const createdAt = now.toISOString();

  for (const t of trackers) {
    const rows = DEMO[t.slug];
    if (!rows || t.sheet_gid === null) continue;
    const headers = (contents[t.sheet_gid]?.[0] ?? []).map((c) => String(c ?? ''));
    if ((contents[t.sheet_gid] ?? []).length > 1) continue; // already has rows
    const out = rows.map((r, i) => {
      const obj: Record<string, Cell> = {
        sr_no: i + 1,
        id: newId(),
        rev: 1,
        created_at: createdAt,
        updated_at: createdAt,
        created_by: 'demo',
      };
      for (const [k, v] of Object.entries(r)) {
        if (Array.isArray(v)) {
          obj[k] = v
            .map(([name, offset]) =>
              offset === null ? name : `${name} (${shiftDate(today, offset)})`,
            )
            .join('\n');
        } else if (DATE_KEYS.has(k) && typeof v === 'number') {
          obj[k] = shiftDate(today, v);
        } else {
          obj[k] = v;
        }
      }
      return rowFromObject(headers, obj);
    });
    await google.sheets.appendRows(spreadsheetId, t.sheet_gid, out);
  }
}
