import { google, type calendar_v3 } from 'googleapis';
import type { CalendarClient, CalendarEvent, CalendarEventInput } from '../types';
import { run, type LiveContext } from './call';

function toEvent(e: calendar_v3.Schema$Event, fallback: CalendarEventInput): CalendarEvent {
  return {
    ...fallback,
    id: e.id ?? fallback.id,
    status: e.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };
}

/** Calendar v3 behind the CalendarClient interface. A reused event id comes back as a 409 GoogleApiError. */
export class LiveCalendar implements CalendarClient {
  constructor(private readonly ctx: LiveContext) {}

  private async api(): Promise<calendar_v3.Calendar> {
    return google.calendar({ version: 'v3', auth: await this.ctx.authClient() });
  }

  async insertEvent(calendarId: string, event: CalendarEventInput): Promise<CalendarEvent> {
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.events.insert({ calendarId, requestBody: event as calendar_v3.Schema$Event }),
    );
    return toEvent(res.data, event);
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    const api = await this.api();
    const res = await run(this.ctx, () => api.events.get({ calendarId, eventId }));
    const e = res.data;
    return {
      id: e.id ?? eventId,
      summary: e.summary ?? '',
      description: e.description ?? '',
      start: { dateTime: e.start?.dateTime ?? '', timeZone: e.start?.timeZone ?? '' },
      end: { dateTime: e.end?.dateTime ?? '', timeZone: e.end?.timeZone ?? '' },
      location: e.location ?? undefined,
      reminders: {
        useDefault: false,
        overrides: (e.reminders?.overrides ?? []).map((o) => ({
          method: 'popup' as const,
          minutes: o.minutes ?? 0,
        })),
      },
      extendedProperties: {
        private: (e.extendedProperties?.private as Record<string, string> | undefined) ?? {},
      },
      colorId: e.colorId ?? undefined,
      status: e.status === 'cancelled' ? 'cancelled' : 'confirmed',
    };
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<CalendarEvent> {
    const api = await this.api();
    const res = await run(this.ctx, () =>
      api.events.update({ calendarId, eventId, requestBody: event as calendar_v3.Schema$Event }),
    );
    return toEvent(res.data, event);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const api = await this.api();
    await run(this.ctx, () => api.events.delete({ calendarId, eventId }));
  }
}
