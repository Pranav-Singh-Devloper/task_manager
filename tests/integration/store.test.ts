import { describe, expect, it } from 'vitest';
import { FIELD_HEADERS, SYSTEM_COLUMNS, fieldToRow } from '../../shared/schema';
import { fixture } from './store-helpers';

describe('loading and caching', () => {
  it('loads every category from the demo database', async () => {
    const f = await fixture();
    const snap = await f.store.snapshot();
    expect(snap.config.problems).toEqual([]);
    expect(snap.categories.size).toBe(11);
    expect(snap.categories.get('ccie')?.entries.size).toBe(4);
    const one = [...snap.categories.get('ccie')!.entries.values()][0]!;
    expect(one.record.values.case_id).toBe('C-101');
    expect(one.row).toBe(2);
  });

  it('a load is two Sheets calls however many tabs there are', async () => {
    const f = await fixture();
    f.resetCalls();
    await f.store.snapshot();
    expect(f.calls()).toBe(2); // getTabs + one batchGet
  });

  it('reuses the copy for 30 seconds, then reloads', async () => {
    const f = await fixture();
    await f.store.snapshot();
    f.resetCalls();
    await f.store.snapshot();
    f.clock.advance(29_000);
    await f.store.snapshot();
    expect(f.calls()).toBe(0);
    f.clock.advance(2_000);
    await f.store.snapshot();
    expect(f.calls()).toBe(2);
  });

  it('Refresh forces a reload, and callers at the same moment share one load', async () => {
    const f = await fixture();
    await f.store.snapshot();
    f.resetCalls();
    await Promise.all([f.store.refresh(), f.store.refresh(), f.store.refresh()]);
    expect(f.calls()).toBe(2);
  });

  it('never reads once per request: a hundred reads cost nothing', async () => {
    const f = await fixture();
    await f.store.snapshot();
    f.resetCalls();
    for (let i = 0; i < 100; i += 1) await f.store.snapshot();
    expect(f.calls()).toBe(0);
  });

  it('does not cache the log tabs', async () => {
    const f = await fixture();
    const snap = await f.store.snapshot();
    const titles = new Set(snap.tabs.filter((t) => snap.raw.has(t.gid)).map((t) => t.title));
    expect(titles.has('_audit')).toBe(false);
    expect(titles.has('_reschedules')).toBe(false);
    expect(titles.has('_system')).toBe(false);
    expect(titles.has('CCIE')).toBe(true);
  });
});

describe('the Sheet header follows the config', () => {
  it('a field added to _fields appears as a new column on the next load, without touching other columns', async () => {
    const f = await fixture();
    await f.store.snapshot();
    const before = (await f.tab('Others')).headers;
    const fields = await f.tab('_fields');
    const row = fieldToRow({
      category_slug: 'others',
      key: 'venue',
      label: 'Venue',
      type: 'text',
      required: false,
      options: [],
      allow_new_options: false,
      default_value: '',
      help_text: '',
      placeholder: '',
      unit: '',
      order: 100,
      show_in_form: true,
      show_in_table: false,
      searchable: true,
      case_key: false,
      computed_expr: '',
      locked: false,
      archived: false,
      created_at: '',
    });
    await f.mock.services.sheets.appendRows(f.spreadsheetId, fields.gid, [row]);
    await f.store.refresh();

    const after = (await f.tab('Others')).headers;
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toContain('venue');
    expect(after.indexOf('venue')).toBe(before.length);
    expect(
      (await f.store.snapshot()).config.byCategory
        .get('others')
        ?.fields.some((x) => x.key === 'venue'),
    ).toBe(true);
  });

  it('a second load adds nothing again', async () => {
    const f = await fixture();
    await f.store.refresh();
    const once = (await f.tab('Others')).headers;
    await f.store.refresh();
    expect((await f.tab('Others')).headers).toEqual(once);
  });

  it('restores a system column that was deleted by hand', async () => {
    const f = await fixture();
    const others = await f.tab('Others');
    const trimmed = others.headers.filter((h) => h !== 'rev');
    await f.mock.services.sheets.updateRow(f.spreadsheetId, others.gid, 1, [...trimmed, '']);
    await f.store.refresh();
    expect((await f.tab('Others')).headers).toContain('rev');
  });

  it('keeps a column the owner added by hand, and still reads rows', async () => {
    const f = await fixture();
    const others = await f.tab('Others');
    await f.mock.services.sheets.updateRow(f.spreadsheetId, others.gid, 1, [
      ...others.headers,
      'My own notes',
    ]);
    await f.store.refresh();
    expect((await f.tab('Others')).headers).toContain('My own notes');
    expect((await f.store.snapshot()).categories.get('others')!.entries.size).toBe(1);
  });
});

