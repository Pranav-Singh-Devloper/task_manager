import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/ids';
import { MUTATE, OWNER, startServer, type TestServer } from './helpers';

// Responses are checked field by field in these tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

let server: TestServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function boot() {
  server = await startServer({ seed: 'demo' });
  const cookie = await server.signIn(OWNER);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await server!.get(`/api${path}`, {
      method,
      headers: { cookie, ...MUTATE, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const type = res.headers.get('content-type') ?? '';
    const parsed: Json = type.includes('json')
      ? ((await res.json()) as Json)
      : { text: await res.text() };
    return { status: res.status, body: parsed, headers: res.headers };
  };
  return { call, mock: server.mock };
}

const ccie = (over: Record<string, unknown> = {}) => ({
  date: '2027-03-10',
  start_time: '10:30',
  end_time: '11:30',
  case_id: `C-${newId().slice(-6)}`,
  project_name: 'NH-9',
  state: 'Kerala',
  ...over,
});
const make = async (call: Awaited<ReturnType<typeof boot>>['call'], over = {}) => {
  const id = newId();
  const r = await call('POST', '/meetings', { id, category: 'ccie', values: ccie(over) });
  expect(r.status).toBe(201);
  return r.body.meeting as Json;
};
const header = async (mock: Awaited<ReturnType<typeof boot>>['mock'], title: string) => {
  const sid = (await mock.services.state.read())!.activeSpreadsheetId!;
  const tab = (await mock.services.sheets.getTabs(sid)).find((t) => t.title === title)!;
  return ((await mock.services.sheets.batchGet(sid, [tab.gid]))[tab.gid]?.[0] ?? []).map(String);
};

describe('data tables', () => {
  it('lists every table except _system and marks what can be edited', async () => {
    const { call } = await boot();
    const r = await call('GET', '/admin/tables');
    const names = r.body.tables.map((t: Json) => t.name);
    expect(names).not.toContain('_system');
    expect(names).toEqual(expect.arrayContaining(['CCIE', '_fields', '_audit', '_files']));
    const by = Object.fromEntries(r.body.tables.map((t: Json) => [t.name, t]));
    expect(by.CCIE).toMatchObject({ kind: 'category', editable: true });
    expect(by._fields).toMatchObject({ kind: 'config', editable: false });
    expect(by._audit).toMatchObject({ kind: 'log', editable: false });
  });

  it('shows system and calculated columns, and edits a cell through the normal rules', async () => {
    const { call } = await boot();
    const m = await make(call);
    const grid = await call('GET', '/admin/tables/CCIE?q=' + m.values.case_id);
    expect(grid.body.total).toBe(1);
    const keys = grid.body.columns.map((c: Json) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['id', 'rev', 'calendar_sync', 'case_id']));
    expect(grid.body.columns.find((c: Json) => c.key === 'id').readonly).toBe(true);
    expect(grid.body.rows[0].__id).toBe(m.id);

    const edit = await call('PATCH', `/admin/tables/CCIE/rows/${m.id}`, {
      rev: m.rev,
      values: { project_name: 'NH-44 Bypass' },
    });
    expect(edit.status).toBe(200);
    expect(edit.body.meeting.values.project_name).toBe('NH-44 Bypass');
    expect(edit.body.meeting.rev).toBe(m.rev + 1);

    const stale = await call('PATCH', `/admin/tables/CCIE/rows/${m.id}`, {
      rev: m.rev,
      values: { project_name: 'Old' },
    });
    expect(stale.status).toBe(409);

    const log = await call('GET', `/admin/log?q=${m.id}`);
    expect(log.body.entries.some((e: Json) => e.source === 'admin')).toBe(true);
  });

  it('refuses edits to config and log tables, and moves a deleted row to the Trash', async () => {
    const { call } = await boot();
    const m = await make(call);
    const bad = await call('PATCH', '/admin/tables/_fields/rows/2', { rev: 0, values: {} });
    expect(bad.status).toBe(403);
    const del = await call('DELETE', `/admin/tables/CCIE/rows/${m.id}?rev=${m.rev}`);
    expect(del.status).toBe(200);
    const trash = await call('GET', '/admin/trash');
    expect(trash.body.meetings.map((x: Json) => x.id)).toContain(m.id);
  });

  it('exports CSV and Excel, and keeps text that looks like a formula as text', async () => {
    const { call } = await boot();
    await make(call, { project_name: '=HYPERLINK("http://x")' });
    const csv = await call('GET', '/admin/export/CCIE?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.body.text).toContain("'=HYPERLINK");
    expect(csv.body.text).not.toMatch(/(^|,)=HYPERLINK/m);
    const xlsx = await server!.get('/api/admin/export/CCIE?format=xlsx', {
      headers: { cookie: await server!.signIn(OWNER) },
    });
    expect(xlsx.status).toBe(200);
    expect(
      Buffer.from(await xlsx.arrayBuffer())
        .subarray(0, 2)
        .toString(),
    ).toBe('PK');
    expect((await call('GET', '/admin/export/Nope')).status).toBe(404);
  });
});

describe('columns and categories', () => {
  it('a new column appears in the config and the Sheet header, and can be hidden without losing data', async () => {
    const { call, mock } = await boot();
    const add = await call('POST', '/admin/fields', {
      category: 'ccie',
      label: 'Contractor Phone',
      type: 'text',
      show_in_table: true,
    });
    expect(add.status).toBe(201);
    expect(add.body.field.key).toBe('contractor_phone');
    const meta = await call('GET', '/meta');
    expect(meta.body.fields.some((f: Json) => f.key === 'contractor_phone')).toBe(true);
    expect(await header(mock, 'CCIE')).toContain('contractor_phone');

    const m = await make(call, { contractor_phone: '98100 00000' });
    expect(m.values.contractor_phone).toBe('98100 00000');

    const hide = await call('PATCH', '/admin/fields/ccie/contractor_phone', { archived: true });
    expect(hide.body.field.archived).toBe(true);
    expect(await header(mock, 'CCIE')).toContain('contractor_phone');
    const again = await call('GET', `/meetings/${m.id}`);
    expect(again.body.meeting.values.contractor_phone).toBe('98100 00000');
  });

  it('refuses duplicate names, bad formulas, and changes to a column every meeting needs', async () => {
    const { call } = await boot();
    const dupe = await call('POST', '/admin/fields', {
      category: 'ccie',
      label: 'Contractor',
      type: 'text',
    });
    expect(dupe.status).toBe(400);
    const bad = await call('POST', '/admin/fields', {
      category: 'ccie',
      label: 'Broken',
      type: 'computed',
      computed_expr: 'nope_column + 1',
    });
    expect(bad.status).toBe(400);
    const locked = await call('PATCH', '/admin/fields/ccie/date', { archived: true });
    expect(locked.status).toBe(400);
    const rename = await call('PATCH', '/admin/fields/ccie/date', { label: 'Meeting date' });
    expect(rename.status).toBe(200);
  });

  it('allows compatible type changes only, and counts values that would not fit', async () => {
    const { call } = await boot();
    await call('POST', '/admin/fields', { category: 'ccie', label: 'Notes Tag', type: 'text' });
    await make(call, { notes_tag: 'urgent' });
    await make(call, { notes_tag: 'later' });

    const okLong = await call('GET', '/admin/fields/ccie/notes_tag/type-check?type=long_text');
    expect(okLong.body.allowed).toBe(true);
    const toDate = await call('GET', '/admin/fields/ccie/notes_tag/type-check?type=date');
    expect(toDate.body.allowed).toBe(false);
    const toSelect = await call(
      'GET',
      '/admin/fields/ccie/notes_tag/type-check?type=select&options=' + encodeURIComponent('urgent'),
    );
    expect(toSelect.body).toMatchObject({ allowed: false, invalid_count: 1 });

    const blocked = await call('PATCH', '/admin/fields/ccie/notes_tag', { type: 'date' });
    expect(blocked.status).toBe(400);
    const changed = await call('PATCH', '/admin/fields/ccie/notes_tag', { type: 'long_text' });
    expect(changed.body.field.type).toBe('long_text');
  });

  it('moves a column up and down', async () => {
    const { call } = await boot();
    await call('POST', '/admin/fields', { category: 'ccie', label: 'First New', type: 'text' });
    await call('POST', '/admin/fields', { category: 'ccie', label: 'Second New', type: 'text' });
    const order = async () =>
      (await call('GET', '/meta')).body.fields
        .filter(
          (f: Json) => f.category_slug === 'ccie' && ['first_new', 'second_new'].includes(f.key),
        )
        .sort((a: Json, b: Json) => a.order - b.order)
        .map((f: Json) => f.key);
    expect(await order()).toEqual(['first_new', 'second_new']);
    await call('POST', '/admin/fields/ccie/second_new/move', { direction: 'up' });
    expect(await order()).toEqual(['second_new', 'first_new']);
  });

  it('removes a column for good only with the typed name, and makes a backup first', async () => {
    const { call } = await boot();
    await call('POST', '/admin/fields', { category: 'ccie', label: 'Temporary', type: 'text' });
    const m = await make(call, { temporary: 'x' });
    const wrong = await call('POST', '/admin/fields/ccie/temporary/remove', { confirm: 'nope' });
    expect(wrong.status).toBe(400);
    expect((await call('GET', '/admin/backups')).body.backups).toHaveLength(0);

    const done = await call('POST', '/admin/fields/ccie/temporary/remove', {
      confirm: 'temporary',
    });
    expect(done.status).toBe(200);
    expect((await call('GET', '/admin/backups')).body.backups).toHaveLength(1);
    const meta = await call('GET', '/meta');
    expect(meta.body.fields.some((f: Json) => f.key === 'temporary')).toBe(false);
    expect((await call('GET', `/meetings/${m.id}`)).body.meeting.values.temporary).toBeUndefined();
  });

  it('edits and hides a category, and will not remove one that has meetings', async () => {
    const { call } = await boot();
    const edit = await call('PATCH', '/admin/categories/others', {
      name: 'Miscellaneous',
      title_template: 'Misc — {topic}',
    });
    expect(edit.body.category.name).toBe('Miscellaneous');
    const badTemplate = await call('PATCH', '/admin/categories/others', {
      title_template: '{nope}',
    });
    expect(badTemplate.status).toBe(400);
    const hide = await call('PATCH', '/admin/categories/others', { active: false });
    expect(hide.body.category.active).toBe(false);

    await make(call);
    const refuse = await call('POST', '/admin/categories/ccie/remove', { confirm: 'CCIE' });
    expect(refuse.status).toBe(400);
  });

  it('removes an empty category only with its typed name and a backup', async () => {
    const { call } = await boot();
    const made = await call('POST', '/categories', { name: 'Site Visit', color: '#1D4ED8' });
    expect(made.status).toBe(201);
    const slug = made.body.category.slug;
    expect((await call('POST', `/admin/categories/${slug}/remove`, { confirm: 'x' })).status).toBe(
      400,
    );
    const ok = await call('POST', `/admin/categories/${slug}/remove`, { confirm: 'site visit' });
    expect(ok.status).toBe(200);
    const meta = await call('GET', '/meta');
    expect(meta.body.categories.some((c: Json) => c.slug === slug)).toBe(false);
  });
});

describe('trash', () => {
  it('restores a deleted meeting', async () => {
    const { call } = await boot();
    const m = await make(call);
    await call('DELETE', `/meetings/${m.id}?rev=${m.rev}`);
    const back = await call('POST', `/admin/trash/${m.id}/restore`);
    expect(back.body.meeting.deleted_at).toBeNull();
    expect((await call('GET', '/admin/trash')).body.meetings).toHaveLength(0);
  });

  it('deletes forever only from the Trash, with the typed word, and trashes the Drive files', async () => {
    const { call, mock } = await boot();
    const m = await make(call);
    const tooSoon = await call('DELETE', `/admin/trash/${m.id}`, { confirm: 'DELETE' });
    expect(tooSoon.status).toBe(409);

    const form = new FormData();
    form.append('meeting_id', m.id);
    form.append('category', 'ccie');
    form.append('attach', '1');
    form.append('file', new Blob(['x'], { type: 'application/pdf' }), 'a.pdf');
    const up = await server!.get('/api/files', {
      method: 'POST',
      headers: { cookie: await server!.signIn(OWNER), ...MUTATE },
      body: form,
    });
    const file = ((await up.json()) as Json).file;

    const current = (await call('GET', `/meetings/${m.id}`)).body.meeting;
    await call('DELETE', `/meetings/${m.id}?rev=${current.rev}`);
    expect((await call('DELETE', `/admin/trash/${m.id}`, { confirm: 'please' })).status).toBe(400);
    expect((await call('DELETE', `/admin/trash/${m.id}`, { confirm: 'delete' })).status).toBe(200);
    expect((await call('GET', `/meetings/${m.id}`)).status).toBe(404);
    expect(mock.world.files.get(file.view_link.split('/')[4])!.trashed).toBe(true);
    const log = await call('GET', `/admin/log?q=${m.id}`);
    expect(log.body.entries.some((e: Json) => e.what.startsWith('Deleted for good'))).toBe(true);
  });
});

describe('backups', () => {
  it('backs up now, and switching to a backup brings back that moment and keeps the current data as a backup', async () => {
    const { call, mock } = await boot();
    const before = await make(call, { project_name: 'Before backup' });
    const made = await call('POST', '/admin/backup');
    expect(made.status).toBe(201);
    const backupId = made.body.backup.id;
    expect(mock.world.files.get(backupId)!.appProperties).toMatchObject({ role: 'backup' });

    const after = await make(call, { project_name: 'After backup' });
    const state0 = (await mock.services.state.read())!;

    const go = await call('POST', `/admin/backups/${backupId}/activate`);
    expect(go.status).toBe(200);
    const state1 = (await mock.services.state.read())!;
    expect(state1.activeSpreadsheetId).toBe(backupId);
    expect(mock.world.files.get(backupId)!.appProperties.role).toBe('database');
    expect(mock.world.files.get(state0.activeSpreadsheetId!)!.appProperties.role).toBe('backup');

    expect((await call('GET', `/meetings/${before.id}`)).status).toBe(200);
    expect((await call('GET', `/meetings/${after.id}`)).status).toBe(404);
    // The data from before switching is still available as a backup.
    expect((await call('GET', '/admin/backups')).body.backups.length).toBeGreaterThanOrEqual(2);
  });

  it('says plainly when a backup does not exist', async () => {
    const { call } = await boot();
    expect((await call('POST', '/admin/backups/nope/activate')).status).toBe(404);
  });
});

describe('system health and the change log', () => {
  it('reflects a calendar failure, then recovers', async () => {
    const { call, mock } = await boot();
    const base = (await call('GET', '/admin/health')).body.not_on_calendar;
    mock.failures.set('calendar');
    await make(call);
    const bad = (await call('GET', '/admin/health')).body;
    expect(bad.not_on_calendar).toBe(base + 1);
    mock.failures.clear();
    await call('POST', '/calendar/retry-all');
    expect((await call('GET', '/admin/health')).body.not_on_calendar).toBe(0);
  });

  it('reports versions, connection and config problems', async () => {
    const { call } = await boot();
    const h = (await call('GET', '/admin/health')).body;
    expect(h.google).toMatchObject({ mode: 'mock', needsSignIn: false });
    expect(h.google.email).toBe(OWNER);
    expect(h.schema_version).toBeGreaterThanOrEqual(1);
    expect(typeof h.app_version).toBe('string');
    expect(Array.isArray(h.config_problems)).toBe(true);
  });

  it('searches the change log', async () => {
    const { call } = await boot();
    const m = await make(call, { project_name: 'Searchable one' });
    const r = await call('GET', `/admin/log?q=${m.id}`);
    expect(r.body.total).toBeGreaterThanOrEqual(1);
    const none = await call('GET', '/admin/log?q=zzz-nothing-here');
    expect(none.body.total).toBe(0);
  });
});
