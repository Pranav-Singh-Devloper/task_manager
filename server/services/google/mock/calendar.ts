import { GoogleApiError } from '../errors';
import type { CalendarClient, CalendarEvent, CalendarEventInput } from '../types';
import type { FailureInjector } from './failure';
import type { MockWorld } from './world';

const BASE32HEX = /^[0-9a-v]{5,1024}$/;
const MAX_REMINDERS = 5;
const MAX_REMINDER_MINUTES = 40320;

/** Mirrors the Calendar rules the app depends on: id format, reminder limits, 409 on reused ids. */
export class MockCalendar implements CalendarClient {
  constructor(
    private world: MockWorld,
    private failures: FailureInjector,
  ) {}

  private events(calendarId: string): Map<string, CalendarEvent> {
    let m = this.world.calendars.get(calendarId);
    if (!m) {
      m = new Map();
      this.world.calendars.set(calendarId, m);
    }
    return m;
  }

  private validate(event: CalendarEventInput): void {
    if (!BASE32HEX.test(event.id)) {
      throw new GoogleApiError(400, 'Invalid resource id value.', 'invalid');
    }
    const overrides = event.reminders.overrides;
    if (
      overrides.length > MAX_REMINDERS ||
      overrides.some((o) => o.minutes < 0 || o.minutes > MAX_REMINDER_MINUTES)
    ) {
      throw new GoogleApiError(400, 'Invalid reminders.', 'invalid');
    }
  }

  async insertEvent(calendarId: string, event: CalendarEventInput): Promise<CalendarEvent> {
    this.failures.check('calendar');
    this.validate(event);
    const events = this.events(calendarId);
    if (events.has(event.id)) {
      throw new GoogleApiError(409, 'The requested identifier already exists.', 'duplicate');
    }
    const stored: CalendarEvent = { ...event, status: event.status ?? 'confirmed' };
    events.set(event.id, stored);
    return structuredClone(stored);
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    this.failures.check('calendar');
    const e = this.events(calendarId).get(eventId);
    if (!e) throw new GoogleApiError(404, 'Not Found', 'notFound');
    return structuredClone(e);
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<CalendarEvent> {
    this.failures.check('calendar');
    this.validate(event);
    const events = this.events(calendarId);
    if (!events.has(eventId)) throw new GoogleApiError(404, 'Not Found', 'notFound');
    const stored: CalendarEvent = { ...event, id: eventId, status: event.status ?? 'confirmed' };
    events.set(eventId, stored);
    return structuredClone(stored);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    this.failures.check('calendar');
    const e = this.events(calendarId).get(eventId);
    if (!e) throw new GoogleApiError(404, 'Not Found', 'notFound');
    // Google keeps the id reserved, with status "cancelled".
    e.status = 'cancelled';
  }
}
