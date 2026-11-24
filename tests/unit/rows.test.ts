import { describe, expect, it } from 'vitest';
import { buildSeedConfig } from '../../shared/seed';
import { SYSTEM_COLUMNS, categoryTabHeaders } from '../../shared/schema';
import type { Cell } from '../../shared/types';
import { headingKeys, parseRow, serializeRow } from '../../server/services/rows';

const seed = buildSeedConfig('2026-11-14T00:00:00.000Z');
const fields = seed.fields.filter((f) => f.category_slug === 'ccie');
const headers = categoryTabHeaders(fields);
const system = (over = {}) => ({
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  rev: 1,
  created_at: 'c',
  updated_at: 'u',
  created_by: 'me',
  deleted_at: '',
  calendar_event_id: '',
  calendar_sync: 'ok' as const,
  previous_id: '',
  series_id: '',
  awaiting_next: false,
  ...over,
});

function row(obj: Record<string, Cell>): Cell[] {
  return headers.map((h) => obj[h] ?? '');
}

describe('parseRow', () => {
  it('reads a clean row by column name', () => {
    const r = parseRow(
      headers,
      row({
        id: 'X',
        rev: 3,
        date: '2026-11-17',
        start_time: '10:30',
        case_id: 'C-101',
        project_name: 'NH-44',
        state: 'Kerala',
        calendar_sync: 'ok',
      }),
      fields,
    );
    expect(r.values).toMatchObject({
      date: '2026-11-17',
      start_time: '10:30',
      case_id: 'C-101',
      state: 'Kerala',
    });
    expect(r.system).toMatchObject({ id: 'X', rev: 3, calendar_sync: 'ok' });
    expect(r.problems).toEqual([]);
  });

  it('copes with a short row and with extra cells', () => {
    const short = parseRow(headers, ['1', '2026-11-17'], fields);
    expect(short.values.date).toBe('2026-11-17');
    expect(short.values.topic).toBeNull();
    const long = parseRow(headers, [...row({ date: '2026-11-17' }), 'stray', 'cells'], fields);
    expect(long.values.date).toBe('2026-11-17');
  });

  it('reads columns that have been moved around', () => {
    const shuffled = [...headers].reverse();
    const data: Record<string, Cell> = { date: '2026-11-17', case_id: 'C-9' };
    const r = parseRow(
      shuffled,
      shuffled.map((h) => data[h] ?? ''),
      fields,
    );
    expect(r.values).toMatchObject({ date: '2026-11-17', case_id: 'C-9' });
  });

  it('reads dates and times people typed, and numbers from the Sheet', () => {
    const r = parseRow(
      headers,
      row({ date: '17/11/2026', start_time: '2:30 PM', date_of_initiation: 45000 }),
      fields,
    );
    expect(r.values).toMatchObject({
      date: '2026-11-17',
      start_time: '14:30',
      date_of_initiation: '2023-03-15',
    });
    expect(r.problems).toEqual([]);
  });

  it('marks a cell it cannot read instead of failing', () => {
    const r = parseRow(
      headers,
      row({ date: '31/02/2026', start_time: 'noon', case_id: 'C-1' }),
      fields,
    );
    expect(r.values.date).toBeNull();
    expect(r.values.case_id).toBe('C-1');
    expect(r.problems).toEqual([
      'Date: "31/02/2026" is not a date.',
      'Time: "noon" is not a time.',
    ]);
  });

  it('ignores a rev or calendar_sync it cannot understand', () => {
    const r = parseRow(headers, row({ rev: 'abc', calendar_sync: 'weird' }), fields);
    expect(r.system.rev).toBe(0);
    expect(r.system.calendar_sync).toBe('');
  });

  it('does not read computed columns', () => {
    const r = parseRow(headers, row({ pendency_months: 99 }), fields);
    expect(r.values).not.toHaveProperty('pendency_months');
  });

  it('reads checkboxes and multi-selects', () => {
    const f = [
      { ...fields[0]!, key: 'ok', label: 'Ok', type: 'checkbox' as const },
      { ...fields[0]!, key: 'tags', label: 'Tags', type: 'multi_select' as const },
    ];
    const r = parseRow(['ok', 'tags'], ['TRUE', 'A, B ,C'], f);
    expect(r.values).toEqual({ ok: true, tags: ['A', 'B', 'C'] });
  });
});

describe('serializeRow', () => {
  const values = {
    date: '2026-11-17',
    start_time: '10:30',
    case_id: 'C-101',
    project_name: 'NH-44',
    state: 'Kerala',
  };

  it('writes values by column and system columns by name', () => {
    const out = serializeRow(headers, [], values, system(), fields);
    const at = (k: string) => out[headers.indexOf(k)];
    expect(at('date')).toBe('2026-11-17');
    expect(at('case_id')).toBe('C-101');
    expect(at('id')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(at('rev')).toBe(1);
    expect(at('calendar_sync')).toBe('ok');
  });

  it('keeps columns the owner added by hand', () => {
    const wide = [...headers, 'My own notes'];
    const base = [...row({}), 'keep me'];
    const out = serializeRow(wide, base, values, system(), fields);
    expect(out[wide.indexOf('My own notes')]).toBe('keep me');
  });

  it('works when columns have been re-ordered', () => {
    const shuffled = [...headers].reverse();
    const out = serializeRow(shuffled, [], values, system(), fields);
    expect(out[shuffled.indexOf('case_id')]).toBe('C-101');
    expect(out[shuffled.indexOf('id')]).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('leaves computed columns blank, writes booleans and lists as text, and clears removed values', () => {
    const f = [
      ...fields,
      { ...fields[0]!, key: 'flag', label: 'Flag', type: 'checkbox' as const },
      { ...fields[0]!, key: 'tags', label: 'Tags', type: 'multi_select' as const },
    ];
    const h = categoryTabHeaders(f);
    const out = serializeRow(
      h,
      h.map(() => 'old'),
      { ...values, flag: true, tags: ['A', 'B'], topic: null },
      system(),
      f,
    );
    expect(out[h.indexOf('pendency_months')]).toBe('');
    expect(out[h.indexOf('flag')]).toBe('TRUE');
    expect(out[h.indexOf('tags')]).toBe('A, B');
    expect(out[h.indexOf('topic')]).toBe('');
  });

  it('round-trips', () => {
    const out = serializeRow(headers, [], values, system({ rev: 7 }), fields);
    const back = parseRow(headers, out, fields);
    expect(back.values).toMatchObject(values);
    expect(back.system.rev).toBe(7);
  });

  it('has a column for every system field', () => {
    for (const c of SYSTEM_COLUMNS) expect(headers).toContain(c);
  });
});

describe('headings retyped in the Sheet', () => {
  it('still finds a column by its key or its name, whatever the capitals and spacing', () => {
    const raw = headers.map((h) =>
      h === 'case_id' ? 'CASE ID' : h === 'project_name' ? 'Project name ' : h,
    );
    expect(headingKeys(raw, fields)).toEqual(headers);
    const label = fields.find((f) => f.key === 'project_name')!.label;
    expect(headingKeys([label.toUpperCase()], fields)).toEqual(['project_name']);
  });

  it('prefers a heading that is exactly the key, and leaves headings it does not know alone', () => {
    expect(headingKeys(['Case_Id', 'case_id', 'My notes', ''], fields)).toEqual([
      'Case_Id',
      'case_id',
      'My notes',
      '',
    ]);
  });
});
