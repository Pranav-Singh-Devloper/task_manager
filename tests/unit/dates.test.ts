import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  endTimeFor,
  friendlyDate,
  friendlyTime,
  instantOf,
  isUpcoming,
  nowIn,
  parseDateLoose,
  parseTimeLoose,
  shiftDate,
  todayIn,
} from '../../shared/dates';

describe('parseDateLoose (tests run with TZ=America/Los_Angeles)', () => {
  it('reads the formats people type, day first', () => {
    const cases: [unknown, string][] = [
      ['2026-11-17', '2026-11-17'],
      ['2026/11/17', '2026-11-17'],
      ['17/11/2026', '2026-11-17'],
      ['17-11-2026', '2026-11-17'],
      ['17.11.2026', '2026-11-17'],
      ['17-Nov-2026', '2026-11-17'],
      ['17 Nov 2026', '2026-11-17'],
      ['17 November 2026', '2026-11-17'],
      ['Mon, 17 Nov 2026', '2026-11-17'],
      ['Nov 17, 2026', '2026-11-17'],
      ['1/2/2026', '2026-02-01'],
      ['17/11/26', '2026-11-17'],
      ['2026-11-17T10:30:00', '2026-11-17'],
      ['  17/11/2026  ', '2026-11-17'],
    ];
    for (const [input, expected] of cases)
      expect(parseDateLoose(input), String(input)).toBe(expected);
  });

  it('reads a Sheets date number', () => {
    expect(parseDateLoose(46343)).toBe('2026-11-17');
    expect(parseDateLoose('46343')).toBe('2026-11-17');
    expect(parseDateLoose(45000)).toBe('2023-03-15');
  });

  it('refuses things that are not real dates', () => {
    for (const bad of [
      '',
      '  ',
      'soon',
      '31/02/2026',
      '2026-13-01',
      '0/0/2026',
      '32/1/2026',
      null,
      undefined,
      {},
      12,
      '17 Foo 2026',
    ]) {
      expect(parseDateLoose(bad), String(bad)).toBeNull();
    }
  });

  it('knows leap years', () => {
    expect(parseDateLoose('29/02/2024')).toBe('2024-02-29');
    expect(parseDateLoose('29/02/2026')).toBeNull();
  });

  it('does not shift a date when the server is in another timezone', () => {
    // Tests run with TZ=America/Los_Angeles: a naive Date would move midnight back a day.
    expect(parseDateLoose('2026-11-17')).toBe('2026-11-17');
    expect(parseDateLoose(46343)).toBe('2026-11-17');
  });
});

describe('parseTimeLoose', () => {
  it('reads the formats people type', () => {
    const cases: [unknown, string][] = [
      ['10:30', '10:30'],
      ['9:05', '09:05'],
      ['10:30 AM', '10:30'],
      ['9:05 pm', '21:05'],
      ['12:00 AM', '00:00'],
      ['12:30 PM', '12:30'],
      ['2.30pm', '14:30'],
      ['14:30:00', '14:30'],
      ['5 PM', '17:00'],
      ['5pm', '17:00'],
      ['10', '10:00'],
    ];
    for (const [input, expected] of cases)
      expect(parseTimeLoose(input), String(input)).toBe(expected);
  });
  it('reads a Sheets time fraction', () => {
    expect(parseTimeLoose(0.4375)).toBe('10:30');
    expect(parseTimeLoose(0.5)).toBe('12:00');
    expect(parseTimeLoose(0)).toBe('00:00');
  });
  it('refuses nonsense', () => {
    for (const bad of ['', 'noon', '25:00', '10:75', '13 PM', '0 AM', null, undefined, 1.5, -0.1]) {
      expect(parseTimeLoose(bad), String(bad)).toBeNull();
    }
  });
});

describe('timezone handling', () => {
  // 2026-11-17 20:00 UTC is 01:30 on 18 Nov in India and noon on 17 Nov in Los Angeles.
  const now = new Date('2026-11-17T20:00:00Z');
  it('today is computed in the configured timezone, not the server one', () => {
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-11-18');
    expect(todayIn('America/Los_Angeles', now)).toBe('2026-11-17');
    expect(nowIn('Asia/Kolkata', now)).toBe('2026-11-18T01:30:00');
  });
  it('a date and time mean a moment in the configured timezone', () => {
    expect(instantOf('2026-11-17', '10:30', 'Asia/Kolkata').toISOString()).toBe(
      '2026-11-17T05:00:00.000Z',
    );
    expect(instantOf('2026-11-17', '10:30', 'America/Los_Angeles').toISOString()).toBe(
      '2026-11-17T18:30:00.000Z',
    );
  });
  it('upcoming means it has not ended yet', () => {
    const at = new Date('2026-11-17T05:30:00Z'); // 11:00 in India, mid-meeting
    expect(isUpcoming('2026-11-17', '10:30', '11:30', 60, 'Asia/Kolkata', at)).toBe(true);
    expect(isUpcoming('2026-11-17', '10:30', '10:45', 60, 'Asia/Kolkata', at)).toBe(false);
    expect(isUpcoming('2026-11-17', '10:30', null, 60, 'Asia/Kolkata', at)).toBe(true);
    expect(
      isUpcoming('2026-11-17', '10:30', null, 60, 'Asia/Kolkata', new Date('2026-11-17T06:00:01Z')),
    ).toBe(false);
  });
});

describe('times and friendly dates', () => {
  it('end time defaults to start plus the default length', () => {
    expect(endTimeFor('10:30', null, 60)).toBe('11:30');
    expect(endTimeFor('10:30', '12:00', 60)).toBe('12:00');
    expect(endTimeFor('23:30', null, 60)).toBeNull();
  });
  it('adds minutes without crossing midnight', () => {
    expect(addMinutesToTime('09:15', 90)).toBe('10:45');
    expect(addMinutesToTime('23:59', 1)).toBeNull();
  });
  it('shifts dates across month ends', () => {
    expect(shiftDate('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('formats dates and times for people', () => {
    expect(friendlyDate('2026-11-17', '2026-11-14')).toBe('Tue, 17 Nov 2026');
    expect(friendlyDate('2026-11-14', '2026-11-14')).toBe('Today');
    expect(friendlyDate('2026-11-15', '2026-11-14')).toBe('Tomorrow');
    expect(friendlyTime('10:30')).toBe('10:30 AM');
    expect(friendlyTime('00:05')).toBe('12:05 AM');
    expect(friendlyTime('12:00')).toBe('12:00 PM');
    expect(friendlyTime('17:45')).toBe('5:45 PM');
    expect(friendlyTime('17:45', '24h')).toBe('17:45');
  });
});
