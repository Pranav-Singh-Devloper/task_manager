import { calendarEventIdFor } from '../../shared/ids';
import type { CalendarEventInput } from './google/types';

/** Calendar allows at most 5 reminders, each at most 4 weeks (§5.8). */
export const MAX_REMINDERS = 5;
export const MAX_REMINDER_MINUTES = 40320;

/**
 * "1440, 60" → [1440, 60]. Blank text falls back to the default list. Anything that is not a whole number
 * of minutes within Calendar's limits is an error with a plain explanation.
 */
export function parseReminders(text: string | undefined, fallback: string): number[] {
  const source = text && text.trim() !== '' ? text : fallback;
  const parts = source
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const minutes = parts.map((p) => {
    if (!/^\d+$/.test(p)) throw new Error(`"${p}" is not a number of minutes.`);
    return Number(p);
  });
  const unique = [...new Set(minutes)].sort((a, b) => b - a);
  if (unique.length > MAX_REMINDERS)
    throw new Error(`Google Calendar allows at most ${MAX_REMINDERS} reminders.`);
  if (unique.some((m) => m > MAX_REMINDER_MINUTES)) {
    throw new Error('Google Calendar cannot remind more than 4 weeks ahead.');
  }
  return unique;
}

export interface EventSource {
  meetingId: string;
  categorySlug: string;
  categoryName: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm, 24 hour */
  startTime: string;
  endTime: string;
  timezone: string;
  appUrl: string;
  reminderMinutes: number[];
  meetingLink?: string;
  details?: string;
  fileLinks?: string[];
  colorId?: string;
}

/** The Google Calendar event for a meeting (§5.8). The id is derived from the meeting so retries never duplicate. */
export function buildEventPayload(s: EventSource): CalendarEventInput {
  if (s.endTime <= s.startTime) throw new Error('The end time must be after the start time.');
  const lines = [
    s.details?.trim(),
    `Open in app: ${s.appUrl}/meetings/${s.meetingId}`,
    s.fileLinks && s.fileLinks.length > 0 ? `Files:\n${s.fileLinks.join('\n')}` : undefined,
    s.meetingLink ? `Meeting link: ${s.meetingLink}` : undefined,
  ].filter((l): l is string => Boolean(l));

  return {
    id: calendarEventIdFor(s.meetingId),
    summary: `[${s.categoryName}] ${s.title}`,
    description: lines.join('\n\n'),
    start: { dateTime: `${s.date}T${s.startTime}:00`, timeZone: s.timezone },
    end: { dateTime: `${s.date}T${s.endTime}:00`, timeZone: s.timezone },
    ...(s.meetingLink && /^https?:\/\//.test(s.meetingLink) ? { location: s.meetingLink } : {}),
    reminders: {
      useDefault: false,
      overrides: s.reminderMinutes.map((minutes) => ({ method: 'popup' as const, minutes })),
    },
    extendedProperties: { private: { mmMeetingId: s.meetingId, mmCategory: s.categorySlug } },
    ...(s.colorId ? { colorId: s.colorId } : {}),
  };
}
