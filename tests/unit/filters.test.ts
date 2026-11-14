import { describe, expect, it } from 'vitest';
import {
  filterIsComplete,
  filterMatches,
  kindOf,
  opsFor,
  type FilterSpec,
} from '../../shared/filters';

const f = (op: FilterSpec['op'], value?: string, value2?: string): FilterSpec => ({
  field: 'x',
  op,
  value,
  value2,
});

describe('operators by kind of column', () => {
  it('offers sensible choices for each kind', () => {
    expect(opsFor('text')).toEqual(['contains', 'is', 'is_not', 'is_empty', 'is_not_empty']);
    expect(opsFor('number')).toEqual([
      'is',
      'is_not',
      'greater',
      'less',
      'between',
      'is_empty',
      'is_not_empty',
    ]);
    expect(opsFor('date')).toEqual([
      'is',
      'before',
      'after',
      'between',
      'is_empty',
      'is_not_empty',
    ]);
    expect(opsFor('checkbox')).toEqual(['is']);
  });
  it('maps field types to kinds', () => {
    expect(kindOf('select')).toBe('text');
    expect(kindOf('multi_select')).toBe('text');
    expect(kindOf('computed')).toBe('number');
    expect(kindOf('title')).toBe('text');
    expect(kindOf('date')).toBe('date');
  });
});

describe('text and choices', () => {
  it('contains ignores case and finds part of a word', () => {
    expect(filterMatches(f('contains', 'widen'), 'NH-44 Widening', 'text')).toBe(true);
    expect(filterMatches(f('contains', 'zzz'), 'NH-44 Widening', 'text')).toBe(false);
    expect(filterMatches(f('contains', ''), 'anything', 'text')).toBe(false);
  });
  it('is and is not compare whole values, ignoring case', () => {
    expect(filterMatches(f('is', 'kerala'), 'Kerala', 'text')).toBe(true);
    expect(filterMatches(f('is', 'ker'), 'Kerala', 'text')).toBe(false);
    expect(filterMatches(f('is_not', 'Kerala'), 'Kerala', 'text')).toBe(false);
    expect(filterMatches(f('is_not', 'Kerala'), 'Assam', 'text')).toBe(true);
    expect(filterMatches(f('is_not', 'Kerala'), null, 'text')).toBe(true);
  });
  it('a list matches when any item matches', () => {
    expect(filterMatches(f('is', 'b'), ['A', 'B'], 'text')).toBe(true);
    expect(filterMatches(f('contains', 'c'), ['A', 'B'], 'text')).toBe(false);
    expect(filterMatches(f('is_not', 'A'), ['A', 'B'], 'text')).toBe(false);
  });
});

describe('emptiness', () => {
  it('treats blank, missing and empty lists as empty', () => {
    for (const v of [null, undefined, '', []]) {
      expect(filterMatches(f('is_empty'), v as never, 'text')).toBe(true);
      expect(filterMatches(f('is_not_empty'), v as never, 'text')).toBe(false);
    }
    expect(filterMatches(f('is_not_empty'), 'x', 'text')).toBe(true);
    expect(filterMatches(f('is_empty'), 0, 'number')).toBe(false);
  });
  it('a column the category does not have counts as empty, and never equals anything', () => {
    expect(filterMatches(f('is_empty'), undefined, 'text')).toBe(true);
    expect(filterMatches(f('is', 'x'), undefined, 'text')).toBe(false);
  });
});

describe('numbers', () => {
  it('compares as numbers, not text', () => {
    expect(filterMatches(f('greater', '9'), 10, 'number')).toBe(true);
    expect(filterMatches(f('less', '1,000'), 999, 'number')).toBe(true);
    expect(filterMatches(f('is', '42.5'), 42.5, 'number')).toBe(true);
    expect(filterMatches(f('is_not', '5'), 6, 'number')).toBe(true);
    expect(filterMatches(f('greater', '5'), null, 'number')).toBe(false);
  });
  it('between works in either order and includes both ends', () => {
    expect(filterMatches(f('between', '10', '20'), 10, 'number')).toBe(true);
    expect(filterMatches(f('between', '20', '10'), 20, 'number')).toBe(true);
    expect(filterMatches(f('between', '10', '20'), 21, 'number')).toBe(false);
    expect(filterMatches(f('between', '10'), 15, 'number')).toBe(false);
  });
  it('an unreadable number matches nothing', () => {
    expect(filterMatches(f('is', 'abc'), 5, 'number')).toBe(false);
  });
});

describe('dates and times', () => {
  it('reads a typed date and compares as dates', () => {
    expect(filterMatches(f('before', '17/11/2026'), '2026-11-16', 'date')).toBe(true);
    expect(filterMatches(f('before', '17/11/2026'), '2026-11-17', 'date')).toBe(false);
    expect(filterMatches(f('after', '2026-11-17'), '2026-11-18', 'date')).toBe(true);
    expect(filterMatches(f('is', '17 Nov 2026'), '2026-11-17', 'date')).toBe(true);
    expect(filterMatches(f('between', '2026-11-01', '2026-11-30'), '2026-11-15', 'date')).toBe(
      true,
    );
    expect(filterMatches(f('between', '2026-11-30', '2026-11-01'), '2026-11-15', 'date')).toBe(
      true,
    );
    expect(filterMatches(f('between', '2026-11-01', '2026-11-30'), '2026-12-01', 'date')).toBe(
      false,
    );
  });
  it('compares times', () => {
    expect(filterMatches(f('after', '2 pm'), '14:30', 'time')).toBe(true);
    expect(filterMatches(f('before', '09:00'), '09:30', 'time')).toBe(false);
  });
  it('an unreadable date matches nothing, and an empty cell never satisfies a comparison', () => {
    expect(filterMatches(f('before', 'soon'), '2026-11-17', 'date')).toBe(false);
    expect(filterMatches(f('before', '2026-11-17'), null, 'date')).toBe(false);
  });
});

describe('checkbox', () => {
  it('is Yes or No', () => {
    expect(filterMatches(f('is', 'yes'), true, 'checkbox')).toBe(true);
    expect(filterMatches(f('is', 'no'), false, 'checkbox')).toBe(true);
    expect(filterMatches(f('is', 'yes'), false, 'checkbox')).toBe(false);
    expect(filterMatches(f('is', 'no'), null, 'checkbox')).toBe(true);
  });
});

describe('filterIsComplete', () => {
  it('needs an operator that fits and the values it asks for', () => {
    expect(filterIsComplete(f('contains', 'x'), 'text')).toBe(true);
    expect(filterIsComplete(f('contains', ''), 'text')).toBe(false);
    expect(filterIsComplete(f('is_empty'), 'text')).toBe(true);
    expect(filterIsComplete(f('between', '1'), 'number')).toBe(false);
    expect(filterIsComplete(f('between', '1', '2'), 'number')).toBe(true);
    expect(filterIsComplete(f('greater', '1'), 'text')).toBe(false);
  });
});
