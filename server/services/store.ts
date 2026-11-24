import type { Logger } from 'pino';
import { isUpcoming } from '../../shared/dates';
import { newId } from '../../shared/ids';
import type { FileRecord, SystemFields } from '../../shared/meeting';
import { SYSTEM_COLUMNS, TAB } from '../../shared/schema';
import type { Cell, FieldValue } from '../../shared/types';
import { DatabaseMissingError } from '../lib/errors';
import { KeyedMutex } from '../lib/mutex';
import { isGoogleApiError } from './google/errors';
import { ActivityLog, type AuditEntry } from './audit';
import {
  buildConfig,
  type CategoryConfig,
  type Config,
  type TabConfig,
  type TrackerConfig,
} from './config';
import { orderOptionsByUse } from './lookups';
import type { GoogleServices, TabInfo } from './google/types';
import { headingKeys, parseRow, serializeRow, type RowRecord } from './rows';

/** Log tabs only grow and are read on demand, so they are not cached. */
/** _audit only grows and is read on demand. _reschedules and _files are small enough to keep, for counts and search. */
const NOT_CACHED: string[] = [TAB.audit, TAB.system];

export interface Entry {
  id: string;
  /** 1-based row in the tab. Never trusted without re-reading the id cell first (§4.6). */
  row: number;
  record: RowRecord;
}

export interface AttentionItem {
  tab: string;
  row: number;
  message: string;
}

export interface CategoryData {
  slug: string;
  gid: number;
  title: string;
  headers: string[];
  entries: Map<string, Entry>;
  attention: AttentionItem[];
}

export interface Snapshot {
  loadedAt: number;
  version: number;
  spreadsheetId: string;
  tabs: TabInfo[];
  config: Config;
  categories: Map<string, CategoryData>;
  /** Tracker rows, by tracker slug. Kept apart from meetings so meeting code never sees them. */
  trackers: Map<string, CategoryData>;
  /** Raw rows of every cached tab, by gid. Row 1 is the header. */
  raw: Map<number, Cell[][]>;
  /** How many times each meeting has been rescheduled, for the "Rescheduled ×N" chip. */
  rescheduleCounts: Map<string, number>;
  /** Names of the files attached to each meeting, so search can find them. */
  fileNames: Map<string, string[]>;
  /** Every file row that is not removed, by meeting id (pending and attached). */
  files: Map<string, FileRecord[]>;
}

export interface StoreOptions {
  logger: Logger;
  clock?: () => Date;
  ttlMs?: number;
}

