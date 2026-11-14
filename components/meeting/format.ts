import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { friendlyDate, friendlyTime, todayIn } from '@/shared/dates';
import type { FieldDef, FieldValue, Settings } from '@/shared/types';
import type { Value } from '@/shared/formula';

/** "Tue, 17 Nov 2026" or Today / Tomorrow. Never an ISO string (Rule Zero). */
export function dateText(date: string, settings: Settings, now = new Date()): string {
  return friendlyDate(date, todayIn(settings.timezone, now));
}

export function timeText(time: string, settings: Settings): string {
  return friendlyTime(time, settings.time_format === '24h' ? '24h' : '12h');
}

/** When a change was made, shown in the configured timezone: "Tue, 17 Nov 2026, 10:30 AM". */
export function stampText(iso: string, settings: Settings): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const time = settings.time_format === '24h' ? 'HH:mm' : 'h:mm a';
  return formatInTimeZone(t, settings.timezone, `EEE, d MMM yyyy, ${time}`);
}

const NUMBER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });

/** A stored value as a person reads it. Empty gives null so the screen can say "Not added". */
export function valueText(
  f: FieldDef,
  v: FieldValue | Value | undefined,
  settings: Settings,
  words: { yes: string; no: string },
): string | null {
  if (typeof v === 'boolean') return v ? words.yes : words.no;
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) return v.length ? v.join(', ') : null;
  if (typeof v === 'number') return `${NUMBER.format(v)}${f.unit ? ` ${f.unit}` : ''}`;
  if (f.type === 'date') return dateText(v, settings);
  if (f.type === 'time') return timeText(v, settings);
  return String(v);
}

/** A full date that always reads the same, for records of what happened: "Tue, 17 Nov 2026". */
export function fullDate(date: string): string {
  return format(parseISO(date), 'EEE, d MMM yyyy');
}
