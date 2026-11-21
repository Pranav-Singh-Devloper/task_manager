import { isUlid } from '../../shared/ids';
import type { SystemFields } from '../../shared/meeting';
import { TAB, trackerToRow } from '../../shared/schema';
import { todayIn } from '../../shared/dates';
import { trackerKpis, type TrackerKpis, type TrackerRow } from '../../shared/trackerKpis';
import type { FieldDef, FieldValue, TrackerDef, TrackerTargets } from '../../shared/types';
import { NOT_EDITABLE, validateValues } from '../../shared/validation';
import { parseTrackers } from '../../shared/configRows';
import { ConflictError, NotFoundError, ValidationFailed } from '../lib/errors';
import type { TrackerConfig } from './config';
import { learnOptions } from './lookups';
import type { Actor } from './meetings';
import { parseRow, serializeRow, type RowRecord } from './rows';
import type { Entry, Snapshot, SheetStore } from './store';
import type { Logger } from 'pino';
import { calendarEventIdFor } from '../../shared/ids';
import { shiftDate } from '../../shared/dates';
import { isClosed } from '../../shared/trackerKpis';
import { upsertEvent } from './calendarSync';
import { isGoogleApiError } from './google/errors';
import type { CalendarEventInput } from './google/types';

export interface TrackerServiceOptions {
  /** The address people open the app at, put in calendar events as a link back. */
  appUrl?: string;
  logger?: Logger;
}

/** All-day events remind at 9 AM the day before: 15 hours before the day starts. */
const REMIND_DAY_BEFORE = 15 * 60;

const CHANGED = 'This was changed somewhere else. Please reload it and try again.';

export interface TrackerData {
  tracker: TrackerDef;
  fields: FieldDef[];
  rows: TrackerRow[];
}

function toRow(entry: Entry, fields: FieldDef[]): TrackerRow {
  const { values, system } = entry.record;
  return {
    id: entry.id,
    rev: system.rev,
    values,
    created_at: system.created_at,
    updated_at: system.updated_at,
    deleted_at: system.deleted_at,
    incomplete: fields
      .filter((f) => f.required && !f.archived && !NOT_EDITABLE.has(f.type))
      .filter((f) => {
        const v = values[f.key];
        return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
      })
      .map((f) => f.key),
  };
}

/** Only the changes, for the change log: { key: [old, new] }. */
function diff(
  before: Record<string, FieldValue>,
  after: Record<string, FieldValue>,
): Record<string, [FieldValue, FieldValue]> {
  const out: Record<string, [FieldValue, FieldValue]> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = [a, b];
  }
  return out;
}

/**
 * The trackers besides meetings: Award Plan, Discussions, DPR, Track, Under Observation and any the owner adds.
 * Rows live in each tracker's own tab. Writes follow the same rules as meetings: lock the tab, re-check the row's id,
 * check the rev, write, update the cache, log the change.
 */
export class TrackerService {
  private running = new Map<string, Promise<void>>();

  constructor(
    private readonly store: SheetStore,
    private readonly options: TrackerServiceOptions = {},
  ) {}

  // ---------- Google Calendar ----------