/** Counts rows by the value in one column of a log tab. */
function countBy(rows: Cell[][], column: string): Map<string, number> {
  const col = headerOf(rows).indexOf(column);
  const out = new Map<string, number>();
  if (col < 0) return out;
  for (const r of rows.slice(1)) {
    const key = String(r[col] ?? '').trim();
    if (key) out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** Reads the _files tab into records, skipping rows with no id or meeting. */
export function fileRecordsOf(rows: Cell[][]): FileRecord[] {
  const h = headerOf(rows);
  const at = (r: Cell[], key: string) => String(r[h.indexOf(key)] ?? '').trim();
  const out: FileRecord[] = [];
  for (const r of rows.slice(1)) {
    const id = at(r, 'id');
    const meeting_id = at(r, 'meeting_id');
    if (!id || !meeting_id) continue;
    const status = at(r, 'status');
    out.push({
      id,
      meeting_id,
      category_slug: at(r, 'category_slug'),
      name: at(r, 'name'),
      mime: at(r, 'mime'),
      size: Number(at(r, 'size')) || 0,
      drive_file_id: at(r, 'drive_file_id'),
      view_link: at(r, 'view_link'),
      status: status === 'pending' || status === 'removed' ? status : 'attached',
      uploaded_at: at(r, 'uploaded_at'),
    });
  }
  return out;
}

function groupFiles(records: FileRecord[]): Map<string, FileRecord[]> {
  const out = new Map<string, FileRecord[]>();
  for (const f of records) {
    if (f.status === 'removed') continue;
    out.set(f.meeting_id, [...(out.get(f.meeting_id) ?? []), f]);
  }
  return out;
}

function fileNamesOf(rows: Cell[][]): Map<string, string[]> {
  const h = headerOf(rows);
  const [mid, name, status] = [h.indexOf('meeting_id'), h.indexOf('name'), h.indexOf('status')];
  const out = new Map<string, string[]>();
  if (mid < 0 || name < 0) return out;
  for (const r of rows.slice(1)) {
    const id = String(r[mid] ?? '').trim();
    const n = String(r[name] ?? '').trim();
    if (!id || !n || (status >= 0 && String(r[status] ?? '') === 'removed')) continue;
    out.set(id, [...(out.get(id) ?? []), n]);
  }
  return out;
}

const isBlankRow = (row: Cell[]) =>
  row.every((c) => c === null || c === undefined || String(c).trim() === '');
const headerOf = (rows: Cell[][]) => (rows[0] ?? []).map((c) => String(c ?? '').trim());

/**
 * The in-memory copy of the spreadsheet (§4.6). One batchGet loads everything. Reads never touch Sheets once per request:
 * the copy is reused for 30 seconds, then reloaded. Writes go to Sheets first and then into the copy (write-through).
 */
export class SheetStore {
  readonly mutex = new KeyedMutex();
  readonly log: ActivityLog;
  private snap: Snapshot | null = null;
  private loading: Promise<Snapshot> | null = null;
  private version = 0;
  private groupCounts = new Map<string, Map<string, number>>();
  private readonly clock: () => Date;
  private readonly ttlMs: number;
  readonly logger: Logger;

  constructor(
    readonly google: GoogleServices,
    readonly spreadsheetId: string,
    options: StoreOptions,
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 30_000;
    this.logger = options.logger;
    this.log = new ActivityLog(google, spreadsheetId, options.logger, this.clock);
  }

  now(): Date {
    return this.clock();
  }

  /** The cached copy, reloaded first if it is older than the TTL. */
  async snapshot(): Promise<Snapshot> {
    if (this.snap && this.clock().getTime() - this.snap.loadedAt < this.ttlMs) return this.snap;
    return this.refresh();
  }

  /** Forces a reload from the Sheet (the Refresh button). Concurrent callers share one load. */
  async refresh(): Promise<Snapshot> {
    if (!this.loading) {
      this.loading = this.load().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  tabKey(gid: number): string {
    return `${this.spreadsheetId}:${gid}`;
  }

  get lastLoadedAt(): number | null {
    return this.snap?.loadedAt ?? null;
  }

  // ---------- loading ----------

  private async load(): Promise<Snapshot> {
    const previous = this.snap;
    let tabs: TabInfo[];
    try {
      tabs = await this.google.sheets.getTabs(this.spreadsheetId);
    } catch (err) {
      if (isGoogleApiError(err, 404)) throw new DatabaseMissingError();
      throw err;
    }
    const cacheable = tabs.filter((t) => !NOT_CACHED.includes(t.title));
    const data = await this.google.sheets.batchGet(
      this.spreadsheetId,
      cacheable.map((t) => t.gid),
    );
    const raw = new Map<number, Cell[][]>(cacheable.map((t) => [t.gid, data[t.gid] ?? []]));
    const rowsOf = (title: string) => {
      const tab = tabs.find((t) => t.title === title);
      return tab ? (raw.get(tab.gid) ?? []) : [];
    };

    const config = buildConfig(
      {
        categories: rowsOf(TAB.categories),
        fields: rowsOf(TAB.fields),
        workspaces: rowsOf(TAB.workspaces),
        settings: rowsOf(TAB.settings),
        trackers: rowsOf(TAB.trackers),
      },
      tabs,
    );

    orderOptionsByUse(config, rowsOf(TAB.lookups));

    const categories = new Map<string, CategoryData>();
    const adopt: { cat: CategoryConfig; row: number }[] = [];
    for (const cfg of config.byCategory.values()) {
      const rows = raw.get(cfg.tab.gid) ?? [];
      const headers = await this.syncHeaders(cfg, headerOf(rows), rows, tabs);
      const built = this.buildCategory(cfg, headers, rows);
      categories.set(cfg.category.slug, built.data);
      for (const row of built.toAdopt) adopt.push({ cat: cfg, row });
    }

    const trackers = new Map<string, CategoryData>();
    const adoptTracker: { cfg: TrackerConfig; row: number }[] = [];
    for (const cfg of config.byTracker.values()) {
      const rows = raw.get(cfg.tab.gid) ?? [];
      const headers = await this.syncHeaders(cfg, headerOf(rows), rows, tabs);
      const built = this.buildTracker(cfg, headers, rows);
      trackers.set(cfg.tracker.slug, built.data);
      for (const row of built.toAdopt) adoptTracker.push({ cfg, row });
    }

    const snap: Snapshot = {
      loadedAt: this.clock().getTime(),
      version: ++this.version,
      spreadsheetId: this.spreadsheetId,
      tabs,
      config,
      categories,
      trackers,
      raw,
      rescheduleCounts: countBy(rowsOf(TAB.reschedules), 'meeting_id'),
      fileNames: fileNamesOf(rowsOf(TAB.files)),
      files: groupFiles(fileRecordsOf(rowsOf(TAB.files))),
    };
    this.snap = snap;
    this.groupCounts.clear();

    await this.adoptRows(snap, adopt);
    await this.adoptTrackerRows(snap, adoptTracker);
    await this.detectSheetReschedules(previous, snap);
    return snap;
  }

  /** Tracker rows: any row with something in it is kept. A row typed or pasted into the Sheet gets an id. */
  private buildTracker(
    cfg: TrackerConfig,
    headers: string[],
    rows: Cell[][],
  ): { data: CategoryData; toAdopt: number[] } {
    const entries = new Map<string, Entry>();
    const attention: AttentionItem[] = [];
    const toAdopt: number[] = [];
    const seen = new Set<string>();
    rows.slice(1).forEach((cells, i) => {
      const row = i + 2;
      if (isBlankRow(cells)) return;
      const record = parseRow(headers, cells, cfg.fields);
      const id = record.system.id;
      if (!id || seen.has(id)) {
        toAdopt.push(row);
        return;
      }
      seen.add(id);
      entries.set(id, { id, row, record });
      for (const p of record.problems)
        attention.push({ tab: cfg.tab.title, row, message: `Row ${row}: ${p}` });
    });
    return {
      data: {
        slug: cfg.tracker.slug,
        gid: cfg.tab.gid,
        title: cfg.tab.title,
        headers,
        entries,
        attention,
      },
      toAdopt,
    };
  }

  /**
   * Rows typed or pasted straight into a tracker's tab become real rows: an id, a rev, a created time and a number
   * are written back, and a select left blank gets its default. Logged with source "sheet".
   */
  private async adoptTrackerRows(
    snap: Snapshot,
    adopt: { cfg: TrackerConfig; row: number }[],
  ): Promise<void> {
    if (adopt.length === 0) return;
    const now = this.clock().toISOString();
    const blocks: { gid: number; startRow: number; rows: Cell[][] }[] = [];
    const audits: AuditEntry[] = [];
    for (const { cfg, row } of adopt) {
      const data = snap.trackers.get(cfg.tracker.slug) as CategoryData;
      const rows = snap.raw.get(cfg.tab.gid) as Cell[][];
      const cells = rows[row - 1] ?? [];
      const parsed = parseRow(data.headers, cells, cfg.fields);
      const values: Record<string, FieldValue> = { ...parsed.values };
      const maxSr = [...data.entries.values()].reduce(
        (m, e) => Math.max(m, Number(e.record.values.sr_no) || 0),
        0,
      );
      if (cfg.fields.some((f) => f.key === 'sr_no'))
        values.sr_no = typeof values.sr_no === 'number' ? values.sr_no : maxSr + 1;
      for (const f of cfg.fields) {
        if (f.default_value && (values[f.key] === null || values[f.key] === ''))
          values[f.key] = f.default_value;
      }
      const system: SystemFields = {
        ...parsed.system,
        id: newId(),
        rev: 1,
        created_at: now,
        updated_at: now,
        created_by: 'sheet',
        deleted_at: '',
        calendar_sync: '',
      };
      const next = serializeRow(data.headers, cells, values, system, cfg.fields);
      rows[row - 1] = next;
      data.entries.set(system.id, {
        id: system.id,
        row,
        record: { values, system, problems: parsed.problems },
      });
      blocks.push({ gid: cfg.tab.gid, startRow: row, rows: [next] });
      audits.push({
        user: 'sheet',
        action: 'create',
        table: cfg.tab.title,
        rowId: system.id,
        source: 'sheet',
      });
    }
    await this.google.sheets.writeBlocks(this.spreadsheetId, blocks);
    this.bump(snap);
    await this.log.audit(...audits);
  }

  /**
   * Returns the tab's columns as keys. A field added in the config (or a system column) that the heading row lacks is
   * appended to it. Headings the owner retyped keep their wording in the Sheet (see headingKeys).
   */
  private async syncHeaders(
    cfg: TabConfig,
    raw: string[],
    rows: Cell[][],
    tabs: TabInfo[],
  ): Promise<string[]> {
    const headers = headingKeys(raw, cfg.fields);
    const wanted = [...cfg.fields.filter((f) => !f.archived).map((f) => f.key), ...SYSTEM_COLUMNS];
    const missing = wanted.filter((k) => !headers.includes(k));
    if (missing.length === 0) return headers;
    const next = [...raw, ...missing];
    const tab = tabs.find((t) => t.gid === cfg.tab.gid);
    if (tab && tab.columnCount < next.length) {
      await this.google.sheets.growGrid(this.spreadsheetId, cfg.tab.gid, tab.rowCount, next.length);
    }
    await this.google.sheets.writeBlocks(this.spreadsheetId, [
      { gid: cfg.tab.gid, startRow: 1, rows: [next] },
    ]);
    if (rows.length === 0) rows.push(next);
    else rows[0] = next;
    return [...headers, ...missing];
  }

  private buildCategory(
    cfg: CategoryConfig,
    headers: string[],
    rows: Cell[][],
  ): { data: CategoryData; toAdopt: number[] } {
    const entries = new Map<string, Entry>();
    const attention: AttentionItem[] = [];
    const toAdopt: number[] = [];
    const slug = cfg.category.slug;
    const seen = new Map<string, number>();

    rows.slice(1).forEach((cells, i) => {
      const row = i + 2;
      if (isBlankRow(cells)) return;
      const record = parseRow(headers, cells, cfg.fields);
      const id = record.system.id;
      const hasDate = typeof record.values.date === 'string';

      if (!id || seen.has(id)) {
        // A row typed by hand has no id; a row copied by hand repeats one. Both get a fresh id if they have a date.
        if (hasDate) toAdopt.push(row);
        else
          attention.push({
            tab: cfg.tab.title,
            row,
            message: `Row ${row} has no readable date, so it is not shown. Add a date to bring it in.`,
          });
        return;
      }
      seen.set(id, row);
      entries.set(id, { id, row, record });
      for (const p of record.problems)
        attention.push({ tab: cfg.tab.title, row, message: `Row ${row}: ${p}` });
    });
    return {
      data: { slug, gid: cfg.tab.gid, title: cfg.tab.title, headers, entries, attention },
      toAdopt,
    };
  }

  /**
   * Rows typed straight into the Sheet (a parseable date, no id) become real meetings (§4.6): the app gives them an id,
   * a rev, a created time and a number, writes those back, and records the adoption with source "sheet".
   */
  private async adoptRows(
    snap: Snapshot,
    adopt: { cat: CategoryConfig; row: number }[],
  ): Promise<void> {
    if (adopt.length === 0) return;
    const now = this.clock();
    const blocks: { gid: number; startRow: number; rows: Cell[][] }[] = [];
    const audits: AuditEntry[] = [];

    for (const { cat, row } of adopt) {
      const data = snap.categories.get(cat.category.slug) as CategoryData;
      const rows = snap.raw.get(cat.tab.gid) as Cell[][];
      const cells = rows[row - 1] ?? [];
      const parsed = parseRow(data.headers, cells, cat.fields);
      const maxSr = [...data.entries.values()].reduce(
        (m, e) => Math.max(m, Number(e.record.values.sr_no) || 0),
        0,
      );
      const values: Record<string, FieldValue> = { ...parsed.values };
      values.sr_no = typeof values.sr_no === 'number' ? values.sr_no : maxSr + 1;
      values.meeting_status ||= 'Scheduled';
      values.workspace ||= cat.category.default_workspace;
      const upcoming =
        typeof values.date === 'string' &&
        typeof values.start_time === 'string' &&
        isUpcoming(
          values.date,
          values.start_time,
          values.end_time as string | null,
          Number(snap.config.settings.default_duration_min),
          snap.config.settings.timezone,
          now,
        );
      const system: SystemFields = {
        ...parsed.system,
        id: newId(),
        rev: 1,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        created_by: 'sheet',
        calendar_sync: upcoming ? 'pending' : 'none',
      };
      const next = serializeRow(data.headers, cells, values, system, cat.fields);
      rows[row - 1] = next;
      const entry: Entry = {
        id: system.id,
        row,
        record: { values, system, problems: parsed.problems },
      };
      data.entries.set(entry.id, entry);
      blocks.push({ gid: cat.tab.gid, startRow: row, rows: [next] });
      audits.push({
        user: 'sheet',
        action: 'create',
        table: cat.tab.title,
        rowId: system.id,
        source: 'sheet',
      });
    }
    await this.google.sheets.writeBlocks(this.spreadsheetId, blocks);
    this.version += 1;
    snap.version = this.version;
    this.groupCounts.clear();
    await this.log.audit(...audits);
  }

  /**
   * A date or time changed directly in the Sheet (not through the app) is a reschedule too (§9 rule 4):
   * it is logged with source "sheet", the status becomes Rescheduled and the rev goes up.
   */
  private async detectSheetReschedules(previous: Snapshot | null, snap: Snapshot): Promise<void> {
    if (!previous) return;
    const blocks: { gid: number; startRow: number; rows: Cell[][] }[] = [];
    const logs: Parameters<ActivityLog['reschedule']> = [];
    const audits: Parameters<ActivityLog['audit']> = [];
    const now = this.clock().toISOString();

    for (const [slug, data] of snap.categories) {
      const before = previous.categories.get(slug);
      const cat = snap.config.byCategory.get(slug);
      if (!before || !cat) continue;
      for (const [id, entry] of data.entries) {
        const old = before.entries.get(id);
        if (!old || old.record.system.rev !== entry.record.system.rev) continue; // changed through the app, or not comparable
        const o = old.record.values;
        const n = entry.record.values;
        const same =
          o.date === n.date &&
          o.start_time === n.start_time &&
          (o.end_time ?? '') === (n.end_time ?? '');
        if (same || typeof n.date !== 'string' || typeof n.start_time !== 'string') continue;

        const status = n.meeting_status;
        const values = {
          ...n,
          meeting_status:
            status === 'Scheduled' || status === 'Rescheduled' || !status ? 'Rescheduled' : status,
        };
        const system: SystemFields = {
          ...entry.record.system,
          rev: entry.record.system.rev + 1,
          updated_at: now,
          calendar_sync: 'pending',
        };
        const cells = (snap.raw.get(data.gid) as Cell[][])[entry.row - 1] ?? [];
        const next = serializeRow(data.headers, cells, values, system, cat.fields);
        (snap.raw.get(data.gid) as Cell[][])[entry.row - 1] = next;
        entry.record = { ...entry.record, values, system };
        blocks.push({ gid: data.gid, startRow: entry.row, rows: [next] });
        logs.push({
          meetingId: id,
          categorySlug: slug,
          old: {
            date: String(o.date ?? ''),
            start: String(o.start_time ?? ''),
            end: String(o.end_time ?? ''),
          },
          next: { date: n.date, start: n.start_time, end: String(n.end_time ?? '') },
          source: 'sheet',
        });
        audits.push({
          user: 'sheet',
          action: 'update',
          table: cat.tab.title,
          rowId: id,
          source: 'sheet',
          changes: {
            date: [o.date, n.date],
            start_time: [o.start_time, n.start_time],
            end_time: [o.end_time ?? null, n.end_time ?? null],
          },
        });
      }
    }
    if (blocks.length === 0) return;
    await this.google.sheets.writeBlocks(this.spreadsheetId, blocks);
    this.version += 1;
    snap.version = this.version;
    this.groupCounts.clear();
    await this.log.reschedule(...logs);
    for (const l of logs) this.noteReschedule(l.meetingId);
    await this.log.audit(...audits);
  }

  // ---------- reading ----------

  /** A reschedule was just logged, so the count on screen goes up without waiting for the next reload. */
  noteReschedule(meetingId: string): void {
    const counts = this.snap?.rescheduleCounts;
    if (counts) counts.set(meetingId, (counts.get(meetingId) ?? 0) + 1);
  }

  /** The settings as last loaded, or null before the first load. */
  currentSettings(): Config['settings'] | null {
    return this.snap?.config.settings ?? null;
  }

  /** Files attached to a saved meeting, oldest first. */
  attachedFiles(meetingId: string): FileRecord[] {
    return (this.snap?.files.get(meetingId) ?? []).filter((f) => f.status === 'attached');
  }

  /** Every file row for a meeting that is not removed. */
  filesFor(meetingId: string): FileRecord[] {
    return this.snap?.files.get(meetingId) ?? [];
  }

  /** Re-reads the _files tab after it was changed, so the cache matches the Sheet. */
  async reloadFiles(): Promise<void> {
    const snap = await this.snapshot();
    const tab = snap.tabs.find((t) => t.title === TAB.files);
    if (!tab) return;
    const rows = (await this.google.sheets.batchGet(this.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
    snap.raw.set(tab.gid, rows);
    snap.files = groupFiles(fileRecordsOf(rows));
    snap.fileNames = fileNamesOf(rows);
    this.version += 1;
    snap.version = this.version;
  }

  rescheduleCount(meetingId: string): number {
    return this.snap?.rescheduleCounts.get(meetingId) ?? 0;
  }

  /** Counts for count_same(): non-deleted rows in a category that share a value. Computed once per cache version. */
  countSame(slug: string, key: string, value: FieldValue | undefined): number {
    if (value === null || value === undefined || value === '') return 0;
    const cacheKey = `${slug}:${key}`;
    let counts = this.groupCounts.get(cacheKey);
    if (!counts) {
      counts = new Map();
      for (const e of this.snap?.categories.get(slug)?.entries.values() ?? []) {
        if (e.record.system.deleted_at) continue;
        const v = e.record.values[key];
        if (v === null || v === undefined || v === '') continue;
        const k = Array.isArray(v) ? v.join(',') : String(v);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      this.groupCounts.set(cacheKey, counts);
    }
    return counts.get(Array.isArray(value) ? value.join(',') : String(value)) ?? 0;
  }

  // ---------- write-through ----------

  /** Re-reads one category tab (header and rows) after the row positions turned out to be wrong. */
  async reindexTab(slug: string): Promise<void> {
    const snap = await this.snapshot();
    const cfg = snap.config.byCategory.get(slug);
    const tracker = snap.config.byTracker.get(slug);
    const tab = cfg ?? tracker;
    if (!tab) return;
    const rows =
      (await this.google.sheets.batchGet(this.spreadsheetId, [tab.tab.gid]))[tab.tab.gid] ?? [];
    const headers = await this.syncHeaders(tab, headerOf(rows), rows, snap.tabs);
    snap.raw.set(tab.tab.gid, rows);
    if (cfg) snap.categories.set(slug, this.buildCategory(cfg, headers, rows).data);
    else if (tracker) snap.trackers.set(slug, this.buildTracker(tracker, headers, rows).data);
    this.bump(snap);
  }

  /** The rows of a meeting category or a tracker. */
  private dataOf(snap: Snapshot | null, slug: string): CategoryData | undefined {
    return snap?.categories.get(slug) ?? snap?.trackers.get(slug);
  }

  /** Records a row that was just written to the Sheet. */
  applyRow(slug: string, row: number, cells: Cell[], record: RowRecord): void {
    const snap = this.snap;
    const data = this.dataOf(snap, slug);
    if (!snap || !data) return;
    const rows = snap.raw.get(data.gid) as Cell[][];
    while (rows.length < row) rows.push([]);
    rows[row - 1] = cells;
    for (const [id, e] of data.entries)
      if (e.row === row && id !== record.system.id) data.entries.delete(id);
    data.entries.set(record.system.id, { id: record.system.id, row, record });
    this.bump(snap);
  }

  private bump(snap: Snapshot): void {
    this.version += 1;
    snap.version = this.version;
    this.groupCounts.clear();
  }

  /** The 1-based row where the next appended row will land. */
  nextRow(slug: string): number {
    const data = this.dataOf(this.snap, slug);
    const rows = data ? (this.snap?.raw.get(data.gid) ?? []) : [];
    let last = rows.length;
    while (last > 1 && isBlankRow(rows[last - 1] ?? [])) last -= 1;
    return last + 1;
  }
}
