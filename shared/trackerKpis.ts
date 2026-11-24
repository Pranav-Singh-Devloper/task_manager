import { shiftDate } from './dates';
import { currentStage, lastMoved, parseStages } from './stages';
import type { FieldDef, FieldValue, TrackerDef, TrackerRoles } from './types';

/**
 * A tracker's dashboard: up to four number tiles, a breakdown or two, and the filters the tiles open. Worked out
 * from the rows and the tracker's column roles, so a renamed column or a new tracker needs no code. Shared by the
 * server (the home page) and the browser (each tracker's page). Words are added by the page from the ids.
 */

export interface TrackerRow {
  id: string;
  rev: number;
  values: Record<string, FieldValue>;
  created_at: string;
  updated_at: string;
  deleted_at: string;
  /** Required columns that are empty: the row gets an "Incomplete" note. */
  incomplete: string[];
}

/** Ready-made filters. A tile opens its tracker's list with one of these. */
export const PRESETS = [
  'all',
  'open',
  'closed',
  'overdue',
  'due',
  'stale',
  'moved',
  'closedMonth',
  'awarded',
  'notReviewed',
] as const;
export type Preset = (typeof PRESETS)[number];

export interface Tile {
  /** Picks the words: trackers.tiles.<id>. */
  id:
    | 'awardedYear'
    | 'dueSoon'
    | 'overdue'
    | 'late'
    | 'pipeline'
    | 'upcoming'
    | 'open'
    | 'topGroup'
    | 'statusMix'
    | 'length'
    | 'stale'
    | 'moved'
    | 'closedMonth'
    | 'watching'
    | 'notReviewed'
    | 'closed'
    | 'sum';
  value: number;
  params: Record<string, string | number>;
  /** "alert" tiles are the ones the home page lists under Needs attention when they are above zero. */
  tone: 'normal' | 'alert' | 'good';
  preset: Preset;
  /** For "due" filters: how many days ahead. */
  days?: number;
  /** Opens the list filtered to this value of the group column. */
  group?: string;
}

export interface BreakdownItem {
  label: string;
  count: number;
  /** A total shown beside the count, such as km. */
  sum?: number;
}

export interface Breakdown {
  /** Picks the words: trackers.breakdowns.<id>. */
  id: 'byStatus' | 'byGroup' | 'byStage' | 'byState' | 'lateByGroup';
  /** The column the items are values of, so a click can filter the list. Empty for Track states. */
  key: string;
  /** The column's label, for the heading. */
  label: string;
  items: BreakdownItem[];
  /** The column summed in `sum`, for its unit. */
  sumKey?: string;
}

export interface TrackerKpis {
  tiles: Tile[];
  breakdowns: Breakdown[];
  total: number;
  open: number;
}

export interface Context {
  roles: TrackerRoles;
  today: string;
  /** For "due" filters. */
  days?: number;
}

const STALE_DAYS = 15;
const MOVED_DAYS = 7;
const REVIEW_DAYS = 30;

const str = (v: FieldValue | undefined): string =>
  v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v).trim();
const dateOf = (v: FieldValue | undefined): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const dayOf = (iso: string): string => iso.slice(0, 10);

/** What a row is called in lists and on the calendar: its short name when it has one, else its full name. */
export function rowName(values: Record<string, FieldValue>, roles: TrackerRoles): string {
  return (roles.short_key ? str(values[roles.short_key]) : '') || str(values[roles.title_key]);
}

export function statusOf(row: TrackerRow, roles: TrackerRoles): string {
  return roles.status_key ? str(row.values[roles.status_key]) : '';
}

export function isClosed(row: TrackerRow, roles: TrackerRoles): boolean {
  const s = statusOf(row, roles).toLowerCase();
  return s !== '' && roles.closed_values.some((c) => c.toLowerCase() === s);
}

/** "On hold" and the like: open, but not expected to move, so never late or due. */
export function isPaused(row: TrackerRow, roles: TrackerRoles): boolean {
  return /\bhold\b/i.test(statusOf(row, roles));
}

const dueOf = (row: TrackerRow, roles: TrackerRoles) =>
  roles.due_key ? dateOf(row.values[roles.due_key]) : null;

/** When the row's states last moved (Track), or failing that when it was added. */
function movedOn(row: TrackerRow, roles: TrackerRoles): string {
  const v = roles.stages_key ? row.values[roles.stages_key] : null;
  const moved = Array.isArray(v) ? lastMoved(parseStages(v)) : null;
  return moved ?? dayOf(row.created_at);
}

