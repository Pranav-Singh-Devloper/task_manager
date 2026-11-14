import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import {
  buildEventPayload,
  parseReminders,
  type EventSource,
} from '../../server/services/calendarEvent';

const base = (over: Partial<EventSource> = {}): EventSource => ({
  meetingId: newId(),
  categorySlug: 'ccie',
  categoryName: 'CCIE',
  title: 'CCIE — NH-44 (C-101)',
  date: '2026-11-17',
  startTime: '10:30',
  endTime: '11:30',
  timezone: 'Asia/Kolkata',
  appUrl: 'https://meetings.example.com',
  reminderMinutes: [1440, 60],
  ...over,
});

describe('parseReminders', () => {
  it('uses the default when blank', () => {
    expect(parseReminders('', '1440,60')).toEqual([1440, 60]);
    expect(parseReminders(undefined, '1440,60')).toEqual([1440, 60]);
  });

  it('reads the meeting own list, largest first, without duplicates', () => {
    expect(parseReminders('15, 60, 15, 10080', '1440,60')).toEqual([10080, 60, 15]);
  });

  it('allows exactly 4 weeks and 5 reminders', () => {
    expect(parseReminders('40320', '60')).toEqual([40320]);
    expect(parseReminders('1,2,3,4,5', '60')).toHaveLength(5);
  });

  it('rejects more than 5, more than 4 weeks, and anything that is not whole minutes', () => {
    expect(() => parseReminders('1,2,3,4,5,6', '60')).toThrow(/at most 5/);
    expect(() => parseReminders('40321', '60')).toThrow(/4 weeks/);
    expect(() => parseReminders('1h', '60')).toThrow(/not a number/);
    expect(() => parseReminders('-5', '60')).toThrow(/not a number/);
  });
});

describe('buildEventPayload', () => {
  it('matches the shape in the spec', () => {
    const s = base({
      meetingLink: 'https://meet.google.com/abc',
      details: 'Bring the file',
      fileLinks: ['https://drive/x'],
    });
    const e = buildEventPayload(s);
    expect(e.id).toMatch(/^mm[0-9a-f]{32}$/);
    expect(e.summary).toBe('[CCIE] CCIE — NH-44 (C-101)');
    expect(e.start).toEqual({ dateTime: '2026-11-17T10:30:00', timeZone: 'Asia/Kolkata' });
    expect(e.end).toEqual({ dateTime: '2026-11-17T11:30:00', timeZone: 'Asia/Kolkata' });
    expect(e.location).toBe('https://meet.google.com/abc');
    expect(e.reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 },
        { method: 'popup', minutes: 60 },
      ],
    });
    expect(e.extendedProperties.private).toEqual({ mmMeetingId: s.meetingId, mmCategory: 'ccie' });
    expect(e.description).toContain(
      `Open in app: https://meetings.example.com/meetings/${s.meetingId}`,
    );
    expect(e.description).toContain('Files:\nhttps://drive/x');
    expect(e.description).toContain('Meeting link: https://meet.google.com/abc');
    expect(e.description).toContain('Bring the file');
  });

  it('leaves out what is not there instead of printing empty labels', () => {
    const e = buildEventPayload(base());
    expect(e.description).not.toMatch(/Files:|Meeting link:/);
    expect(e.location).toBeUndefined();
  });

  it('only uses a real web link as the location', () => {
    expect(buildEventPayload(base({ meetingLink: 'room 4' })).location).toBeUndefined();
  });

  it('is deterministic for the same meeting', () => {
    const s = base();
    expect(buildEventPayload(s).id).toBe(buildEventPayload(s).id);
  });

  it('refuses an end time that is not after the start', () => {
    expect(() => buildEventPayload(base({ endTime: '10:30' }))).toThrow(/after the start/);
    expect(() => buildEventPayload(base({ endTime: '09:00' }))).toThrow(/after the start/);
  });
});
