import { addDays, format, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Dates are stored as ISO YYYY-MM-DD and times as HH:mm (24 hour), so they sort correctly even as text.
 * People type other things into the Sheet, so reading is tolerant and writing is strict (§4.6).
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Returns YYYY-MM-DD only for a real calendar date (no 30 February). */
function isoOrNull(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d)
    return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function fullYear(y: number): number {
  return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
}

/** A Google Sheets date serial: days since 30 Dec 1899. */
function fromSerial(n: number): string | null {
  if (n < 20000 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000);
  return isoOrNull(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Reads a date a person may have typed: 2026-11-17, 17/11/2026, 17-11-2026, 17.11.26, 17-Nov-2026,
 * Mon, 17 Nov 2026, November 17 2026, or a Sheets date number. Day first, as in India.
 * Returns null when it is not a real date.
 */
export function parseDateLoose(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return fromSerial(value);
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
  if (!s) return null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return isoOrNull(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/.exec(s);
  if (m) return isoOrNull(fullYear(Number(m[3])), Number(m[2]), Number(m[1]));

  m = /^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]+([A-Za-z]{3,9})\.?,?[-/.\s]+(\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTHS[(m[2] as string).toLowerCase()];
    return month ? isoOrNull(fullYear(Number(m[3])), month, Number(m[1])) : null;
  }

  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTHS[(m[1] as string).toLowerCase()];
    return month ? isoOrNull(fullYear(Number(m[3])), month, Number(m[2])) : null;
  }

  if (/^\d{5}(\.\d+)?$/.test(s)) return fromSerial(Number(s));
  return null;
}

/** Reads a time a person may have typed: 10:30, 9:05 AM, 2.30pm, 14:30:00, or a Sheets time fraction. Returns HH:mm. */
export function parseTimeLoose(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (value < 0 || value >= 1) return null;
    const total = Math.round(value * 24 * 60);
    return total >= 24 * 60 ? null : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*([ap])?\.?m?\.?$/i.exec(value.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const meridiem = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === 'p' && h < 12) h += 12;
    if (meridiem === 'a' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${pad(h)}:${pad(min)}`;
}

export const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && parseDateLoose(v) === v;
export const isTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// ---------- the configured timezone ----------

/** "Today" in the configured timezone, never the server's. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timezone, 'yyyy-MM-dd');
}

export function nowIn(timezone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ss");
}

/** The moment a date and time mean in the configured timezone. */
export function instantOf(date: string, time: string, timezone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, timezone);
}

export function addMinutesToTime(time: string, minutes: number): string | null {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null; // meetings that cross midnight are not supported
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** The end of a meeting: its end time, or the start plus the default length (§9 rule 1). */
export function endTimeFor(
  start: string,
  end: string | null | undefined,
  defaultMinutes: number,
): string | null {
  return end ? end : addMinutesToTime(start, defaultMinutes);
}

/** Upcoming means the meeting has not ended yet (§9 rule 2). */
export function isUpcoming(
  date: string,
  start: string,
  end: string | null | undefined,
  defaultMinutes: number,
  timezone: string,
  now: Date,
): boolean {
  const endAt = endTimeFor(start, end, defaultMinutes) ?? '23:59';
  return instantOf(date, endAt, timezone).getTime() >= now.getTime();
}

export function shiftDate(date: string, days: number): string {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

/** Friendly dates for the UI: "Mon, 17 Nov 2026", "Today", "Tomorrow". */
export function friendlyDate(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === shiftDate(today, 1)) return 'Tomorrow';
  return format(parseISO(date), 'EEE, d MMM yyyy');
}

export function friendlyTime(time: string, style: '12h' | '24h' = '12h'): string {
  if (style === '24h') return time;
  const [h, m] = time.split(':').map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * The next date after `today` that falls on the same weekday as `from`, at least `weeks` weeks on.
 * "Same time next week" for a meeting last Wednesday is the first Wednesday in the future.
 */
export function sameWeekdayAfter(from: string, weeks: number, today: string): string {
  let d = shiftDate(from, weeks * 7);
  while (d <= today) d = shiftDate(d, 7);
  return d;
}
