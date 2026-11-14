import { describe, expect, it } from 'vitest';
import {
  EMPTY,
  isFiltered,
  parseParams,
  rangeDates,
  toApiQuery,
  toSearch,
} from '../../lib/dashboard-params';
import { DEFAULT_SETTINGS } from '../../shared/schema';

const settings = { ...DEFAULT_SETTINGS };
const qs = (s: string) => new URLSearchParams(s);

describe('reading the address bar', () => {
  it('starts empty', () => {
    expect(parseParams(qs(''))).toEqual(EMPTY);
    expect(isFiltered(EMPTY)).toBe(false);
  });

  it('round-trips everything', () => {
    const p = {
      ...EMPTY,
      q: 'laning',
      category: 'ccie',
      workspace: 'nhai',
      status: 'Completed',
      range: 'custom' as const,
      from: '2026-11-01',
      to: '2026-11-30',
      sort: 'title',
      dir: 'desc' as const,
      filters: [{ field: 'state', op: 'is' as const, value: 'Kerala' }],
      attention: 'awaiting' as const,
    };
    expect(parseParams(qs(toSearch(p)))).toEqual(p);
    expect(isFiltered(p)).toBe(true);
  });

  it('leaves out what is empty, and the custom dates unless the range is custom', () => {
    expect(toSearch({ ...EMPTY, q: '  ', from: '2026-01-01' })).toBe('');
    expect(toSearch({ ...EMPTY, range: 'week', from: '2026-01-01' })).toBe('range=week');
  });

  it('ignores a damaged link instead of failing', () => {
    expect(parseParams(qs('filters=not-json&range=sometimes&dir=sideways&show=other'))).toEqual(
      EMPTY,
    );
    expect(
      parseParams(
        qs(
          'filters=' +
            encodeURIComponent('[{"field":"x","op":"nope"},{"field":"y","op":"is","value":"1"}]'),
        ),
      ).filters,
    ).toEqual([{ field: 'y', op: 'is', value: '1' }]);
    expect(parseParams(qs('filters=' + encodeURIComponent('{"a":1}'))).filters).toEqual([]);
  });
});

describe('date ranges (today is in the configured timezone)', () => {
  // 2026-11-18 01:30 in India (Wednesday), still 17 Nov (Tuesday) in Los Angeles.
  const now = new Date('2026-11-17T20:00:00Z');

  it('today', () => {
    expect(rangeDates({ range: 'today', from: '', to: '' }, settings, now)).toEqual({
      from: '2026-11-18',
      to: '2026-11-18',
    });
    expect(
      rangeDates(
        { range: 'today', from: '', to: '' },
        { ...settings, timezone: 'America/Los_Angeles' },
        now,
      ),
    ).toEqual({ from: '2026-11-17', to: '2026-11-17' });
  });

  it('this week follows the week-start setting', () => {
    const r = (week_starts_on: string) =>
      rangeDates({ range: 'week', from: '', to: '' }, { ...settings, week_starts_on }, now);
    expect(r('monday')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(r('sunday')).toEqual({ from: '2026-11-15', to: '2026-11-21' });
    expect(r('saturday')).toEqual({ from: '2026-11-14', to: '2026-11-20' });
  });

  it('a week that starts on the day itself, and one that spans a month end', () => {
    const monday = new Date('2026-11-16T06:00:00Z');
    expect(rangeDates({ range: 'week', from: '', to: '' }, settings, monday)).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
    const sunday = new Date('2026-11-29T06:00:00Z');
    expect(rangeDates({ range: 'week', from: '', to: '' }, settings, sunday)).toEqual({
      from: '2026-11-23',
      to: '2026-11-29',
    });
    const monthEnd = new Date('2026-12-02T06:00:00Z');
    expect(rangeDates({ range: 'week', from: '', to: '' }, settings, monthEnd)).toEqual({
      from: '2026-11-30',
      to: '2026-12-06',
    });
  });

  it('this month, including February and leap years', () => {
    expect(rangeDates({ range: 'month', from: '', to: '' }, settings, now)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(
      rangeDates({ range: 'month', from: '', to: '' }, settings, new Date('2028-02-10T06:00:00Z')),
    ).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(
      rangeDates({ range: 'month', from: '', to: '' }, settings, new Date('2026-12-31T06:00:00Z')),
    ).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('custom takes what was typed, and any is open', () => {
    expect(rangeDates({ range: 'custom', from: '2026-01-05', to: '' }, settings, now)).toEqual({
      from: '2026-01-05',
      to: undefined,
    });
    expect(rangeDates({ range: 'any', from: 'x', to: 'y' }, settings, now)).toEqual({});
  });
});

describe('the query sent to the server', () => {
  it('is the same for the table and the calendar except for scope and dates', () => {
    const p = {
      ...EMPTY,
      q: 'laning',
      category: 'ccie',
      filters: [{ field: 'state', op: 'is' as const, value: 'Kerala' }],
    };
    const table = qs(toApiQuery(p, settings, { scope: 'upcoming', limit: 50 }));
    const calendar = qs(
      toApiQuery(p, settings, { scope: 'all', from: '2026-11-01', to: '2026-11-30', limit: 1000 }),
    );
    for (const k of ['q', 'category', 'filters']) expect(table.get(k)).toBe(calendar.get(k));
    expect(table.get('scope')).toBe('upcoming');
    expect(calendar.get('scope')).toBe('all');
    expect(calendar.get('from')).toBe('2026-11-01');
  });

  it('the calendar window and the Dates control narrow each other', () => {
    const now = new Date('2026-11-17T20:00:00Z'); // 18 Nov in India
    const today = { ...EMPTY, range: 'today' as const };
    // Today is inside November, so today wins.
    const inside = qs(
      toApiQuery(today, settings, { scope: 'all', from: '2026-11-01', to: '2026-11-30' }, now),
    );
    expect([inside.get('from'), inside.get('to')]).toEqual(['2026-11-18', '2026-11-18']);
    // Today is outside the month being shown, so nothing can match.
    const outside = qs(
      toApiQuery(today, settings, { scope: 'all', from: '2026-12-01', to: '2026-12-31' }, now),
    );
    expect(outside.get('from')! > outside.get('to')!).toBe(true);
    // With no Dates choice, the window alone decides.
    const open = qs(
      toApiQuery(EMPTY, settings, { scope: 'all', from: '2026-11-01', to: '2026-11-30' }, now),
    );
    expect([open.get('from'), open.get('to')]).toEqual(['2026-11-01', '2026-11-30']);
  });

  it('a "show" from the attention line looks at every meeting, past and future', () => {
    const q = qs(
      toApiQuery({ ...EMPTY, attention: 'incomplete' }, settings, { scope: 'upcoming' }),
    );
    expect(q.get('scope')).toBe('all');
    expect(q.get('incomplete')).toBe('1');
    expect(
      qs(toApiQuery({ ...EMPTY, attention: 'awaiting' }, settings, { scope: 'past' })).get(
        'awaiting',
      ),
    ).toBe('1');
  });

  it('passes the cursor and the sort through', () => {
    const q = qs(
      toApiQuery({ ...EMPTY, sort: 'title', dir: 'desc' }, settings, {
        scope: 'past',
        limit: 50,
        cursor: '50',
      }),
    );
    expect([q.get('sort'), q.get('dir'), q.get('limit'), q.get('cursor')]).toEqual([
      'title',
      'desc',
      '50',
      '50',
    ]);
  });
});