describe('rows typed straight into the Sheet are adopted', () => {
  async function typeRow(
    f: Awaited<ReturnType<typeof fixture>>,
    tab: string,
    cells: Record<string, string | number>,
  ) {
    const t = await f.tab(tab);
    await f.mock.services.sheets.appendRows(f.spreadsheetId, t.gid, [
      t.headers.map((h) => cells[h] ?? ''),
    ]);
  }

  it('gives a hand-typed row an id, rev, number and creator, and writes them back', async () => {
    const f = await fixture();
    await typeRow(f, 'Others', {
      date: '20/11/2026',
      start_time: '3:30 PM',
      topic: 'Typed by hand',
    });
    await f.store.refresh();

    const others = await f.tab('Others');
    const row = others.rows[others.rows.length - 1]!;
    const at = (k: string) => row[others.headers.indexOf(k)];
    expect(String(at('id'))).toMatch(/^[0-9A-Z]{26}$/);
    expect(at('rev')).toBe(1);
    expect(at('created_by')).toBe('sheet');
    expect(at('sr_no')).toBe(2);
    expect(at('date')).toBe('2026-11-20');
    expect(at('start_time')).toBe('15:30');
    expect(at('meeting_status')).toBe('Scheduled');
    expect(at('workspace')).toBe('nhai');
    expect(['pending', 'none']).toContain(at('calendar_sync'));
    expect((await f.store.snapshot()).categories.get('others')!.entries.size).toBe(2);
  });

  it('adopts a row once, not on every load', async () => {
    const f = await fixture();
    await typeRow(f, 'Others', { date: '20/11/2026', start_time: '10:00', topic: 'Once' });
    await f.store.refresh();
    const id = (await f.tab('Others')).rows[2]![(await f.tab('Others')).headers.indexOf('id')];
    await f.store.refresh();
    await f.store.refresh();
    const t = await f.tab('Others');
    expect(t.rows).toHaveLength(3);
    expect(t.rows[2]![t.headers.indexOf('id')]).toBe(id);
    expect(t.rows[2]![t.headers.indexOf('rev')]).toBe(1);
  });

  it('records the adoption in the change log with source "sheet"', async () => {
    const f = await fixture();
    await typeRow(f, 'Others', { date: '20/11/2026', start_time: '10:00', topic: 'Logged' });
    await f.store.refresh();
    const t = await f.tab('Others');
    const id = String(t.rows[2]![t.headers.indexOf('id')]);
    const audit = await f.tab('_audit');
    const entry = audit.rows.slice(1).find((r) => r[audit.headers.indexOf('row_id')] === id)!;
    expect(entry[audit.headers.indexOf('action')]).toBe('create');
    expect(entry[audit.headers.indexOf('source')]).toBe('sheet');
    expect(entry[audit.headers.indexOf('table')]).toBe('Others');
    expect(entry[audit.headers.indexOf('user_email')]).toBe('sheet');
  });

  it('numbers adopted rows after the highest number, even one that was deleted', async () => {
    const f = await fixture();
    await typeRow(f, 'Court Case', { date: '01/12/2026', start_time: '10:00', topic: 'A' });
    await typeRow(f, 'Court Case', { date: '02/12/2026', start_time: '10:00', topic: 'B' });
    await f.store.refresh();
    const t = await f.tab('Court Case');
    const sr = t.headers.indexOf('sr_no');
    const nums = t.rows.slice(1).map((r) => r[sr]);
    expect(new Set(nums).size).toBe(nums.length); // all different
    expect(Math.max(...nums.map(Number))).toBe(nums.length);
  });

  it('does not adopt a row with no readable date, and explains why', async () => {
    const f = await fixture();
    await typeRow(f, 'Others', { date: 'next week', topic: 'Vague' });
    const snap = await f.store.refresh();
    expect(snap.categories.get('others')!.entries.size).toBe(1);
    expect(
      snap.categories
        .get('others')!
        .attention.map((a) => a.message)
        .join(' '),
    ).toMatch(/Row 3 has no readable date/);
    const t = await f.tab('Others');
    expect(t.rows[2]![t.headers.indexOf('id')] ?? '').toBe('');
  });

  it('ignores blank rows', async () => {
    const f = await fixture();
    const t = await f.tab('Others');
    await f.mock.services.sheets.appendRows(f.spreadsheetId, t.gid, [[''], ['', '']]);
    const snap = await f.store.refresh();
    expect(snap.categories.get('others')!.attention).toEqual([]);
  });

  it('gives a copied row a fresh id so two meetings never share one', async () => {
    const f = await fixture();
    const t = await f.tab('Others');
    const original = t.rows[1]!;
    await f.mock.services.sheets.appendRows(f.spreadsheetId, t.gid, [[...original]]);
    await f.store.refresh();
    const after = await f.tab('Others');
    const idCol = after.headers.indexOf('id');
    const ids = after.rows.slice(1).map((r) => r[idCol]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe(original[idCol]);
  });

  it('reports a cell it cannot read, without failing the load', async () => {
    const f = await fixture();
    const t = await f.tab('Others');
    const row = [...t.rows[1]!];
    row[t.headers.indexOf('start_time')] = 'noon-ish';
    await f.mock.services.sheets.updateRow(f.spreadsheetId, t.gid, 2, row);
    const snap = await f.store.refresh();
    expect(snap.categories.get('others')!.attention.map((a) => a.message)).toEqual([
      'Row 2: Time: "noon-ish" is not a time.',
    ]);
    expect(snap.categories.get('others')!.entries.size).toBe(1);
  });
});

describe('dates changed directly in the Sheet', () => {
  it('count as a reschedule: logged with source "sheet", status Rescheduled, rev up by one', async () => {
    const f = await fixture();
    await f.store.snapshot();
    const t = await f.tab('Others');
    const row = [...t.rows[1]!];
    const id = String(row[t.headers.indexOf('id')]);
    const oldDate = String(row[t.headers.indexOf('date')]);
    row[t.headers.indexOf('date')] = '2031-05-06';
    await f.mock.services.sheets.updateRow(f.spreadsheetId, t.gid, 2, row);
    f.clock.advance(60_000);
    await f.store.refresh();

    const after = await f.tab('Others');
    const r = after.rows[1]!;
    expect(r[after.headers.indexOf('meeting_status')]).toBe('Rescheduled');
    expect(r[after.headers.indexOf('rev')]).toBe(2);
    expect(r[after.headers.indexOf('calendar_sync')]).toBe('pending');

    const log = await f.tab('_reschedules');
    const entry = log.rows.slice(1).find((x) => x[log.headers.indexOf('meeting_id')] === id)!;
    expect(entry[log.headers.indexOf('old_date')]).toBe(oldDate);
    expect(entry[log.headers.indexOf('new_date')]).toBe('2031-05-06');
    expect(entry[log.headers.indexOf('source')]).toBe('sheet');
  });

  it('are noticed once, not on every later load', async () => {
    const f = await fixture();
    await f.store.snapshot();
    const before = (await f.tab('_reschedules')).rows.length;
    const t = await f.tab('Others');
    const row = [...t.rows[1]!];
    row[t.headers.indexOf('start_time')] = '09:00';
    row[t.headers.indexOf('end_time')] = '10:00';
    await f.mock.services.sheets.updateRow(f.spreadsheetId, t.gid, 2, row);
    await f.store.refresh();
    await f.store.refresh();
    await f.store.refresh();
    expect((await f.tab('_reschedules')).rows.length).toBe(before + 1);
  });

  it('a change to other columns is not a reschedule', async () => {
    const f = await fixture();
    await f.store.snapshot();
    const before = (await f.tab('_reschedules')).rows.length;
    const t = await f.tab('Others');
    const row = [...t.rows[1]!];
    row[t.headers.indexOf('remarks')] = 'edited by hand';
    await f.mock.services.sheets.updateRow(f.spreadsheetId, t.gid, 2, row);
    await f.store.refresh();
    expect((await f.tab('_reschedules')).rows.length).toBe(before);
  });
});

describe('the owner sorts or edits the Sheet', () => {
  it('reindexTab finds rows again after the tab was re-ordered', async () => {
    const f = await fixture();
    const snap = await f.store.snapshot();
    const ccie = snap.categories.get('ccie')!;
    const [firstId, first] = [...ccie.entries.entries()][0]!;
    expect(first.row).toBe(2);

    const t = await f.tab('CCIE');
    const reversed = [t.rows[0]!, ...t.rows.slice(1).reverse()];
    await f.mock.services.sheets.updateRows(f.spreadsheetId, t.gid, 1, reversed);
    await f.store.reindexTab('ccie');

    const again = (await f.store.snapshot()).categories.get('ccie')!;
    expect(again.entries.get(firstId)!.row).toBe(5);
    expect(again.entries.size).toBe(4);
  });
});

describe('count_same groups', () => {
  it('counts meetings that share a value, once per cache version', async () => {
    const f = await fixture();
    await f.store.snapshot();
    expect(f.store.countSame('ccie', 'case_id', 'C-101')).toBe(3);
    expect(f.store.countSame('ccie', 'case_id', 'C-102')).toBe(1);
    expect(f.store.countSame('ccie', 'case_id', 'C-999')).toBe(0);
    expect(f.store.countSame('ccie', 'case_id', null)).toBe(0);
  });
});

describe('config columns are read with the field headers', () => {
  it('has the headers the seed promises', () => {
    expect(FIELD_HEADERS).toContain('computed_expr');
    expect(SYSTEM_COLUMNS).toContain('previous_id');
  });
});
