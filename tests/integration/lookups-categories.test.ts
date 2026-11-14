import { describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { CATEGORY_PALETTE } from '../../shared/seed';
import { slugFor, createCategory } from '../../server/services/categories';
import { MeetingService, type Actor } from '../../server/services/meetings';
import { UndoService } from '../../server/services/undo';
import { fixture } from './store-helpers';

const dad: Actor = { email: 'dad@example.com', source: 'app' };

async function setup() {
  const f = await fixture();
  const meetings = new MeetingService(f.store, new UndoService(() => f.clock.now));
  return { f, meetings };
}
const ccie = (over: Record<string, unknown> = {}) => ({
  date: '2026-12-01',
  start_time: '10:30',
  case_id: 'C-1',
  project_name: 'NH-1',
  ...over,
});
const make = (m: MeetingService, values: Record<string, unknown>, category = 'ccie') =>
  m.create({ id: newId(), category, values }, dad);

async function optionsOf(f: Awaited<ReturnType<typeof fixture>>, category: string, key: string) {
  const snap = await f.store.snapshot();
  return snap.config.byCategory.get(category)!.fields.find((x) => x.key === key)!.options;
}
async function lookupRows(f: Awaited<ReturnType<typeof fixture>>) {
  const t = await f.tab('_lookups');
  return t.rows.slice(1).map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r[i]])));
}

describe('dropdowns that learn', () => {
  it('a new value typed into a learning dropdown is added to its list, in the Sheet', async () => {
    const { f, meetings } = await setup();
    expect(await optionsOf(f, 'ccie', 'piu')).toEqual([]);
    await make(meetings, ccie({ piu: 'PIU Gwalior' }));
    expect(await optionsOf(f, 'ccie', 'piu')).toEqual(['PIU Gwalior']);

    const fields = await f.tab('_fields');
    const row = fields.rows.find((r) => r[0] === 'ccie' && r[1] === 'piu')!;
    expect(JSON.parse(String(row[fields.headers.indexOf('options')]))).toEqual(['PIU Gwalior']);
  });

  it('counts each use, and does not add the same value twice', async () => {
    const { f, meetings } = await setup();
    await make(meetings, ccie({ piu: 'PIU Gwalior' }));
    await make(meetings, ccie({ piu: 'PIU Gwalior' }));
    await make(meetings, ccie({ piu: 'piu gwalior' })); // another spelling of the same value
    expect(await optionsOf(f, 'ccie', 'piu')).toEqual(['PIU Gwalior']);
    const rows = (await lookupRows(f)).filter((r) => r.field_key === 'piu');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category_slug: 'ccie', value: 'PIU Gwalior', count: 3 });
    expect(String(rows[0]!.last_used)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('the most-used values float to the top', async () => {
    const { f, meetings } = await setup();
    await make(meetings, ccie({ contractor: 'Alpha Ltd' }));
    await make(meetings, ccie({ contractor: 'Beta Ltd' }));
    await make(meetings, ccie({ contractor: 'Beta Ltd' }));
    await make(meetings, ccie({ contractor: 'Beta Ltd' }));
    await make(meetings, ccie({ contractor: 'Gamma Ltd' }));
    await make(meetings, ccie({ contractor: 'Gamma Ltd' }));
    expect(await optionsOf(f, 'ccie', 'contractor')).toEqual([
      'Beta Ltd',
      'Gamma Ltd',
      'Alpha Ltd',
    ]);
  });

  it('the AT modes start with EPC, HAM and BOT and a new one joins them', async () => {
    const { f, meetings } = await setup();
    await make(
      meetings,
      { date: '2026-12-01', start_time: '10:00', name_of_project: 'Ring Road', mode: 'PPP' },
      'at',
    );
    expect(await optionsOf(f, 'at', 'mode')).toEqual(
      expect.arrayContaining(['EPC', 'HAM', 'BOT', 'PPP']),
    );
  });

  it('a dropdown that does not learn is left alone (the 36 states)', async () => {
    const { f, meetings } = await setup();
    await make(meetings, ccie({ state: 'kerala' }));
    expect(await optionsOf(f, 'ccie', 'state')).toHaveLength(36);
    expect((await lookupRows(f)).some((r) => r.field_key === 'state')).toBe(false);
  });

  it('editing something else does not count the value again', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings, ccie({ piu: 'PIU Gwalior' }));
    await meetings.update(meeting.id, { remarks: 'unrelated' }, 1, dad);
    await meetings.update(meeting.id, { remarks: 'still unrelated' }, 2, dad);
    expect((await lookupRows(f)).find((r) => r.field_key === 'piu')).toMatchObject({ count: 1 });
  });

  it('changing the value counts the new one', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings, ccie({ piu: 'PIU Gwalior' }));
    await meetings.update(meeting.id, { piu: 'PIU Indore' }, 1, dad);
    expect(await optionsOf(f, 'ccie', 'piu')).toEqual(
      expect.arrayContaining(['PIU Gwalior', 'PIU Indore']),
    );
    expect((await lookupRows(f)).find((r) => r.value === 'PIU Indore')).toMatchObject({ count: 1 });
  });

  it('the done flow counts the values it copies', async () => {
    const { f, meetings } = await setup();
    const { meeting } = await make(meetings, ccie({ piu: 'PIU Gwalior' }));
    await meetings.complete(
      meeting.id,
      { next: { id: newId(), date: '2026-12-08', start_time: '10:30' }, rev: 1 },
      dad,
    );
    expect((await lookupRows(f)).find((r) => r.field_key === 'piu')).toMatchObject({ count: 2 });
  });

  it('a value that is already on the list is counted but not added again', async () => {
    const { f, meetings } = await setup();
    await make(
      meetings,
      { date: '2026-12-01', start_time: '10:00', name_of_project: 'A', mode: 'hAm' },
      'at',
    );
    const modes = await optionsOf(f, 'at', 'mode');
    expect(modes.filter((m) => m.toLowerCase() === 'ham')).toEqual(['HAM']);
  });
});

