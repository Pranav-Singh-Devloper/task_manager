import { describe, expect, it } from 'vitest';
import { calendarEventIdFor, isUlid, newId } from '../../shared/ids';

describe('calendarEventIdFor', () => {
  it('is deterministic, 34 characters and valid base32hex', () => {
    const id = newId();
    const a = calendarEventIdFor(id);
    expect(a).toBe(calendarEventIdFor(id));
    expect(a).toHaveLength(34);
    expect(a).toMatch(/^mm[0-9a-f]{32}$/);
    expect(a).toMatch(/^[0-9a-v]+$/);
  });

  it('differs between meetings', () => {
    expect(calendarEventIdFor(newId())).not.toBe(calendarEventIdFor(newId()));
  });

  it('rejects ids that are not ULIDs', () => {
    expect(() => calendarEventIdFor('not-a-ulid')).toThrow();
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    expect(isUlid('hello')).toBe(false);
  });
});
