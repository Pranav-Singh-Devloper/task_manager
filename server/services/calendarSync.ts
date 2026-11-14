import { isGoogleApiError } from './google/errors';
import type { CalendarClient, CalendarEvent, CalendarEventInput } from './google/types';

/**
 * Puts the event on the calendar. A 409 means the id was used before (a retry whose answer was lost,
 * or a cancelled meeting being restored), so the existing event is updated and confirmed instead.
 * Either way there is exactly one event for the meeting.
 */
export async function upsertEvent(
  calendar: CalendarClient,
  calendarId: string,
  payload: CalendarEventInput,
): Promise<CalendarEvent> {
  try {
    return await calendar.insertEvent(calendarId, payload);
  } catch (err) {
    if (!isGoogleApiError(err, 409)) throw err;
    await calendar.getEvent(calendarId, payload.id);
    return calendar.updateEvent(calendarId, payload.id, { ...payload, status: 'confirmed' });
  }
}
