import { addMinutesToTime, endTimeFor, isUpcoming, parseTimeLoose } from '../../shared/dates';
import { isUlid } from '../../shared/ids';
import type { Meeting, SystemFields } from '../../shared/meeting';
import type { FieldValue, MeetingStatus } from '../../shared/types';
import { NOT_EDITABLE, validateValues } from '../../shared/validation';
import { format, parseISO } from 'date-fns';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UndoUnavailableError,
  ValidationFailed,
} from '../lib/errors';
import type { AuditAction, ChangeSource, RescheduleEntry } from './audit';
import type { CategoryConfig } from './config';
import { titleOf, toMeeting } from './meetingView';
import { learnOptions } from './lookups';
import { parseRow, serializeRow, type RowRecord } from './rows';
import type { Snapshot, SheetStore } from './store';
import { UndoService, type UndoRecord, type UndoStep } from './undo';

export interface Actor {
  email: string;
  source: ChangeSource;
}

export interface MutationResult {
  meeting: Meeting;
  /** Valid for 10 minutes while the row is unchanged. Null when nothing changed. */
  undoToken: string | null;
}

export interface CreateResult extends MutationResult {
  /** True when this id had already been saved, so nothing new was made (safe retry). */
  existing: boolean;
}

export interface CreateInput {
  /** Made by the client when the form opens, so a retried save never makes a second meeting. */
  id: string;
  category: string;
  values: Record<string, unknown>;
  previousId?: string;
}

export interface CompleteInput {
  /** Notes from the meeting. Added to Details under a dated heading. */
  notes?: string;
  /** The next sitting. `id` is made by the client, so a retried save never makes two. */
  next?: { id: string; date: string; start_time: string; end_time?: string | null };
  /** "Not decided yet". Only counts for categories that have a case key (§7.6). */
  awaitingNext?: boolean;
  rev: number;
  /** Make a second next meeting even though one exists already (§9 rule 21). */
  allowSecondNext?: boolean;
}

export interface CompleteResult extends MutationResult {
  next: Meeting | null;
  /** True when this next meeting had been saved already, so nothing new was made. */
  existing: boolean;
}

/** A short description of a neighbouring meeting in a series, for links on the detail page. */
export interface MeetingSummary {
  id: string;
  title: string;
  date: string | null;
  start_time: string | null;
  status: string | null;
}

/** Fields every category has. The done flow copies the ones in COPY_CORE and every category-specific field. */
const CORE_KEYS = new Set([
  'sr_no',
  'date',
  'start_time',
  'end_time',
  'topic',
  'meeting_status',
  'meeting_link',
  'files',
  'remarks',
  'details',
  'workspace',
  'reminder_minutes',
]);
const COPY_CORE = ['topic', 'meeting_link', 'workspace', 'reminder_minutes'];
const MAX_NOTES = 20000;

export interface ListOptions {
  scope?: 'upcoming' | 'past' | 'all';
  category?: string;
  workspace?: string;
  status?: string;
  deleted?: 'exclude' | 'only' | 'include';
}

/** Scheduled becomes Rescheduled by itself. Everything else is a deliberate action (§9 rule 3). */
const TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  Scheduled: ['Completed', 'Cancelled'],
  Rescheduled: ['Completed', 'Cancelled'],
  Completed: ['Scheduled'], // Reopen
  Cancelled: ['Scheduled'], // Restore
};

