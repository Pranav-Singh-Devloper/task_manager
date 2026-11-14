import { describe, expect, it } from 'vitest';
import {
  FormulaError,
  checkFormula,
  daysBetween,
  evaluateFormula,
  monthsBetween,
  parseFormula,
  type EvalContext,
  type Value,
} from '../../shared/formula';

const ctx = (
  row: Record<string, Value> = {},
  counts: Record<string, number> = {},
): EvalContext => ({
  get: (k) => row[k] ?? null,
  today: () => '2026-11-14',
  now: () => '2026-11-14T10:00:00',
  countSame: (k) => counts[k] ?? 0,
});
const run = (src: string, row: Record<string, Value> = {}, counts: Record<string, number> = {}) =>
  evaluateFormula(src, ctx(row, counts));

describe('arithmetic and precedence', () => {
  it('follows the usual order', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('10 - 4 - 3')).toBe(3);
    expect(run('2 * 3 + 4 * 5')).toBe(26);
    expect(run('-2 + 5')).toBe(3);
    expect(run('8 / 2 / 2')).toBe(2);
  });
  it('uses field values', () => {
    expect(run('civil_cost + total_cost', { civil_cost: 1280, total_cost: 1710 })).toBe(2990);
  });
  it('gives nothing, not a crash, for missing values or division by zero', () => {
    expect(run('a + 1', { a: null })).toBeNull();
    expect(run('1 / 0')).toBeNull();
    expect(run("'x' + 1")).toBeNull();
  });
});

describe('comparisons and logic', () => {
  it('compares numbers, text and dates', () => {
    expect(run('3 > 2')).toBe(true);
    expect(run('3 <= 2')).toBe(false);
    expect(run("status = 'Open'", { status: 'Open' })).toBe(true);
    expect(run("status != 'Open'", { status: 'Done' })).toBe(true);
    expect(run("d < '2026-12-01'", { d: '2026-11-17' })).toBe(true);
    expect(run('a == b', { a: null, b: '' })).toBe(true);
  });
  it('supports and, or, not with the right priority', () => {
    expect(run('true or false and false')).toBe(true);
    expect(run('not false and true')).toBe(true);
    expect(run('not (1 > 2)')).toBe(true);
    expect(run('1 > 2 or 2 > 1')).toBe(true);
  });
  it('and / or short-circuit', () => {
    expect(run('false and (1 / 0 > 1)')).toBe(false);
  });
});

describe('functions', () => {
  it('today() and now() come from the context, not the server clock', () => {
    expect(run('today()')).toBe('2026-11-14');
    expect(run('now()')).toBe('2026-11-14T10:00:00');
  });
  it('coalesce takes the first value that is filled in', () => {
    expect(run('coalesce(a, b, 3)', { a: null, b: '' })).toBe(3);
    expect(run('coalesce(a, b)', { a: 'x', b: 'y' })).toBe('x');
    expect(run('coalesce(a, b)')).toBeNull();
  });
  it('if is lazy', () => {
    expect(run('if(1 > 2, 1 / 0, 5)')).toBe(5);
    expect(run("if(x = 'a', 'yes', 'no')", { x: 'a' })).toBe('yes');
  });
  it('concat, upper, lower', () => {
    expect(run("concat('NH-', n, ' ', upper(s))", { n: 44, s: 'ab' })).toBe('NH-44 AB');
    expect(run('lower(s)', { s: 'ABC' })).toBe('abc');
    expect(run('upper(s)', {})).toBeNull();
  });
  it('round', () => {
    expect(run('round(2.5)')).toBe(3);
    expect(run('round(3.14159, 2)')).toBe(3.14);
    expect(run('round(1.005, 2)')).toBe(1.01);
  });
  it('count_same uses the group count from the context', () => {
    expect(run('count_same(case_id)', { case_id: 'C-101' }, { case_id: 3 })).toBe(3);
  });
});