/** 1 April to 31 March, the government financial year. */
export function financialYear(today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export function matchesPreset(row: TrackerRow, preset: Preset, ctx: Context): boolean {
  const { roles, today } = ctx;
  const open = !isClosed(row, roles);
  const due = dueOf(row, roles);
  switch (preset) {
    case 'all':
      return true;
    case 'open':
      return open;
    case 'closed':
      return !open;
    case 'overdue':
      return open && !isPaused(row, roles) && due !== null && due < today;
    case 'due':
      return (
        open &&
        !isPaused(row, roles) &&
        due !== null &&
        due >= today &&
        due <= shiftDate(today, ctx.days ?? 7)
      );
    case 'stale':
      return open && movedOn(row, roles) < shiftDate(today, -STALE_DAYS);
    case 'moved':
      return movedOn(row, roles) >= shiftDate(today, -MOVED_DAYS);
    case 'closedMonth':
      return !open && dayOf(row.updated_at).slice(0, 7) === today.slice(0, 7);
    case 'awarded': {
      if (open) return false;
      const fy = financialYear(today);
      const on =
        (roles.done_date_key ? dateOf(row.values[roles.done_date_key]) : null) ??
        dayOf(row.updated_at);
      return on >= fy.from && on <= fy.to;
    }
    case 'notReviewed':
      return open && dayOf(row.updated_at) < shiftDate(today, -REVIEW_DAYS);
  }
}

function sum(rows: TrackerRow[], key: string): number {
  if (!key) return 0;
  let total = 0;
  for (const r of rows) {
    const v = r.values[key];
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return Math.round(total * 100) / 100;
}

/** Counts rows by a column's value, in the column's own option order, then by count. Blank values are left out. */
function countBy(
  rows: TrackerRow[],
  key: string,
  fields: FieldDef[],
  sumKey = '',
): BreakdownItem[] {
  const counts = new Map<string, BreakdownItem>();
  for (const r of rows) {
    const label = str(r.values[key]);
    if (!label) continue;
    const item = counts.get(label) ?? { label, count: 0, ...(sumKey ? { sum: 0 } : {}) };
    item.count += 1;
    if (sumKey) {
      const v = r.values[sumKey];
      if (typeof v === 'number') item.sum = Math.round(((item.sum ?? 0) + v) * 100) / 100;
    }
    counts.set(label, item);
  }
  const order = fields.find((f) => f.key === key)?.options ?? [];
  const rank = (l: string) => {
    const i = order.findIndex((o) => o.toLowerCase() === l.toLowerCase());
    return i < 0 ? order.length : i;
  };
  return [...counts.values()].sort(
    (a, b) => rank(a.label) - rank(b.label) || b.count - a.count || a.label.localeCompare(b.label),
  );
}

const labelOf = (fields: FieldDef[], key: string) =>
  fields.find((f) => f.key === key)?.label ?? key;
const has = (fields: FieldDef[], key: string) =>
  Boolean(key) && fields.some((f) => f.key === key && !f.archived);

export function trackerKpis(
  tracker: TrackerDef,
  fields: FieldDef[],
  allRows: TrackerRow[],
  today: string,
): TrackerKpis {
  const roles = tracker.settings.roles;
  const rows = allRows.filter((r) => !r.deleted_at);
  const ctx: Context = { roles, today };
  const pick = (preset: Preset, days?: number) =>
    rows.filter((r) => matchesPreset(r, preset, { ...ctx, days }));
  const open = pick('open');
  const hasDue = has(fields, roles.due_key);
  const hasStatus = has(fields, roles.status_key);
  const hasGroup = has(fields, roles.group_key);
  const sumKeys = roles.sum_keys.filter((k) => has(fields, k));
  const [kmKey = '', crKey = ''] = sumKeys;
  const tiles: Tile[] = [];
  const breakdowns: Breakdown[] = [];

  const overdueTile = (id: 'overdue' | 'late'): Tile => {
    const late = pick('overdue');
    const worst = late.reduce((m, r) => {
      const due = dueOf(r, roles) as string;
      const days = Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
      return Math.max(m, days);
    }, 0);
    return { id, value: late.length, params: { worst }, tone: 'alert', preset: 'overdue' };
  };
  const dueTile = (id: 'dueSoon' | 'upcoming', days: number): Tile => {
    const soon = pick('due', days);
    return {
      id,
      value: soon.length,
      params: { days, km: sum(soon, kmKey) },
      tone: 'normal',
      preset: 'due',
      days,
    };
  };
  const statusBreakdown = (subset: TrackerRow[]) => {
    if (hasStatus)
      breakdowns.push({
        id: 'byStatus',
        key: roles.status_key,
        label: labelOf(fields, roles.status_key),
        items: countBy(subset, roles.status_key, fields, kmKey),
        sumKey: kmKey || undefined,
      });
  };
  const groupBreakdown = (subset: TrackerRow[]) => {
    if (hasGroup && roles.group_key !== roles.status_key)
      breakdowns.push({
        id: 'byGroup',
        key: roles.group_key,
        label: labelOf(fields, roles.group_key),
        items: countBy(subset, roles.group_key, fields, kmKey),
        sumKey: kmKey || undefined,
      });
  };

  switch (tracker.kind) {
    case 'award': {
      const awarded = pick('awarded');
      tiles.push({
        id: 'awardedYear',
        value: awarded.length,
        params: {
          km: sum(awarded, kmKey),
          cr: sum(awarded, crKey),
          targetKm: tracker.settings.targets.km ?? 0,
          targetCr: tracker.settings.targets.cr ?? 0,
        },
        tone: 'good',
        preset: 'awarded',
      });
      if (hasDue) tiles.push(dueTile('dueSoon', 30), overdueTile('overdue'));
      tiles.push({
        id: 'pipeline',
        value: open.length,
        params: { km: sum(open, kmKey), cr: sum(open, crKey) },
        tone: 'normal',
        preset: 'open',
      });
      statusBreakdown(rows);
      groupBreakdown(open);
      break;
    }
    case 'discussion': {
      if (hasDue) tiles.push(dueTile('upcoming', 7));
      tiles.push({ id: 'open', value: open.length, params: {}, tone: 'normal', preset: 'open' });
      if (hasDue) tiles.push(overdueTile('overdue'));
      if (hasGroup) {
        const top = countBy(open, roles.group_key, fields).sort((a, b) => b.count - a.count)[0];
        if (top)
          tiles.push({
            id: 'topGroup',
            value: top.count,
            params: { name: top.label, column: labelOf(fields, roles.group_key) },
            tone: 'normal',
            preset: 'open',
            group: top.label,
          });
      }
      groupBreakdown(open);
      break;
    }
    case 'dpr': {
      if (hasDue) tiles.push(overdueTile('late'), dueTile('dueSoon', 60));
      const paused = open.filter((r) => isPaused(r, roles)).length;
      tiles.push({
        id: 'statusMix',
        value: open.length - paused,
        params: { done: rows.length - open.length, hold: paused },
        tone: 'normal',
        preset: 'open',
      });
      if (kmKey)
        tiles.push({
          id: 'length',
          value: sum(open, kmKey),
          params: { count: open.length },
          tone: 'normal',
          preset: 'open',
        });
      if (has(fields, roles.stage_key))
        breakdowns.push({
          id: 'byStage',
          key: roles.stage_key,
          label: labelOf(fields, roles.stage_key),
          items: countBy(
            open.filter((r) => !isPaused(r, roles)),
            roles.stage_key,
            fields,
            kmKey,
          ),
          sumKey: kmKey || undefined,
        });
      if (hasGroup && hasDue) {
        const late = countBy(pick('overdue'), roles.group_key, fields).sort(
          (a, b) => b.count - a.count,
        );
        breakdowns.push({
          id: 'lateByGroup',
          key: roles.group_key,
          label: labelOf(fields, roles.group_key),
          items: late,
        });
      }
      break;
    }
    case 'track': {
      tiles.push(
        { id: 'open', value: open.length, params: {}, tone: 'normal', preset: 'open' },
        {
          id: 'stale',
          value: pick('stale').length,
          params: { days: STALE_DAYS },
          tone: 'alert',
          preset: 'stale',
        },
        {
          id: 'moved',
          value: pick('moved').length,
          params: { days: MOVED_DAYS },
          tone: 'normal',
          preset: 'moved',
        },
        {
          id: 'closedMonth',
          value: pick('closedMonth').length,
          params: {},
          tone: 'good',
          preset: 'closedMonth',
        },
      );
      if (has(fields, roles.stages_key)) {
        const at = new Map<string, number>();
        let none = 0;
        for (const r of open) {
          const v = r.values[roles.stages_key];
          const cur = Array.isArray(v) ? currentStage(parseStages(v)) : null;
          if (cur) at.set(cur.stage.name, (at.get(cur.stage.name) ?? 0) + 1);
          else none += 1;
        }
        const items = [...at.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        if (none > 0) items.push({ label: '', count: none });
        breakdowns.push({
          id: 'byState',
          key: '',
          label: labelOf(fields, roles.stages_key),
          items,
        });
      }
      break;
    }
    case 'observation': {
      tiles.push({
        id: 'watching',
        value: open.length,
        params: {},
        tone: 'normal',
        preset: 'open',
      });
      if (hasDue) tiles.push(overdueTile('overdue'), dueTile('dueSoon', 14));
      tiles.push({
        id: 'notReviewed',
        value: pick('notReviewed').length,
        params: { days: REVIEW_DAYS },
        tone: 'alert',
        preset: 'notReviewed',
      });
      statusBreakdown(open);
      break;
    }
    default: {
      tiles.push({ id: 'open', value: open.length, params: {}, tone: 'normal', preset: 'open' });
      if (hasDue) tiles.push(overdueTile('overdue'), dueTile('dueSoon', 7));
      if (kmKey)
        tiles.push({
          id: 'sum',
          value: sum(open, kmKey),
          params: { column: labelOf(fields, kmKey) },
          tone: 'normal',
          preset: 'open',
        });
      else if (hasStatus)
        tiles.push({
          id: 'closed',
          value: rows.length - open.length,
          params: {},
          tone: 'good',
          preset: 'closed',
        });
      groupBreakdown(open);
      if (!hasGroup || roles.group_key === roles.status_key) statusBreakdown(rows);
    }
  }

  return { tiles: tiles.slice(0, 4), breakdowns, total: rows.length, open: open.length };
}

/** The search box: any shown column contains every word typed. */
export function matchesSearch(row: TrackerRow, fields: FieldDef[], q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields
    .filter((f) => f.searchable && !f.archived)
    .map((f) => str(row.values[f.key]).toLowerCase())
    .join(' \n ');
  return words.every((w) => hay.includes(w));
}
