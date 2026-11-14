import { describe, expect, it } from 'vitest';
import { buildSeedConfig } from '../../shared/seed';
import {
  CATEGORY_HEADERS,
  FIELD_HEADERS,
  WORKSPACE_HEADERS,
  SETTINGS_HEADERS,
  categoryToRow,
  fieldToRow,
  workspaceToRow,
} from '../../shared/schema';
import type { Cell } from '../../shared/types';
import { buildConfig, type ConfigRows } from '../../server/services/config';
import type { TabInfo } from '../../server/services/google/types';

function seeded(mutate?: (rows: ConfigRows) => void) {
  const seed = buildSeedConfig('2026-11-14T00:00:00.000Z');
  seed.categories.forEach((c, i) => {
    c.sheet_gid = i;
  });
  const tabs: TabInfo[] = seed.categories.map((c, i) => ({
    gid: i,
    title: seed.tabTitles[c.slug]!,
    rowCount: 1000,
    columnCount: 40,
  }));
  const rows: ConfigRows = {
    workspaces: [[...WORKSPACE_HEADERS], ...seed.workspaces.map(workspaceToRow)],
    categories: [[...CATEGORY_HEADERS], ...seed.categories.map(categoryToRow)],
    fields: [[...FIELD_HEADERS], ...seed.fields.map(fieldToRow)],
    settings: [
      [...SETTINGS_HEADERS],
      ...Object.entries(seed.settings).map(([k, v]): Cell[] => [k, v]),
    ],
  };
  mutate?.(rows);
  return { config: buildConfig(rows, tabs), seed, rows, tabs };
}

describe('buildConfig', () => {
  it('accepts the seed with no problems', () => {
    const { config } = seeded();
    expect(config.problems).toEqual([]);
    expect(config.categories).toHaveLength(11);
    expect(config.byCategory.get('ccie')?.tab.title).toBe('CCIE');
    expect(
      config.byCategory
        .get('ccie')
        ?.fields.map((f) => f.key)
        .slice(0, 3),
    ).toEqual(['sr_no', 'date', 'start_time']);
  });

  it('skips a field with an unknown type and says so', () => {
    const { config } = seeded((r) => r.fields.push(['ccie', 'oops', 'Oops', 'not_a_type']));
    expect(config.problems.join('\n')).toMatch(/unknown type "not_a_type"/);
    expect(config.fields.some((f) => f.key === 'oops')).toBe(false);
  });

  it('skips a field with bad options JSON', () => {
    const { config } = seeded((r) =>
      r.fields.push(['ccie', 'bad', 'Bad', 'select', 'FALSE', '[nope']),
    );
    expect(config.problems.join('\n')).toMatch(/not a valid list/);
    expect(config.fields.some((f) => f.key === 'bad')).toBe(false);
  });

  it('skips a duplicate key and keeps the first', () => {
    const { config } = seeded((r) => r.fields.push(['ccie', 'case_id', 'Another Case Id', 'text']));
    expect(config.problems.join('\n')).toMatch(/repeats a field/);
    expect(config.fields.find((f) => f.key === 'case_id')?.label).toBe('Case Id');
  });

  it('skips a key that is not lower-case snake_case', () => {
    const { config } = seeded((r) => r.fields.push(['ccie', 'Bad Key', 'Bad key', 'text']));
    expect(config.problems.join('\n')).toMatch(/key "Bad Key" that is not allowed/);
  });

  it('skips a calculated column whose formula does not work, and explains why', () => {
    const { config } = seeded((r) => {
      r.fields.push([
        'ccie',
        'broken',
        'Broken',
        'computed',
        'FALSE',
        '',
        'FALSE',
        '',
        '',
        '',
        '',
        900,
        'TRUE',
        'FALSE',
        'FALSE',
        'FALSE',
        'months_between(nope, today())',
      ]);
      r.fields.push([
        'ccie',
        'syntax',
        'Syntax',
        'computed',
        'FALSE',
        '',
        'FALSE',
        '',
        '',
        '',
        '',
        901,
        'TRUE',
        'FALSE',
        'FALSE',
        'FALSE',
        '1 +',
      ]);
      r.fields.push(['ccie', 'empty', 'Empty', 'computed']);
    });
    const text = config.problems.join('\n');
    expect(text).toMatch(/formula for "Broken".*"nope" is not a column/);
    expect(text).toMatch(/formula for "Syntax".*ends too soon/);
    expect(text).toMatch(/"Empty" has no formula/);
    expect(config.fields.some((f) => ['broken', 'syntax', 'empty'].includes(f.key))).toBe(false);
  });

  it('does not let a formula use another calculated column', () => {
    const { config } = seeded((r) =>
      r.fields.push([
        'ccie',
        'loop',
        'Loop',
        'computed',
        'FALSE',
        '',
        'FALSE',
        '',
        '',
        '',
        '',
        902,
        'TRUE',
        'FALSE',
        'FALSE',
        'FALSE',
        'pendency_months + 1',
      ]),
    );
    expect(config.problems.join('\n')).toMatch(
      /"pendency_months" is not a column that can be used/,
    );
  });

  it('hides a category whose tab was deleted', () => {
    const { config } = seeded((r) => {
      const row = r.categories.find((c) => c[0] === 'morth')!;
      row[7] = 999;
    });
    expect(config.problems.join('\n')).toMatch(/"MORTH" points to a tab that no longer exists/);
    expect(config.byCategory.has('morth')).toBe(false);
    expect(config.categories).toHaveLength(10);
  });

  it('hides a category that lost a core column', () => {
    const { config } = seeded((r) => {
      r.fields = r.fields.filter((f, i) => i === 0 || !(f[0] === 'pmg' && f[1] === 'start_time'));
    });
    expect(config.problems.join('\n')).toMatch(
      /"PMG" is missing the required column\(s\) start_time/,
    );
    expect(config.byCategory.has('pmg')).toBe(false);
  });

  it('falls back when a category names an unknown default workspace', () => {
    const { config } = seeded((r) => {
      r.categories.find((c) => c[0] === 'ccie')![5] = 'ghost';
    });
    expect(config.problems.join('\n')).toMatch(/unknown default workspace/);
    expect(config.byCategory.get('ccie')?.category.default_workspace).toBe('nhai');
  });

  it('warns about a title template that uses a missing column', () => {
    const { config } = seeded((r) => {
      r.categories.find((c) => c[0] === 'ccie')![6] = 'CCIE — {nothing}';
    });
    expect(config.problems.join('\n')).toMatch(/uses "nothing"/);
  });

  it('ignores fields of a category that does not exist', () => {
    const { config } = seeded((r) => r.fields.push(['ghost', 'x', 'X', 'text']));
    expect(config.problems.join('\n')).toMatch(/category "ghost", which does not exist/);
  });

  it('hand-edited booleans and orders are read leniently', () => {
    const { config } = seeded((r) => {
      const f = r.fields.find((x) => x[0] === 'ccie' && x[1] === 'upc')!;
      f[4] = 'true'; // required, typed in lower case
      f[11] = '5'; // order typed as text
    });
    const upc = config.fields.find((f) => f.key === 'upc' && f.category_slug === 'ccie')!;
    expect(upc.required).toBe(true);
    expect(upc.order).toBe(5);
  });
});
