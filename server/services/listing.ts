import { isUpcoming } from '../../shared/dates';
import { filterMatches, kindOf, type FilterSpec } from '../../shared/filters';
import type { Meeting } from '../../shared/meeting';
import type { FieldType, FieldValue } from '../../shared/types';
import { missingRequired } from '../../shared/validation';
import type { CategoryConfig } from './config';
import { titleOf, toMeeting } from './meetingView';
import type { Entry, SheetStore, Snapshot } from './store';

export interface ListOptions {
  scope?: 'upcoming' | 'past' | 'all';
  category?: string;
  workspace?: string;
  status?: string;
  deleted?: 'exclude' | 'only' | 'include';
  /** Case-insensitive search over every text field, the title, the category, the workspace and file names. */
  q?: string;
  /** Inclusive date range, YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** "date" (default), "time", "title", "category", "status", "workspace", or any column key. */
  sort?: string;
  dir?: 'asc' | 'desc';
  filters?: FilterSpec[];
  /** Only meetings waiting for a next date. */
  awaiting?: boolean;
  /** Only meetings with a required detail missing. */
  incomplete?: boolean;
  limit?: number;
  offset?: number;
}

export interface Page {
  meetings: Meeting[];
  /** How many meetings match, before paging. */
  total: number;
  /** Where the next page starts, or null at the end. */
  nextOffset: number | null;
}

interface Row {
  slug: string;
  cfg: CategoryConfig;
  entry: Entry;
}

const OPEN = new Set(['Scheduled', 'Rescheduled']);
export const isOpenStatus = (s: unknown) => OPEN.has(String(s || 'Scheduled'));

/**
 * Finds, orders and pages meetings on the cached copy (§4.6). Cheap checks run on the raw values; a meeting is only fully
 * built (title, calculated columns) when a filter or sort needs it, or when it is on the page being returned.
 */
