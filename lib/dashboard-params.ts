import { shiftDate, todayIn } from '@/shared/dates';
import { FILTER_OPS, type FilterSpec } from '@/shared/filters';
import type { Settings } from '@/shared/types';

export type Range = 'any' | 'today' | 'week' | 'month' | 'custom';
export type Tab = 'upcoming' | 'past';
export type View = 'table' | 'calendar';
/** Meetings that need a closer look, shown from the line at the top of the dashboard. */
export type Attention = '' | 'incomplete' | 'awaiting';

export interface DashboardParams {
  q: string;
  category: string;
  workspace: string;
  status: string;
  range: Range;
  from: string;
  to: string;
  sort: string;
  dir: '' | 'asc' | 'desc';
  filters: FilterSpec[];
  attention: Attention;
}

export const EMPTY: DashboardParams = {
  q: '',
  category: '',
  workspace: '',
  status: '',
  range: 'any',
  from: '',
  to: '',
  sort: '',
  dir: '',
  filters: [],
  attention: '',
};

const RANGES: Range[] = ['any', 'today', 'week', 'month', 'custom'];

/** Reads the dashboard's state from the address bar. Anything unreadable is ignored, so a bad link still opens the page. */
export function parseParams(search: URLSearchParams): DashboardParams {
  const get = (k: string) => search.get(k) ?? '';
  const range = get('range') as Range;
  let filters: FilterSpec[] = [];
  try {
    const raw: unknown = JSON.parse(get('filters') || '[]');
    if (Array.isArray(raw)) {
      filters = raw.filter(
        (f): f is FilterSpec =>
          typeof f === 'object' &&
          f !== null &&
          typeof f.field === 'string' &&
          (FILTER_OPS as readonly string[]).includes(f.op),
      );
    }
  } catch {
    // ignore
  }
  const attention = get('show');
  return {
    q: get('q'),
    category: get('category'),
    workspace: get('workspace'),
    status: get('status'),
    range: RANGES.includes(range) ? range : 'any',
    from: get('from'),
    to: get('to'),
    sort: get('sort'),
    dir: get('dir') === 'asc' || get('dir') === 'desc' ? (get('dir') as 'asc' | 'desc') : '',
    filters,
    attention: attention === 'incomplete' || attention === 'awaiting' ? attention : '',
  };
}

/** The address-bar form. Empty values are left out so the link stays short and tidy. */
export function toSearch(p: DashboardParams): string {
  const s = new URLSearchParams();
  const put = (k: string, v: string) => v && s.set(k, v);
  put('q', p.q.trim());
  put('category', p.category);
  put('workspace', p.workspace);
  put('status', p.status);
  if (p.range !== 'any') s.set('range', p.range);
  if (p.range === 'custom') {
    put('from', p.from);
    put('to', p.to);
  }
  put('sort', p.sort);
  put('dir', p.dir);
  if (p.filters.length > 0) s.set('filters', JSON.stringify(p.filters));
  put('show', p.attention);
  return s.toString();
}

/** The dates a range means, today being in the configured timezone. */
export function rangeDates(
  p: Pick<DashboardParams, 'range' | 'from' | 'to'>,
  settings: Settings,
  now = new Date(),
): { from?: string; to?: string } {
  const today = todayIn(settings.timezone, now);
  switch (p.range) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const first = { monday: 1, sunday: 0, saturday: 6 }[settings.week_starts_on as 'monday'] ?? 1;
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      const start = shiftDate(today, -((weekday - first + 7) % 7));
      return { from: start, to: shiftDate(start, 6) };
    }
    case 'month': {
      const [y, m] = today.split('-').map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return {
        from: `${y}-${String(m).padStart(2, '0')}-01`,
        to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      };
    }
    case 'custom':
      return { from: p.from || undefined, to: p.to || undefined };
    default:
      return {};
  }
}

export interface ApiQueryExtras {
  scope: Tab | 'all';
  limit?: number;
  cursor?: string;
  /** The dates the calendar is showing. They narrow the Dates control. */
  from?: string;
  to?: string;
}

/** The query string for GET /api/meetings. The table and the calendar both build theirs here, so they filter identically. */
export function toApiQuery(
  p: DashboardParams,
  settings: Settings,
  extra: ApiQueryExtras,
  now = new Date(),
): string {
  const s = new URLSearchParams();
  const put = (k: string, v: string | undefined) => v && s.set(k, v);
  const attention = p.attention !== '';
  s.set('scope', attention ? 'all' : extra.scope);
  put('q', p.q.trim());
  put('category', p.category);
  put('workspace', p.workspace);
  put('status', p.status);
  // The calendar's visible dates narrow the Dates control instead of replacing it, so both views filter alike.
  const range = rangeDates(p, settings, now);
  const from = [extra.from, range.from].filter(Boolean).sort().pop();
  const to = [extra.to, range.to].filter(Boolean).sort()[0];
  put('from', from);
  put('to', to);
  put('sort', p.sort);
  put('dir', p.dir);
  if (p.filters.length > 0) s.set('filters', JSON.stringify(p.filters));
  if (p.attention === 'incomplete') s.set('incomplete', '1');
  if (p.attention === 'awaiting') s.set('awaiting', '1');
  if (extra.limit) s.set('limit', String(extra.limit));
  put('cursor', extra.cursor);
  return s.toString();
}

/** True when anything narrows the list, so "Clear all" and the empty message know what to say. */
export function isFiltered(p: DashboardParams): boolean {
  return Boolean(
    p.q.trim() ||
    p.category ||
    p.workspace ||
    p.status ||
    p.range !== 'any' ||
    p.filters.length ||
    p.attention,
  );
}