  /** The all-day event for a row, or null when the row should not be on the calendar. */
  private eventFor(cfg: TrackerConfig, row: TrackerRow): CalendarEventInput | null {
    const { tracker, fields } = cfg;
    const roles = tracker.settings.roles;
    if (!tracker.settings.calendar || !tracker.active || row.deleted_at) return null;
    if (isClosed(row, roles)) return null;
    const date = row.values[roles.due_key];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const text = (k: string) => {
      const v = row.values[k];
      return v === null || v === undefined || v === ''
        ? ''
        : Array.isArray(v)
          ? v.join(', ')
          : String(v);
    };
    const title = text(roles.title_key) || tracker.name;
    const group =
      roles.group_key && roles.group_key !== roles.status_key ? text(roles.group_key) : '';
    const due = fields.find((f) => f.key === roles.due_key)?.label ?? '';
    const lines = [
      `${due}: ${date}`,
      text(roles.status_key)
        ? `${fields.find((f) => f.key === roles.status_key)?.label ?? ''}: ${text(roles.status_key)}`
        : '',
      text('remarks'),
      `Open in app: ${this.options.appUrl ?? 'http://localhost:3000'}/trackers/${tracker.slug}/${row.id}`,
    ].filter(Boolean);
    return {
      id: calendarEventIdFor(row.id),
      summary: `[${tracker.name}] ${title}${group ? ` (${group})` : ''}`,
      description: lines.join('\n\n'),
      start: { date },
      end: { date: shiftDate(date, 1) },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: REMIND_DAY_BEFORE }],
      },
      extendedProperties: { private: { mmTrackerRowId: row.id, mmTracker: tracker.slug } },
    };
  }

  /** Starts a calendar sync for a row without waiting. One run per row at a time; a newer change runs after. */
  queueSync(slug: string, id: string): void {
    const key = `${slug}:${id}`;
    const previous = this.running.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.syncNow(slug, id))
      .catch((err: unknown) => this.options.logger?.warn({ err, id }, 'list calendar sync failed'));
    this.running.set(key, run);
    void run.finally(() => {
      if (this.running.get(key) === run) this.running.delete(key);
    });
  }

  /** Waits for running calendar syncs, never longer than `ms`. */
  async settle(ms = 6000): Promise<void> {
    const all = Promise.allSettled([...this.running.values()]);
    await Promise.race([all, new Promise<void>((r) => setTimeout(r, ms).unref())]);
  }

  /** Puts the row's current state on the calendar and records the result in the row. */
  async syncNow(slug: string, id: string): Promise<'ok' | 'error' | 'none'> {
    const snap = await this.store.snapshot();
    const cfg = snap.config.byTracker.get(slug);
    const entry = snap.trackers.get(slug)?.entries.get(id);
    if (!cfg || !entry) return 'none';
    const row = toRow(entry, cfg.fields);
    const { calendar } = this.store.google;
    const calendarId = snap.config.settings.calendar_id || 'primary';
    const payload = this.eventFor(cfg, row);
    const had = entry.record.system.calendar_event_id;
    let state: 'ok' | 'error' | 'none' = payload ? 'ok' : 'none';
    let eventId = had;
    try {
      if (payload) eventId = (await upsertEvent(calendar, calendarId, payload)).id;
      else if (had) {
        try {
          await calendar.deleteEvent(calendarId, had);
        } catch (err) {
          if (!isGoogleApiError(err, 404) && !isGoogleApiError(err, 410)) throw err;
        }
        eventId = '';
      }
    } catch (err) {
      this.options.logger?.warn(
        { id, status: isGoogleApiError(err) ? err.status : undefined },
        'list calendar sync failed',
      );
      state = 'error';
    }
    await this.recordSync(slug, id, row.rev, state, eventId);
    return state;
  }

  /** Writes the calendar result into the row's hidden columns. The rev stays, so an open form stays valid. */
  private async recordSync(
    slug: string,
    id: string,
    seenRev: number,
    state: 'ok' | 'error' | 'none',
    eventId: string,
  ): Promise<void> {
    const snap = await this.store.snapshot();
    const cfg = snap.config.byTracker.get(slug);
    if (!cfg) return;
    const { google, spreadsheetId } = this.store;
    await this.store.mutex.run(this.store.tabKey(cfg.tab.gid), async () => {
      const fresh = await this.store.snapshot();
      const data = fresh.trackers.get(slug);
      const entry = data?.entries.get(id);
      if (!data || !entry) return;
      const live = await google.sheets.getRow(spreadsheetId, cfg.tab.gid, entry.row);
      if (live[data.headers.indexOf('id')] !== id) return;
      const record = parseRow(data.headers, live, cfg.fields);
      // Changed while we talked to Google: that change queued its own sync.
      if (record.system.rev !== seenRev) return;
      const sync = state === 'none' ? '' : state;
      if (record.system.calendar_sync === sync && record.system.calendar_event_id === eventId)
        return;
      const system: SystemFields = {
        ...record.system,
        calendar_sync: sync,
        calendar_event_id: eventId,
      };
      const cells = serializeRow(data.headers, live, record.values, system, cfg.fields);
      await google.sheets.updateRow(spreadsheetId, cfg.tab.gid, entry.row, cells);
      this.store.applyRow(slug, entry.row, cells, parseRow(data.headers, cells, cfg.fields));
    });
  }

  /** Rows whose calendar event failed, or that should now be added or removed (after a settings change). */
  async resync(slug?: string): Promise<{ tried: number; failed: number }> {
    const snap = await this.store.snapshot();
    let tried = 0;
    let failed = 0;
    for (const cfg of snap.config.byTracker.values()) {
      if (slug && cfg.tracker.slug !== slug) continue;
      for (const entry of snap.trackers.get(cfg.tracker.slug)?.entries.values() ?? []) {
        const sys = entry.record.system;
        const wanted = Boolean(this.eventFor(cfg, toRow(entry, cfg.fields)));
        const needs =
          sys.calendar_sync === 'error' ||
          (wanted ? sys.calendar_sync !== 'ok' : Boolean(sys.calendar_event_id));
        if (!needs) continue;
        tried += 1;
        if ((await this.syncNow(cfg.tracker.slug, entry.id)) === 'error') failed += 1;
      }
    }
    return { tried, failed };
  }

  private cfgOf(snap: Snapshot, slug: string): TrackerConfig {
    const cfg = snap.config.byTracker.get(slug);
    if (!cfg) throw new NotFoundError("We couldn't find that list.");
    return cfg;
  }

  async list(slug: string, options: { deleted?: boolean } = {}): Promise<TrackerData> {
    const snap = await this.store.snapshot();
    const cfg = this.cfgOf(snap, slug);
    const entries = [...(snap.trackers.get(slug)?.entries.values() ?? [])];
    const rows = entries
      .filter((e) => Boolean(e.record.system.deleted_at) === Boolean(options.deleted))
      .map((e) => toRow(e, cfg.fields));
    return { tracker: cfg.tracker, fields: cfg.fields, rows };
  }

  async get(slug: string, id: string): Promise<TrackerRow> {
    const snap = await this.store.snapshot();
    const cfg = this.cfgOf(snap, slug);
    const entry = snap.trackers.get(slug)?.entries.get(id);
    if (!entry) throw new NotFoundError("We couldn't find that.");
    return toRow(entry, cfg.fields);
  }

  /** The dashboard numbers of every active tracker, for the home page. */
  async summaries(): Promise<{ tracker: TrackerDef; kpis: TrackerKpis }[]> {
    const snap = await this.store.snapshot();
    const today = todayIn(snap.config.settings.timezone, this.store.now());
    return snap.config.trackers
      .filter((t) => t.active)
      .map((t) => {
        const cfg = snap.config.byTracker.get(t.slug) as TrackerConfig;
        const rows = [...(snap.trackers.get(t.slug)?.entries.values() ?? [])]
          .filter((e) => !e.record.system.deleted_at)
          .map((e) => toRow(e, cfg.fields));
        return { tracker: t, kpis: trackerKpis(t, cfg.fields, rows, today) };
      });
  }

  private validate(
    cfg: TrackerConfig,
    supplied: Record<string, unknown>,
    existing?: Record<string, FieldValue>,
  ): Record<string, FieldValue> {
    const result = validateValues(cfg.fields, supplied, { workspaces: [], existing });
    if (!result.ok) throw new ValidationFailed(result.issues);
    return result.values;
  }

  async create(
    slug: string,
    input: { id: string; values: Record<string, unknown> },
    actor: Actor,
  ): Promise<{ row: TrackerRow; existing: boolean }> {
    if (!isUlid(input.id)) {
      throw new ValidationFailed([
        {
          field: 'form',
          message: 'This form is out of date. Please reload the page and try again.',
        },
      ]);
    }
    const first = await this.store.snapshot();
    const cfg = this.cfgOf(first, slug);
    const already = first.trackers.get(slug)?.entries.get(input.id);
    if (already) return { row: toRow(already, cfg.fields), existing: true };

    const made = await this.store.mutex.run(this.store.tabKey(cfg.tab.gid), async () => {
      const snap = await this.store.snapshot();
      const data = snap.trackers.get(slug)!;
      const again = data.entries.get(input.id);
      if (again) return { row: toRow(again, cfg.fields), existing: true };

      const supplied: Record<string, unknown> = { ...input.values };
      for (const f of cfg.fields) {
        const v = supplied[f.key];
        if (f.default_value && (v === undefined || v === null || v === ''))
          supplied[f.key] = f.default_value;
      }
      const values = this.validate(cfg, supplied);
      if (cfg.fields.some((f) => f.key === 'sr_no' && f.type === 'auto_number')) {
        values.sr_no =
          [...data.entries.values()].reduce(
            (m, e) => Math.max(m, Number(e.record.values.sr_no) || 0),
            0,
          ) + 1;
      }
      const now = this.store.now().toISOString();
      const system: SystemFields = {
        id: input.id,
        rev: 1,
        created_at: now,
        updated_at: now,
        created_by: actor.email,
        deleted_at: '',
        calendar_event_id: '',
        calendar_sync: '',
        previous_id: '',
        series_id: '',
        awaiting_next: false,
      };
      const cells = serializeRow(data.headers, [], values, system, cfg.fields);
      const row = await this.store.google.sheets.appendRows(this.store.spreadsheetId, cfg.tab.gid, [
        cells,
      ]);
      const record = parseRow(data.headers, cells, cfg.fields);
      this.store.applyRow(slug, row, cells, record);
      await this.store.log.audit({
        user: actor.email,
        action: 'create',
        table: cfg.tab.title,
        rowId: input.id,
        source: actor.source,
        changes: diff({}, values),
      });
      const fresh = await this.store.snapshot();
      return {
        row: toRow(fresh.trackers.get(slug)!.entries.get(input.id)!, cfg.fields),
        existing: false,
      };
    });
    if (!made.existing) {
      await this.learn(slug, made.row.values);
      this.queueSync(slug, input.id);
    }
    return made;
  }

  /** Lock, re-read the live row, check it is the right one and the rev matches, then write the change. */
  private async mutate(
    slug: string,
    id: string,
    expectRev: number | null,
    actor: Actor,
    build: (
      record: RowRecord,
      now: string,
    ) => {
      values: Record<string, FieldValue>;
      deleted_at?: string;
      action: 'update' | 'delete' | 'restore';
    } | null,
  ): Promise<TrackerRow> {
    const first = await this.store.snapshot();
    const cfg = this.cfgOf(first, slug);
    const { google, spreadsheetId } = this.store;
    return this.store.mutex.run(this.store.tabKey(cfg.tab.gid), async () => {
      let snap = await this.store.snapshot();
      let data = snap.trackers.get(slug)!;
      let entry = data.entries.get(id);
      if (!entry) throw new NotFoundError("We couldn't find that.");
      let live = await google.sheets.getRow(spreadsheetId, cfg.tab.gid, entry.row);
      if (live[data.headers.indexOf('id')] !== id) {
        // Someone sorted or edited the Sheet: find the row again.
        await this.store.reindexTab(slug);
        snap = await this.store.snapshot();
        data = snap.trackers.get(slug)!;
        entry = data.entries.get(id);
        if (!entry) throw new ConflictError(CHANGED);
        live = await google.sheets.getRow(spreadsheetId, cfg.tab.gid, entry.row);
        if (live[data.headers.indexOf('id')] !== id) throw new ConflictError(CHANGED);
      }
      const record = parseRow(data.headers, live, cfg.fields);
      if (expectRev !== null && record.system.rev !== expectRev) throw new ConflictError(CHANGED);

      const now = this.store.now().toISOString();
      const plan = build(record, now);
      if (!plan) return toRow({ ...entry, record }, cfg.fields);
      const system: SystemFields = {
        ...record.system,
        rev: record.system.rev + 1,
        updated_at: now,
        deleted_at: plan.deleted_at ?? record.system.deleted_at,
      };
      const cells = serializeRow(data.headers, live, plan.values, system, cfg.fields);
      await google.sheets.updateRow(spreadsheetId, cfg.tab.gid, entry.row, cells);
      this.store.applyRow(slug, entry.row, cells, parseRow(data.headers, cells, cfg.fields));
      await this.store.log.audit({
        user: actor.email,
        action: plan.action,
        table: cfg.tab.title,
        rowId: id,
        source: actor.source,
        changes: plan.action === 'update' ? diff(record.values, plan.values) : undefined,
      });
      const fresh = await this.store.snapshot();
      return toRow(fresh.trackers.get(slug)!.entries.get(id)!, cfg.fields);
    });
  }

  async update(
    slug: string,
    id: string,
    input: { values: Record<string, unknown>; rev: number },
    actor: Actor,
  ): Promise<TrackerRow> {
    const snap = await this.store.snapshot();
    const cfg = this.cfgOf(snap, slug);
    let changedKeys: string[] = [];
    const row = await this.mutate(slug, id, input.rev, actor, (record) => {
      if (record.system.deleted_at)
        throw new ConflictError('This is in the Trash. Restore it first.');
      const values = {
        ...record.values,
        ...this.validate(cfg, { ...record.values, ...input.values }, record.values),
      };
      if (cfg.fields.some((f) => f.key === 'sr_no')) values.sr_no = record.values.sr_no ?? null;
      changedKeys = Object.keys(diff(record.values, values));
      if (changedKeys.length === 0) return null;
      return { values, action: 'update' };
    });
    if (changedKeys.length > 0) {
      await this.learn(slug, row.values, changedKeys);
      this.queueSync(slug, id);
    }
    return row;
  }

  /** Moves a row to the Trash. It stays in the Sheet with a deleted date, and can be restored. */
  async remove(slug: string, id: string, rev: number, actor: Actor): Promise<TrackerRow> {
    const row = await this.mutate(slug, id, rev, actor, (record, now) =>
      record.system.deleted_at
        ? null
        : { values: record.values, deleted_at: now, action: 'delete' },
    );
    this.queueSync(slug, id);
    return row;
  }

  async restore(slug: string, id: string, actor: Actor): Promise<TrackerRow> {
    const row = await this.mutate(slug, id, null, actor, (record) =>
      record.system.deleted_at
        ? { values: record.values, deleted_at: '', action: 'restore' }
        : null,
    );
    this.queueSync(slug, id);
    return row;
  }

  /** Changes a tracker's targets (Award Plan: km and ₹ Cr for this financial year). */
  async setTargets(slug: string, targets: TrackerTargets, actor: Actor): Promise<TrackerDef> {
    const clean = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0 || n > 1e7) {
        throw new ValidationFailed([
          { field: 'form', message: 'Please enter a target above zero, or leave it blank.' },
        ]);
      }
      return n;
    };
    const next = { km: clean(targets.km), cr: clean(targets.cr) };
    const snap = await this.store.snapshot();
    this.cfgOf(snap, slug);
    const tab = snap.tabs.find((t) => t.title === TAB.trackers);
    if (!tab) throw new NotFoundError("We couldn't find that list.");
    const { google, spreadsheetId } = this.store;
    const updated = await this.store.mutex.run(this.store.tabKey(tab.gid), async () => {
      const rows = (await google.sheets.batchGet(spreadsheetId, [tab.gid]))[tab.gid] ?? [];
      const parsed = parseTrackers(rows).items;
      const current = parsed.find((t) => t.slug === slug);
      const index = rows.findIndex((r, i) => i > 0 && String(r[0] ?? '').trim() === slug);
      if (!current || index < 0) throw new NotFoundError("We couldn't find that list.");
      const tracker: TrackerDef = { ...current, settings: { ...current.settings, targets: next } };
      await google.sheets.updateRow(spreadsheetId, tab.gid, index + 1, trackerToRow(tracker));
      return tracker;
    });
    await this.store.log.audit({
      user: actor.email,
      action: 'config',
      table: TAB.trackers,
      rowId: slug,
      source: actor.source,
      changes: { targets: [null, JSON.stringify(next)] },
    });
    await this.store.refresh();
    return updated;
  }

  private async learn(slug: string, values: Record<string, FieldValue>, onlyKeys?: string[]) {
    try {
      await learnOptions(this.store, slug, values, onlyKeys);
    } catch (err) {
      this.store.logger.warn({ err }, 'could not update the dropdown lists');
    }
  }
}