export function queryMeetings(store: SheetStore, snap: Snapshot, o: ListOptions): Page {
  const tz = snap.config.settings.timezone;
  const minutes = Number(snap.config.settings.default_duration_min);
  const now = store.now();
  const scope = o.scope ?? 'all';
  const needle = (o.q ?? '').trim().toLowerCase();
  const typeByKey = new Map<string, FieldType>();
  for (const f of snap.config.fields) if (!typeByKey.has(f.key)) typeByKey.set(f.key, f.type);
  const workspaceName = new Map(snap.config.workspaces.map((w) => [w.slug, w.name]));

  const built = new Map<string, Meeting>();
  const meetingOf = (r: Row): Meeting => {
    let m = built.get(r.entry.id);
    if (!m) {
      m = toMeeting(store, snap, r.slug, r.entry);
      built.set(r.entry.id, m);
    }
    return m;
  };

  const rows: Row[] = [];
  for (const [slug, data] of snap.categories) {
    if (o.category && o.category !== slug) continue;
    const cfg = snap.config.byCategory.get(slug);
    if (!cfg) continue;
    for (const entry of data.entries.values()) rows.push({ slug, cfg, entry });
  }

  const matches = (r: Row): boolean => {
    const { values, system } = r.entry.record;
    const deleted = Boolean(system.deleted_at);
    if (o.deleted === 'only' ? !deleted : o.deleted === 'include' ? false : deleted) return false;
    if (o.workspace && values.workspace !== o.workspace) return false;
    if (o.status && values.meeting_status !== o.status) return false;
    if (o.awaiting && !system.awaiting_next) return false;
    if (
      o.incomplete &&
      missingRequired(r.cfg.fields, values, Boolean(r.cfg.category.title_template)).length === 0
    )
      return false;

    const date = typeof values.date === 'string' ? values.date : null;
    if ((o.from || o.to) && (!date || (o.from && date < o.from) || (o.to && date > o.to)))
      return false;
    if (scope !== 'all') {
      if (!date || typeof values.start_time !== 'string') return false;
      const upcoming = isUpcoming(
        date,
        values.start_time,
        values.end_time as string | null,
        minutes,
        tz,
        now,
      );
      if ((scope === 'upcoming') !== upcoming) return false;
    }

    if (needle && !haystack(r).includes(needle)) return false;

    for (const spec of o.filters ?? []) {
      const kind = kindOf(
        spec.field === 'title' || spec.field === 'category'
          ? spec.field
          : (typeByKey.get(spec.field) ?? 'text'),
      );
      let value: unknown;
      if (spec.field === 'title') value = titleOf(snap, r.slug, values);
      else if (spec.field === 'category') value = r.cfg.category.name;
      else if (typeByKey.get(spec.field) === 'computed') value = meetingOf(r).computed[spec.field];
      else value = values[spec.field];
      if (!filterMatches(spec, value as FieldValue, kind)) return false;
    }
    return true;
  };

  /** Everything a person could search for, in one lower-case string. Fields are separated so words never run together. */
  function haystack(r: Row): string {
    const { values } = r.entry.record;
    const parts: string[] = [titleOf(snap, r.slug, values), r.cfg.category.name];
    const ws = workspaceName.get(String(values.workspace ?? ''));
    if (ws) parts.push(ws);
    for (const f of r.cfg.fields) {
      if (f.type === 'computed' || f.type === 'auto_number') continue;
      const v = values[f.key];
      if (v === null || v === undefined || v === '' || typeof v === 'boolean') continue;
      parts.push(Array.isArray(v) ? v.join(' ') : String(v));
    }
    parts.push(...(snap.fileNames.get(r.entry.id) ?? []));
    return parts.join('\n').toLowerCase();
  }

  const found = rows.filter(matches);

  // ---- order ----
  const sort = o.sort || 'date';
  const dir = o.dir ?? (scope === 'past' ? 'desc' : 'asc');
  const timeKey = (r: Row) =>
    `${r.entry.record.values.date ?? ''} ${r.entry.record.values.start_time ?? ''}`;
  const sortValue = (r: Row): string | number | null => {
    const v = r.entry.record.values;
    switch (sort) {
      case 'date':
        return v.date ? timeKey(r) : null;
      case 'time':
        return (v.start_time as string) ?? null;
      case 'title':
        return titleOf(snap, r.slug, v).toLowerCase();
      case 'category':
        return r.cfg.category.name.toLowerCase();
      case 'workspace':
        return (workspaceName.get(String(v.workspace ?? '')) ?? '').toLowerCase() || null;
      case 'status':
        return String(v.meeting_status ?? '').toLowerCase() || null;
      default: {
        const raw = typeByKey.get(sort) === 'computed' ? meetingOf(r).computed[sort] : v[sort];
        if (raw === null || raw === undefined || raw === '') return null;
        if (typeof raw === 'number') return raw;
        return (Array.isArray(raw) ? raw.join(', ') : String(raw)).toLowerCase();
      }
    }
  };
  const keyed = found.map((r) => ({ r, k: sortValue(r) }));
  keyed.sort((a, b) => {
    // Blanks always go last, whichever way it is sorted.
    if (a.k === null || b.k === null) return a.k === b.k ? 0 : a.k === null ? 1 : -1;
    const c =
      typeof a.k === 'number' && typeof b.k === 'number'
        ? a.k - b.k
        : String(a.k).localeCompare(String(b.k), 'en', { numeric: true });
    return dir === 'desc' ? -c : c;
  });
  // Equal values keep a steady order: by date and time, then id.
  const settle = (x: { r: Row; k: unknown }, y: { r: Row; k: unknown }) =>
    timeKey(x.r).localeCompare(timeKey(y.r)) || x.r.entry.id.localeCompare(y.r.entry.id);
  for (let i = 0; i < keyed.length;) {
    let j = i + 1;
    while (j < keyed.length && keyed[j]!.k === keyed[i]!.k) j += 1;
    if (j - i > 1) {
      const run = keyed.slice(i, j).sort(dir === 'desc' ? (a, b) => settle(b, a) : settle);
      keyed.splice(i, j - i, ...run);
    }
    i = j;
  }

  // ---- page ----
  const offset = Math.max(0, o.offset ?? 0);
  const end = o.limit === undefined ? keyed.length : Math.min(keyed.length, offset + o.limit);
  return {
    meetings: keyed.slice(offset, end).map(({ r }) => meetingOf(r)),
    total: keyed.length,
    nextOffset: end < keyed.length ? end : null,
  };
}