describe('months_between and days_between', () => {
  it('counts whole months, rounded down', () => {
    expect(monthsBetween('2025-02-10', '2026-11-14')).toBe(21);
    expect(monthsBetween('2025-02-10', '2026-11-09')).toBe(20);
    expect(monthsBetween('2025-01-31', '2025-02-28')).toBe(0);
    expect(monthsBetween('2025-01-15', '2025-01-15')).toBe(0);
  });
  it('is negative when the second date is earlier', () => {
    expect(monthsBetween('2026-11-14', '2025-02-10')).toBe(-21);
  });
  it('gives nothing for missing or invalid dates', () => {
    expect(monthsBetween(null, '2026-01-01')).toBeNull();
    expect(monthsBetween('2026-02-30', '2026-03-01')).toBeNull();
    expect(monthsBetween('nonsense', '2026-03-01')).toBeNull();
  });
  it('counts days', () => {
    expect(daysBetween('2026-11-14', '2026-11-17')).toBe(3);
    expect(daysBetween('2026-11-17', '2026-11-14')).toBe(-3);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });
});

describe('the formulas from the spec', () => {
  const pendency =
    'months_between(date_of_initiation, coalesce(date_of_final_settlement_agreement, today()))';
  it('pendency runs to today while there is no settlement', () => {
    expect(run(pendency, { date_of_initiation: '2025-02-10' })).toBe(21);
  });
  it('pendency stops at the settlement date', () => {
    expect(
      run(pendency, {
        date_of_initiation: '2025-02-10',
        date_of_final_settlement_agreement: '2025-12-10',
      }),
    ).toBe(10);
  });
  it('pendency is blank when there is no start date', () => {
    expect(run(pendency, {})).toBeNull();
  });
});

describe('parsing errors are plain words', () => {
  const bad = (src: string) => {
    expect(() => parseFormula(src)).toThrow(FormulaError);
    try {
      parseFormula(src);
    } catch (e) {
      return (e as Error).message;
    }
    return '';
  };
  it('explains what is wrong', () => {
    expect(bad('')).toMatch(/empty/);
    expect(bad('1 +')).toMatch(/ends too soon/);
    expect(bad('(1 + 2')).toMatch(/closing bracket/);
    expect(bad("'abc")).toMatch(/closing quote/);
    expect(bad('1 $ 2')).toMatch(/not allowed/);
    expect(bad('1 2')).toMatch(/Unexpected/);
    expect(bad('f(1,')).toMatch(/ends too soon/);
  });
  it('evaluateFormula never throws on a bad formula', () => {
    expect(run('1 +')).toBeNull();
  });
});

describe('checkFormula', () => {
  const keys = new Set(['case_id', 'date_of_initiation', 'date_of_final_settlement_agreement']);
  it('accepts the formulas from the spec', () => {
    expect(checkFormula('count_same(case_id)', keys)).toBeNull();
    expect(
      checkFormula(
        'months_between(date_of_initiation, coalesce(date_of_final_settlement_agreement, today()))',
        keys,
      ),
    ).toBeNull();
  });
  it('rejects an unknown column', () => {
    expect(checkFormula('months_between(starts, today())', keys)).toMatch(
      /"starts" is not a column/,
    );
  });
  it('rejects an unknown function and a wrong number of values', () => {
    expect(checkFormula('magic(1)', keys)).toMatch(/not a known function/);
    expect(checkFormula('round()', keys)).toMatch(/takes 1 to 2/);
    expect(checkFormula('today(1)', keys)).toMatch(/takes 0/);
  });
  it('count_same needs a column name', () => {
    expect(checkFormula('count_same(1)', keys)).toMatch(/column name/);
  });
  it('reports a syntax problem', () => {
    expect(checkFormula('1 +', keys)).toMatch(/ends too soon/);
  });
});

describe('safety', () => {
  it('has no way to run code', () => {
    expect(() => parseFormula('constructor.constructor("return 1")()')).toThrow(FormulaError);
    expect(run('process', {})).toBeNull();
    expect(run('globalThis', {})).toBeNull();
  });
});