describe('adding a new category', () => {
  const color = CATEGORY_PALETTE[4];

  it('makes a tab, the core columns and a config row, and shows up in the app', async () => {
    const { f } = await setup();
    const c = await createCategory(f.store, { name: 'Site Visits', color }, dad);
    expect(c).toMatchObject({
      slug: 'site_visits',
      name: 'Site Visits',
      color,
      active: true,
      is_seed: false,
      default_workspace: 'nhai',
    });

    const snap = await f.store.snapshot();
    expect(snap.config.problems).toEqual([]);
    expect(snap.config.categories.map((x) => x.slug)).toContain('site_visits');
    const cfg = snap.config.byCategory.get('site_visits')!;
    expect(cfg.tab.title).toBe('Site Visits');
    expect(cfg.fields.map((x) => x.key)).toEqual(
      expect.arrayContaining([
        'sr_no',
        'date',
        'start_time',
        'end_time',
        'topic',
        'meeting_status',
        'meeting_link',
        'files',
        'remarks',
        'details',
        'workspace',
        'reminder_minutes',
      ]),
    );
    const tab = await f.tab('Site Visits');
    expect(tab.headers).toContain('topic');
    expect(tab.headers).toContain('id');
  });

  it('sorts after the others, and can hold a meeting straight away', async () => {
    const { f, meetings } = await setup();
    const before = (await f.store.snapshot()).config.categories.length;
    const c = await createCategory(f.store, { name: 'Site Visits', color }, dad);
    const snap = await f.store.snapshot();
    expect(snap.config.categories).toHaveLength(before + 1);
    expect(snap.config.categories[snap.config.categories.length - 1]!.slug).toBe('site_visits');
    const { meeting } = await make(
      meetings,
      { date: '2026-12-05', start_time: '09:00', topic: 'Inspect the bridge' },
      c.slug,
    );
    expect(meeting.title).toBe('Inspect the bridge');
    expect(meeting.values.sr_no).toBe(1);
  });

  it('hides the system columns in the Sheet, like the other tabs', async () => {
    const { f } = await setup();
    await createCategory(f.store, { name: 'Site Visits', color }, dad);
    const gid = (await f.store.snapshot()).config.byCategory.get('site_visits')!.tab.gid;
    const tab = f.mock.world.spreadsheets.get(f.spreadsheetId)!.tabs.get(gid)!;
    expect(tab.format.frozenRows).toBe(1);
    expect(tab.format.hiddenColumns!.length).toBe(11);
  });

  it('refuses a name that is taken, a blank name and a colour that is not on the list', async () => {
    const { f } = await setup();
    const taken = await createCategory(f.store, { name: 'ccie', color }, dad).catch((e) => e);
    expect(taken.issues[0].message).toBe('A category called "ccie" already exists.');
    const blank = await createCategory(f.store, { name: '   ', color }, dad).catch((e) => e);
    expect(blank.issues[0].message).toBe('Please give the category a name.');
    const bad = await createCategory(f.store, { name: 'Fine', color: '#123456' }, dad).catch(
      (e) => e,
    );
    expect(bad.issues[0]).toEqual({
      field: 'color',
      message: 'Please choose a colour from the list.',
    });
    const long = await createCategory(f.store, { name: 'x'.repeat(61), color }, dad).catch(
      (e) => e,
    );
    expect(long.issues[0].field).toBe('name');
  });

  it('two at the same moment get their own tabs and slugs', async () => {
    const { f } = await setup();
    const [a, b] = await Promise.all([
      createCategory(f.store, { name: 'Reviews', color }, dad),
      createCategory(f.store, { name: 'Reviews!', color }, dad).catch(() => null),
    ]);
    expect(a.slug).toBe('reviews');
    const titles = (await f.store.snapshot()).tabs.map((t) => t.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    if (b) expect(b.slug).not.toBe(a.slug);
  });

  it('a tab name that is already taken gets a number instead of failing', async () => {
    const { f } = await setup();
    const c = await createCategory(f.store, { name: 'Tasks', color }, dad); // "Tasks" is a system tab
    expect((await f.store.snapshot()).config.byCategory.get(c.slug)!.tab.title).toBe('Tasks 2');
  });

  it('is recorded in the change log', async () => {
    const { f } = await setup();
    await createCategory(f.store, { name: 'Site Visits', color }, dad);
    const log = await f.tab('_audit');
    const row = log.rows.find(
      (r) =>
        r[log.headers.indexOf('action')] === 'config' &&
        r[log.headers.indexOf('row_id')] === 'site_visits',
    )!;
    expect(JSON.parse(String(row[log.headers.indexOf('changes')])).name).toEqual([
      null,
      'Site Visits',
    ]);
  });

  it('makes sensible slugs', () => {
    expect(slugFor('Site Visits')).toBe('site_visits');
    expect(slugFor('  PhD / Viva (2026) ')).toBe('phd_viva_2026');
    expect(slugFor('2026 Targets')).toBe('c_2026_targets');
    expect(slugFor('!!!')).toBe('c_category');
    expect(slugFor('बैठक')).toBe('c_category');
  });
});