export function canTransition(from: MeetingStatus, to: MeetingStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

const TIME_KEYS = ['date', 'start_time', 'end_time'];
/** A change to any of these needs the Google Calendar event updated. */
const CALENDAR_KEYS = new Set([
  ...TIME_KEYS,
  'topic',
  'meeting_link',
  'reminder_minutes',
  'details',
  'meeting_status',
]);

const same = (a: FieldValue | undefined, b: FieldValue | undefined) => {
  const norm = (v: FieldValue | undefined) =>
    v === undefined || v === '' ? null : Array.isArray(v) ? v.join('\u0001') : v;
  return norm(a) === norm(b);
};

function diff(
  before: Record<string, FieldValue>,
  after: Record<string, FieldValue>,
  keys: Iterable<string>,
) {
  const changes: Record<string, [FieldValue, FieldValue]> = {};
  for (const k of keys) {
    if (!same(before[k], after[k])) changes[k] = [before[k] ?? null, after[k] ?? null];
  }
  return changes;
}

interface Current {
  cfg: CategoryConfig;
  snap: Snapshot;
  record: RowRecord;
  now: Date;
}

interface Plan {
  values: Record<string, FieldValue>;
  system?: Partial<SystemFields>;
  action: AuditAction;
  changes: Record<string, [unknown, unknown]>;
  reschedule?: Omit<RescheduleEntry, 'meetingId' | 'categorySlug' | 'source'>;
  undo?: Pick<UndoRecord, 'revert' | 'label' | 'also'>;
  source?: ChangeSource;
}

export class MeetingService {
  constructor(
    private readonly store: SheetStore,
    private readonly undo: UndoService,
  ) {}

  // ---------- reading ----------

  private locate(snap: Snapshot, id: string): { slug: string } | null {
    for (const [slug, data] of snap.categories) if (data.entries.has(id)) return { slug };
    return null;
  }

  async get(id: string): Promise<Meeting> {
    const snap = await this.store.snapshot();
    const found = this.locate(snap, id);
    if (!found) throw new NotFoundError("We couldn't find that meeting.");
    const entry = snap.categories.get(found.slug)!.entries.get(id)!;
    return toMeeting(this.store, snap, found.slug, entry);
  }

  /** A simple list for now; search, filters and paging arrive with the dashboard. */
  async list(o: ListOptions = {}): Promise<Meeting[]> {
    const snap = await this.store.snapshot();
    const tz = snap.config.settings.timezone;
    const minutes = Number(snap.config.settings.default_duration_min);
    const now = this.store.now();
    const out: Meeting[] = [];

    for (const [slug, data] of snap.categories) {
      if (o.category && o.category !== slug) continue;
      for (const entry of data.entries.values()) {
        const v = entry.record.values;
        const deleted = Boolean(entry.record.system.deleted_at);
        if (o.deleted === 'only' ? !deleted : o.deleted === 'include' ? false : deleted) continue;
        if (o.workspace && v.workspace !== o.workspace) continue;
        if (o.status && v.meeting_status !== o.status) continue;
        if (o.scope && o.scope !== 'all') {
          if (typeof v.date !== 'string' || typeof v.start_time !== 'string') continue;
          const upcoming = isUpcoming(
            v.date,
            v.start_time,
            v.end_time as string | null,
            minutes,
            tz,
            now,
          );
          if ((o.scope === 'upcoming') !== upcoming) continue;
        }
        out.push(toMeeting(this.store, snap, slug, entry));
      }
    }
    const key = (m: Meeting) => `${m.values.date ?? ''} ${m.values.start_time ?? ''}`;
    out.sort((a, b) => key(a).localeCompare(key(b)));
    if (o.scope === 'past') out.reverse();
    return out;
  }

  async history(id: string) {
    await this.get(id);
    return this.store.log.history(id);
  }

  // ---------- the one guarded way to change a row ----------

  /**
   * Lock the tab, re-read the live row, and make sure it is the row we think it is (the owner may have sorted the Sheet),
   * check the rev, build the change, write it, update the cache, then log it. Nothing else writes meeting rows.
   */
  private async mutate(
    id: string,
    expectRev: number | null,
    actor: Actor,
    build: (c: Current) => Plan | null,
  ): Promise<MutationResult> {
    const first = await this.store.snapshot();
    const found = this.locate(first, id);
    if (!found) throw new NotFoundError("We couldn't find that meeting.");
    const slug = found.slug;
    const cfg = first.config.byCategory.get(slug) as CategoryConfig;
    const { google, spreadsheetId, log } = this.store;

    return this.store.mutex.run(this.store.tabKey(cfg.tab.gid), async () => {
      let snap = await this.store.snapshot();
      let data = snap.categories.get(slug)!;
      let entry = data.entries.get(id);
      if (!entry) throw new NotFoundError("We couldn't find that meeting.");

      // Never trust a cached row position: read the id cell where we expect it.
      let live = await google.sheets.getRow(spreadsheetId, cfg.tab.gid, entry.row);
      if (live[data.headers.indexOf('id')] !== id) {
        await this.store.reindexTab(slug);
        snap = await this.store.snapshot();
        data = snap.categories.get(slug)!;
        entry = data.entries.get(id);
        if (!entry) throw new ConflictError();
        live = await google.sheets.getRow(spreadsheetId, cfg.tab.gid, entry.row);
        if (live[data.headers.indexOf('id')] !== id) throw new ConflictError();
      }

      const record = parseRow(data.headers, live, cfg.fields);
      if (expectRev !== null && record.system.rev !== expectRev) throw new ConflictError();

      const now = this.store.now();
      const plan = build({ cfg, snap, record, now });
      if (!plan)
        return {
          meeting: toMeeting(this.store, snap, slug, { ...entry, record }),
          undoToken: null,
        };

      const system: SystemFields = {
        ...record.system,
        ...plan.system,
        rev: record.system.rev + 1,
        updated_at: now.toISOString(),
      };
      const cells = serializeRow(data.headers, live, plan.values, system, cfg.fields);
      await google.sheets.updateRow(spreadsheetId, cfg.tab.gid, entry.row, cells);
      const written = parseRow(data.headers, cells, cfg.fields);
      this.store.applyRow(slug, entry.row, cells, written);

      const source = plan.source ?? actor.source;
      await log.audit({
        user: actor.email,
        action: plan.action,
        table: cfg.tab.title,
        rowId: id,
        changes: plan.changes,
        source,
      });
      if (plan.reschedule) {
        await log.reschedule({
          ...plan.reschedule,
          meetingId: id,
          categorySlug: slug,
          source: source === 'job' ? 'app' : source,
        });
      }
      const undoToken = plan.undo
        ? this.undo.issue({
            meetingId: id,
            categorySlug: slug,
            expectedRev: system.rev,
            user: actor.email,
            ...plan.undo,
          })
        : null;
      const fresh = await this.store.snapshot();
      return {
        meeting: toMeeting(this.store, fresh, slug, fresh.categories.get(slug)!.entries.get(id)!),
        undoToken,
      };
    });
  }

  // ---------- create ----------

  async create(input: CreateInput, actor: Actor): Promise<CreateResult> {
    if (!isUlid(input.id)) {
      throw new ValidationFailed([
        {
          field: 'form',
          message: 'This form is out of date. Please reload the page and try again.',
        },
      ]);
    }
    const first = await this.store.snapshot();
    const cfg = first.config.byCategory.get(input.category);
    if (!cfg) throw new NotFoundError("We couldn't find that category.");

    const already = (snap: Snapshot) => {
      const found = this.locate(snap, input.id);
      return found
        ? toMeeting(
            this.store,
            snap,
            found.slug,
            snap.categories.get(found.slug)!.entries.get(input.id)!,
          )
        : null;
    };
    const existingFirst = already(first);
    if (existingFirst) return { meeting: existingFirst, undoToken: null, existing: true };

    const created = await this.store.mutex.run(this.store.tabKey(cfg.tab.gid), async () => {
      const snap = await this.store.snapshot();
      const again = already(snap);
      if (again) return { meeting: again, undoToken: null, existing: true };

      const data = snap.categories.get(input.category)!;
      const settings = snap.config.settings;
      const supplied = { ...input.values };
      // A new meeting always starts as Scheduled, in its category's workspace unless one is chosen.
      supplied.meeting_status = 'Scheduled';
      if (!supplied.workspace) supplied.workspace = cfg.category.default_workspace;

      const result = validateValues(cfg.fields, supplied, {
        workspaces: snap.config.workspaces.map((w) => w.slug),
        hasTitleTemplate: Boolean(cfg.category.title_template),
      });
      if (!result.ok) throw new ValidationFailed(result.issues);
      const values: Record<string, FieldValue> = { ...result.values };

      if (!values.end_time && typeof values.start_time === 'string') {
        const end = addMinutesToTime(values.start_time, Number(settings.default_duration_min));
        if (!end) {
          throw new ValidationFailed([
            {
              field: 'end_time',
              message: 'A meeting must end before midnight. Please choose an end time.',
            },
          ]);
        }
        values.end_time = end;
      }
      const maxSr = [...data.entries.values()].reduce(
        (m, e) => Math.max(m, Number(e.record.values.sr_no) || 0),
        0,
      );
      values.sr_no = maxSr + 1;

      if (input.previousId && !isUlid(input.previousId)) {
        throw new ValidationFailed([
          { field: 'form', message: 'The earlier meeting could not be found.' },
        ]);
      }
      const now = this.store.now();
      const upcoming = isUpcoming(
        values.date as string,
        values.start_time as string,
        values.end_time as string,
        Number(settings.default_duration_min),
        settings.timezone,
        now,
      );
      const system: SystemFields = {
        id: input.id,
        rev: 1,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        created_by: actor.email,
        deleted_at: '',
        calendar_event_id: '',
        calendar_sync: upcoming ? 'pending' : 'none',
        previous_id: input.previousId ?? '',
        series_id: '',
        awaiting_next: false,
      };
      const cells = serializeRow(data.headers, [], values, system, cfg.fields);
      const row = await this.store.google.sheets.appendRows(this.store.spreadsheetId, cfg.tab.gid, [
        cells,
      ]);
      const record = parseRow(data.headers, cells, cfg.fields);
      this.store.applyRow(input.category, row, cells, record);

      await this.store.log.audit({
        user: actor.email,
        action: 'create',
        table: cfg.tab.title,
        rowId: input.id,
        source: actor.source,
        changes: Object.fromEntries(
          Object.entries(values)
            .filter(([, v]) => v !== null && v !== '')
            .map(([k, v]) => [k, [null, v]]),
        ),
      });
      const undoToken = this.undo.issue({
        meetingId: input.id,
        categorySlug: input.category,
        expectedRev: 1,
        user: actor.email,
        revert: { values: {}, deleted_at: now.toISOString() },
        label: 'Meeting added',
      });
      const fresh = await this.store.snapshot();
      return {
        meeting: toMeeting(
          this.store,
          fresh,
          input.category,
          fresh.categories.get(input.category)!.entries.get(input.id)!,
        ),
        undoToken,
        existing: false,
      };
    });
    if (!created.existing) await this.learn(input.category, created.meeting.values);
    return created;
  }

  /** Teaches the dropdowns the values just used. Best effort: the meeting is already saved. */
  private async learn(
    slug: string,
    values: Record<string, FieldValue>,
    onlyKeys?: string[],
  ): Promise<void> {
    try {
      await learnOptions(this.store, slug, values, onlyKeys);
    } catch (err) {
      this.store.logger.warn({ err }, 'could not update the dropdown lists');
    }
  }

  // ---------- update, reschedule, status ----------

  /** Changes some fields. Needs the rev the caller saw; a different rev means someone else changed it (409). */
  async update(
    id: string,
    patch: Record<string, unknown>,
    rev: number,
    actor: Actor,
    options: { reason?: string; confirmCompleted?: boolean; label?: string } = {},
  ): Promise<MutationResult> {
    let changedKeys: string[] = [];
    const result = await this.mutate(id, rev, actor, (c) => {
      if (c.record.system.deleted_at)
        throw new ConflictError('This meeting is in the Trash. Please restore it first.');
      const editable = new Set(
        c.cfg.fields.filter((f) => !f.archived && !NOT_EDITABLE.has(f.type)).map((f) => f.key),
      );
      const merged: Record<string, unknown> = { ...c.record.values };
      for (const [k, v] of Object.entries(patch)) if (editable.has(k)) merged[k] = v;

      const checked = validateValues(c.cfg.fields, merged, {
        workspaces: c.snap.config.workspaces.map((w) => w.slug),
        existing: c.record.values,
        hasTitleTemplate: Boolean(c.cfg.category.title_template),
      });
      if (!checked.ok) throw new ValidationFailed(checked.issues);
      // Keep what the form does not edit (number, files), then apply the checked values.
      const next: Record<string, FieldValue> = { ...c.record.values, ...checked.values };

      const before = (c.record.values.meeting_status || 'Scheduled') as MeetingStatus;
      const after = (next.meeting_status || before) as MeetingStatus;
      if (!canTransition(before, after)) {
        throw new ValidationFailed([
          { field: 'meeting_status', message: 'That change of status is not possible.' },
        ]);
      }

      let changes = diff(c.record.values, next, editable);
      if (Object.keys(changes).length === 0) return null;

      const minutes = Number(c.snap.config.settings.default_duration_min);
      const timeChanged = TIME_KEYS.some((k) => k in changes);
      let reschedule: Plan['reschedule'];
      if (timeChanged) {
        if (before === 'Completed' && !options.confirmCompleted) {
          throw new ValidationFailed([
            {
              field: 'form',
              message:
                'This meeting is already marked done. Please confirm that you want to change its time.',
            },
          ]);
        }
        if (after === before && (before === 'Scheduled' || before === 'Rescheduled'))
          next.meeting_status = 'Rescheduled';
        const o = c.record.values;
        reschedule = {
          old: {
            date: String(o.date ?? ''),
            start: String(o.start_time ?? ''),
            end: endTimeFor(String(o.start_time ?? ''), o.end_time as string | null, minutes) ?? '',
          },
          next: {
            date: String(next.date ?? ''),
            start: String(next.start_time ?? ''),
            end:
              endTimeFor(String(next.start_time ?? ''), next.end_time as string | null, minutes) ??
              '',
          },
          reason: options.reason,
        };
        changes = diff(c.record.values, next, editable);
      }

      const titleKeys = [...c.cfg.category.title_template.matchAll(/\{(\w+)\}/g)].map(
        (m) => m[1] as string,
      );
      changedKeys = Object.keys(changes);
      const touchesCalendar = Object.keys(changes).some(
        (k) => CALENDAR_KEYS.has(k) || titleKeys.includes(k),
      );
      return {
        values: next,
        system: touchesCalendar ? { calendar_sync: 'pending' } : undefined,
        action: 'update',
        changes,
        reschedule,
        undo: {
          revert: {
            values: Object.fromEntries(
              Object.entries(changes).map(([k, [old]]) => [k, old as FieldValue]),
            ),
          },
          label: options.label ?? (timeChanged ? 'Meeting moved' : 'Meeting changed'),
        },
      };
    });
    if (changedKeys.length > 0) {
      await this.learn(result.meeting.category_slug, result.meeting.values, changedKeys);
    }
    return result;
  }

  /** New date and time, keeping the length unless an end time is given. */
  async reschedule(
    id: string,
    input: {
      date: string;
      start_time: string;
      end_time?: string | null;
      reason?: string;
      rev: number;
      confirmCompleted?: boolean;
    },
    actor: Actor,
  ): Promise<MutationResult> {
    const current = await this.get(id);
    // People may type "2:30 pm"; work in 24-hour text from here on.
    input = { ...input, start_time: parseTimeLoose(input.start_time) ?? input.start_time };
    const settings = (await this.store.snapshot()).config.settings;
    let end = input.end_time ?? null;
    if (!end) {
      const oldStart = current.values.start_time;
      const oldEnd = current.values.end_time;
      if (typeof oldStart === 'string' && typeof oldEnd === 'string') {
        const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
        end = addMinutesToTime(input.start_time, mins(oldEnd) - mins(oldStart));
      } else {
        end = addMinutesToTime(input.start_time, Number(settings.default_duration_min));
      }
      if (!end) {
        throw new ValidationFailed([
          {
            field: 'end_time',
            message: 'A meeting must end before midnight. Please choose an end time.',
          },
        ]);
      }
    }
    return this.update(
      id,
      { date: input.date, start_time: input.start_time, end_time: end },
      input.rev,
      actor,
      {
        reason: input.reason,
        confirmCompleted: input.confirmCompleted,
        label: 'Meeting moved',
      },
    );
  }

  async setStatus(
    id: string,
    status: MeetingStatus,
    rev: number,
    actor: Actor,
  ): Promise<MutationResult> {
    const label =
      status === 'Cancelled'
        ? 'Meeting cancelled'
        : status === 'Completed'
          ? 'Meeting marked done'
          : 'Meeting brought back';
    return this.update(id, { meeting_status: status }, rev, actor, { label });
  }

  // ---------- delete and restore ----------

  /** Soft delete: the row stays, with a deleted time. It can be brought back from Trash. */
  async remove(id: string, rev: number, actor: Actor): Promise<MutationResult> {
    return this.mutate(id, rev, actor, (c) => {
      if (c.record.system.deleted_at) return null;
      const stamp = c.now.toISOString();
      return {
        values: c.record.values,
        system: { deleted_at: stamp, calendar_sync: 'pending' },
        action: 'delete',
        changes: { deleted_at: ['', stamp] },
        undo: { revert: { values: {}, deleted_at: '' }, label: 'Meeting deleted' },
      };
    });
  }

  async restore(id: string, actor: Actor): Promise<MutationResult> {
    return this.mutate(id, null, actor, (c) => {
      if (!c.record.system.deleted_at) return null;
      return {
        values: c.record.values,
        system: { deleted_at: '', calendar_sync: 'pending' },
        action: 'restore',
        changes: { deleted_at: [c.record.system.deleted_at, ''] },
        undo: {
          revert: { values: {}, deleted_at: c.now.toISOString() },
          label: 'Meeting restored',
        },
      };
    });
  }

  // ---------- the done flow ----------

  /** The meeting before and after this one in a series (linked by previous_id). */
  async neighbors(
    id: string,
  ): Promise<{ previous: MeetingSummary | null; next: MeetingSummary | null }> {
    const snap = await this.store.snapshot();
    const found = this.locate(snap, id);
    if (!found) throw new NotFoundError("We couldn't find that meeting.");
    const data = snap.categories.get(found.slug)!;
    const self = data.entries.get(id)!;
    const summary = (e: {
      record: { values: Record<string, FieldValue>; system: SystemFields };
    }): MeetingSummary => ({
      id: e.record.system.id,
      title: titleOf(snap, found.slug, e.record.values),
      date: (e.record.values.date as string) ?? null,
      start_time: (e.record.values.start_time as string) ?? null,
      status: (e.record.values.meeting_status as string) ?? null,
    });
    const prevId = self.record.system.previous_id;
    const prev = prevId ? data.entries.get(prevId) : undefined;
    const followers = [...data.entries.values()]
      .filter((e) => e.record.system.previous_id === id && !e.record.system.deleted_at)
      .sort((a, b) => String(a.record.values.date).localeCompare(String(b.record.values.date)));
    return {
      previous: prev && !prev.record.system.deleted_at ? summary(prev) : null,
      next: followers[0] ? summary(followers[0]) : null,
    };
  }

  /**
   * Closes the loop: Plan, get reminded, attend, then record the outcome and the next date (§1.1, §7.6).
   * Marks the meeting done, adds notes, and (if there is a next date) makes the next meeting in the same category,
   * copying its category fields and linking it back. One Undo reverses both.
   */
  async complete(id: string, input: CompleteInput, actor: Actor): Promise<CompleteResult> {
    const first = await this.store.snapshot();

    // A retried save: the next meeting is already there, so this has already worked.
    if (input.next && this.locate(first, input.next.id)) {
      const again = await this.get(id);
      return {
        meeting: again,
        next: await this.get(input.next.id),
        existing: true,
        undoToken: null,
      };
    }

    const current = await this.get(id);
    // Refuse a stale rev now, before anything is created.
    if (current.rev !== input.rev) throw new ConflictError();
    const cfg = first.config.byCategory.get(current.category_slug)!;
    const notes = (input.notes ?? '').trim();
    if (notes.length > MAX_NOTES) {
      throw new ValidationFailed([
        {
          field: 'notes',
          message: 'The notes are too long. Please keep them under 20,000 characters.',
        },
      ]);
    }
    const status = (current.values.meeting_status || 'Scheduled') as MeetingStatus;
    const alreadyDone = status === 'Completed';
    if (!alreadyDone && !canTransition(status, 'Completed')) {
      throw new ValidationFailed([
        { field: 'meeting_status', message: 'That change of status is not possible.' },
      ]);
    }

    // Only one next meeting per meeting, unless the person says to make another anyway (§9 rule 21).
    if (input.next && !input.allowSecondNext) {
      const data = first.categories.get(current.category_slug)!;
      const existing = [...data.entries.values()].find(
        (e) =>
          e.record.system.previous_id === id &&
          !e.record.system.deleted_at &&
          e.id !== input.next!.id,
      );
      if (existing) {
        const date = String(existing.record.values.date ?? '');
        throw new AppError(
          409,
          'next_exists',
          `This meeting already has a next meeting on ${date ? format(parseISO(date), 'EEE, d MMM yyyy') : 'another date'}.`,
          undefined,
          { existing_id: existing.id, existing_date: date },
        );
      }
    }

    // 1. The next meeting first: if its details are wrong, nothing has been changed yet.
    let nextMeeting: Meeting | null = null;
    if (input.next) {
      const copied: Record<string, unknown> = {};
      for (const f of cfg.fields) {
        if (f.archived || f.type === 'computed' || f.type === 'auto_number' || f.type === 'file')
          continue;
        if (!CORE_KEYS.has(f.key) || COPY_CORE.includes(f.key))
          copied[f.key] = current.values[f.key];
      }
      let end = input.next.end_time ?? null;
      const oldStart = current.values.start_time;
      const oldEnd = current.values.end_time;
      const startNext = parseTimeLoose(input.next.start_time) ?? input.next.start_time;
      if (!end && typeof oldStart === 'string' && typeof oldEnd === 'string') {
        const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
        end = addMinutesToTime(startNext, mins(oldEnd) - mins(oldStart));
      }
      const made = await this.create(
        {
          id: input.next.id,
          category: current.category_slug,
          values: { ...copied, date: input.next.date, start_time: startNext, end_time: end },
          previousId: id,
        },
        actor,
      );
      nextMeeting = made.meeting;
    }

    // 2. Then this meeting. If that fails (it was changed elsewhere), take the next meeting back out.
    try {
      const heading = `— Notes, ${format(parseISO(String(current.values.date)), 'EEE, d MMM yyyy')} —`;
      const awaiting =
        Boolean(input.awaitingNext) &&
        !input.next &&
        cfg.fields.some((f) => f.case_key && !f.archived);
      const result = await this.mutate(id, input.rev, actor, (c) => {
        const next = { ...c.record.values };
        const before = c.record.values;
        if (!alreadyDone) {
          next.meeting_status = 'Completed';
          if (notes) {
            const existing = typeof before.details === 'string' ? before.details : '';
            next.details = `${existing ? `${existing}\n\n` : ''}${heading}\n${notes}`;
          }
        }
        const awaitingAfter = alreadyDone ? false : awaiting;
        const changes = diff(before, next, ['meeting_status', 'details']) as Record<
          string,
          [unknown, unknown]
        >;
        if (c.record.system.awaiting_next !== awaitingAfter) {
          changes.awaiting_next = [c.record.system.awaiting_next, awaitingAfter];
        }
        if (Object.keys(changes).length === 0) return null;
        return {
          values: next,
          system: {
            awaiting_next: awaitingAfter,
            ...(alreadyDone ? {} : { calendar_sync: 'pending' as const }),
          },
          action: 'complete',
          changes,
          undo: {
            label: 'Meeting marked done',
            revert: {
              values: Object.fromEntries(
                (['meeting_status', 'details'] as const)
                  .filter((k) => k in changes)
                  .map((k) => [k, before[k] ?? null]),
              ) as Record<string, FieldValue>,
              awaiting_next: c.record.system.awaiting_next,
            },
            also: nextMeeting
              ? {
                  meetingId: nextMeeting.id,
                  categorySlug: nextMeeting.category_slug,
                  expectedRev: nextMeeting.rev,
                  revert: { values: {}, deleted_at: c.now.toISOString() },
                }
              : undefined,
          },
        };
      });
      let undoToken = result.undoToken;
      if (!undoToken && nextMeeting) {
        // Nothing about this meeting changed (it was already done), so Undo just takes the new next meeting back out.
        undoToken = this.undo.issue({
          meetingId: nextMeeting.id,
          categorySlug: nextMeeting.category_slug,
          expectedRev: nextMeeting.rev,
          user: actor.email,
          revert: { values: {}, deleted_at: this.store.now().toISOString() },
          label: 'Next meeting scheduled',
        });
      }
      return { meeting: result.meeting, next: nextMeeting, existing: false, undoToken };
    } catch (err) {
      if (nextMeeting)
        await this.remove(nextMeeting.id, nextMeeting.rev, actor).catch(() => undefined);
      throw err;
    }
  }

  // ---------- undo ----------

  /** Applies the reverse of a recent change. Refused if the meeting has changed since, or the 10 minutes are up. */
  async undoChange(token: string, actor: Actor): Promise<MutationResult & { label: string }> {
    const rec = this.undo.peek(token);
    if (!rec || rec.user !== actor.email) {
      throw new UndoUnavailableError('Undo is only available for 10 minutes after a change.');
    }
    // A change that touched two meetings (the done flow) is undone as a pair: the new one first, then the first.
    const steps: UndoStep[] = rec.also ? [rec.also, rec] : [rec];
    try {
      // Check every meeting is still as the action left it before changing any of them.
      for (const step of steps) {
        const current = await this.get(step.meetingId);
        if (current.rev !== step.expectedRev) throw new UndoUnavailableError();
      }
      let result: MutationResult | null = null;
      for (const step of steps) result = await this.applyUndoStep(step, actor);
      this.undo.consume(token);
      return { ...(result as MutationResult), label: rec.label };
    } catch (err) {
      if (err instanceof ConflictError || err instanceof NotFoundError)
        throw new UndoUnavailableError();
      throw err;
    }
  }

  private applyUndoStep(step: UndoStep, actor: Actor): Promise<MutationResult> {
    return this.mutate(step.meetingId, step.expectedRev, { ...actor, source: 'undo' }, (c) => {
      const next = { ...c.record.values, ...step.revert.values };
      const keys = Object.keys(step.revert.values);
      const changes: Record<string, [unknown, unknown]> = diff(c.record.values, next, keys);
      const system: Partial<SystemFields> = { calendar_sync: 'pending' };
      if (step.revert.deleted_at !== undefined) {
        system.deleted_at = step.revert.deleted_at;
        changes.deleted_at = [c.record.system.deleted_at, step.revert.deleted_at];
      }
      if (step.revert.awaiting_next !== undefined) {
        system.awaiting_next = step.revert.awaiting_next;
        changes.awaiting_next = [c.record.system.awaiting_next, step.revert.awaiting_next];
      }
      const minutes = Number(c.snap.config.settings.default_duration_min);
      const timeChanged = TIME_KEYS.some((k) => k in changes);
      const eff = (v: Record<string, FieldValue>) => ({
        date: String(v.date ?? ''),
        start: String(v.start_time ?? ''),
        end: endTimeFor(String(v.start_time ?? ''), v.end_time as string | null, minutes) ?? '',
      });
      return {
        values: next,
        system,
        action: 'undo',
        changes,
        reschedule: timeChanged ? { old: eff(c.record.values), next: eff(next) } : undefined,
        source: 'undo',
      };
    });
  }
}
