import { isValid, ulid, ulidToUUID } from 'ulid';

export function newId(): string {
  return ulid();
}

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 26 && isValid(value);
}

/**
 * Deterministic Google Calendar event id for a meeting: "mm" + the 16 bytes of the ULID as
 * lowercase hex (34 characters, all valid base32hex). A retried insert reuses the same id,
 * so a lost response can never create a second event.
 */
export function calendarEventIdFor(meetingId: string): string {
  if (!isUlid(meetingId)) throw new Error('Meeting id must be a ULID');
  return 'mm' + ulidToUUID(meetingId).replace(/-/g, '').toLowerCase();
}
