import type { Logger } from 'pino';
import type { Meeting } from '../../shared/meeting';
import { NotFoundError } from '../lib/errors';
import { buildEventPayload, parseReminders } from './calendarEvent';
import { upsertEvent } from './calendarSync';
import { isGoogleApiError } from './google/errors';
import type { MeetingService } from './meetings';
import type { SheetStore } from './store';

/** Google Calendar has 11 event colours (§5.8). Categories take them in order and start again after 11. */
const COLOR_COUNT = 11;

export type SyncResult = 'ok' | 'error' | 'none';

/**
 * Keeps Google Calendar in step with the meetings (§5.8). The Sheet is always saved first; this runs after,
 * and a failure only marks the meeting "not on your calendar yet" so a job or the person can try again.
 */
export class CalendarService {
  private running = new Map<string, Promise<SyncResult>>();

  constructor(
    private readonly store: SheetStore,
    private readonly meetings: MeetingService,
    private readonly options: { appUrl: string; logger: Logger },
  ) {}

  /** Starts a sync without waiting for it. A change made while one is running gets its own run after it. */
  queue(id: string): void {
    void this.sync(id, true).catch((err: unknown) => {
      this.options.logger.warn({ err, meetingId: id }, 'calendar sync could not be recorded');
    });
  }

  /** Waits for every running sync, but never longer than `ms`: a slow Google must not hold up a save. */
  async settle(ms = 6000): Promise<void> {
    const all = Promise.allSettled([...this.running.values()]);
    await Promise.race([all, new Promise<void>((resolve) => setTimeout(resolve, ms).unref())]);
  }

  /** Puts the meeting's current state on the calendar. One run per meeting at a time. */
  sync(id: string, onlyIfPending = false): Promise<SyncResult> {
    const previous = this.running.get(id);
    const run = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() =>
      this.syncNow(id, onlyIfPending),
    );
    this.running.set(id, run);
    const forget = () => {
      if (this.running.get(id) === run) this.running.delete(id);
    };
    run.then(forget, forget);
    return run;
  }

  private colorIdFor(slug: string, categories: { slug: string; sort: number }[]): string {
    const ordered = [...categories].sort((a, b) => a.sort - b.sort);
    const index = Math.max(
      0,
      ordered.findIndex((c) => c.slug === slug),
    );
    return String((index % COLOR_COUNT) + 1);
  }

  private async syncNow(id: string, onlyIfPending: boolean): Promise<SyncResult> {
    let meeting: Meeting;
    try {
      meeting = await this.meetings.get(id);
    } catch (err) {
      if (err instanceof NotFoundError) return 'none';
      throw err;
    }
    // A past meeting that was never on the calendar stays off it.
    if (onlyIfPending && meeting.calendar_sync !== 'pending') {
      return meeting.calendar_sync === 'ok' ? 'ok' : 'none';
    }
    const snap = await this.store.snapshot();
    const settings = snap.config.settings;
    const calendarId = settings.calendar_id || 'primary';
    const { calendar } = this.store.google;
    const v = meeting.values;
    const eventId = meeting.calendar_event_id;
    const wanted =
      !meeting.deleted_at &&
      v.meeting_status !== 'Cancelled' &&
      typeof v.date === 'string' &&
      typeof v.start_time === 'string';

    let state: SyncResult = 'ok';
    let keptId = eventId;
    try {
      const cat = snap.config.byCategory.get(meeting.category_slug)?.category;
      if (wanted) {
        const payload = buildEventPayload({
          meetingId: meeting.id,
          categorySlug: meeting.category_slug,
          categoryName: cat?.name ?? meeting.category_slug,
          title: meeting.title,
          date: v.date as string,
          startTime: v.start_time as string,
          endTime: endTimeOf(v, Number(settings.default_duration_min)),
          timezone: settings.timezone,
          appUrl: this.options.appUrl,
          reminderMinutes: parseReminders(
            typeof v.reminder_minutes === 'string' ? v.reminder_minutes : '',
            settings.default_reminders,
          ),
          meetingLink: typeof v.meeting_link === 'string' ? v.meeting_link : undefined,
          details: typeof v.details === 'string' ? v.details : undefined,
          fileLinks: meeting.files.map((f) => f.view_link),
          colorId: this.colorIdFor(
            meeting.category_slug,
            [...snap.config.byCategory.values()].map((c) => c.category),
          ),
        });
        keptId = (await upsertEvent(calendar, calendarId, payload)).id;
      } else if (eventId) {
        try {
          await calendar.deleteEvent(calendarId, eventId);
        } catch (err) {
          // Already gone is the result we wanted.
          if (!isGoogleApiError(err, 404) && !isGoogleApiError(err, 410)) throw err;
        }
      } else {
        state = 'none';
      }
    } catch (err) {
      this.options.logger.warn(
        { meetingId: id, status: isGoogleApiError(err) ? err.status : undefined },
        'calendar sync failed',
      );
      state = 'error';
    }
    await this.meetings.recordSync(id, meeting.rev, state, keptId);
    return state;
  }

  /** Every meeting that still needs the calendar: used by the retry job and "Try all again". */
  async pendingIds(): Promise<string[]> {
    const snap = await this.store.snapshot();
    const out: string[] = [];
    for (const data of snap.categories.values()) {
      for (const [id, entry] of data.entries) {
        const s = entry.record.system.calendar_sync;
        if (s === 'pending' || s === 'error') out.push(id);
      }
    }
    return out;
  }

  async retryAll(): Promise<{ tried: number; ok: number; failed: number }> {
    const ids = await this.pendingIds();
    let ok = 0;
    for (const id of ids) {
      if ((await this.sync(id)) === 'error') continue;
      ok += 1;
    }
    return { tried: ids.length, ok, failed: ids.length - ok };
  }
}

function endTimeOf(v: Meeting['values'], defaultMinutes: number): string {
  if (typeof v.end_time === 'string' && v.end_time) return v.end_time;
  const [h, m] = String(v.start_time).split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + defaultMinutes;
  const capped = Math.min(total, 23 * 60 + 59);
  return `${String(Math.floor(capped / 60)).padStart(2, '0')}:${String(capped % 60).padStart(2, '0')}`;
}
