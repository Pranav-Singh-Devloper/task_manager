import { describe, expect, it } from 'vitest';
import { buildSeedConfig } from '../../shared/seed';
import type { FieldDef, FieldValue } from '../../shared/types';
import { missingRequired, validateValues } from '../../shared/validation';

const seed = buildSeedConfig('2026-11-14T00:00:00.000Z');
const fieldsOf = (slug: string) => seed.fields.filter((f) => f.category_slug === slug);
const workspaces = ['nhai', 'phd', 'personal'];
const base = {
  date: '2026-11-17',
  start_time: '10:30',
  workspace: 'nhai',
  meeting_status: 'Scheduled',
};

const ok = (slug: string, input: Record<string, unknown>, extra = {}) => {
  const r = validateValues(fieldsOf(slug), input, {
    workspaces,
    hasTitleTemplate: slug === 'ccie' || slug === 'at',
    ...extra,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.values;
};
const issues = (slug: string, input: Record<string, unknown>, extra = {}) => {
  const r = validateValues(fieldsOf(slug), input, {
    workspaces,
    hasTitleTemplate: slug === 'ccie' || slug === 'at',
    ...extra,
  });
  if (r.ok) throw new Error('expected problems');
  return r.issues;
};

describe('the CCIE form (SPEC 6.7)', () => {
  const good = {
    ...base,
    case_id: 'C-101',
    project_name: 'NH-44 Four Laning',
    state: 'Madhya Pradesh',
  };

  it('accepts a valid meeting', () => {
    const v = ok('ccie', good);
    expect(v.case_id).toBe('C-101');
    expect(v.state).toBe('Madhya Pradesh');
  });

  it('needs Case Id and Project Name, but not a topic (the title template covers it)', () => {
    const r = issues('ccie', base);
    expect(r.map((i) => i.field)).toEqual(['case_id', 'project_name']);
    expect(r.map((i) => i.message)).toEqual([
      'Please fill in Case Id.',
      'Please fill in Project Name.',
    ]);
  });

  it('needs a date and a time', () => {
    const r = issues('ccie', { ...good, date: '', start_time: '' });
    expect(r.map((i) => i.field)).toEqual(['date', 'start_time']);
  });

  it('state must be one of the 36, ignoring case, and is stored as the official spelling', () => {
    expect(ok('ccie', { ...good, state: 'kerala' }).state).toBe('Kerala');
    expect(issues('ccie', { ...good, state: 'Atlantis' })[0]?.message).toBe(
      'State: "Atlantis" is not one of the choices.',
    );
  });

  it('lets a field that allows new values take any value', () => {
    expect(ok('ccie', { ...good, piu: 'PIU Gwalior (new)' }).piu).toBe('PIU Gwalior (new)');
  });

  it('never accepts a value for a computed or automatic field', () => {
    const v = ok('ccie', { ...good, pendency_months: 99, numbers_of_meeting: 5, sr_no: 7 });
    expect(v).not.toHaveProperty('pendency_months');
    expect(v).not.toHaveProperty('numbers_of_meeting');
    expect(v).not.toHaveProperty('sr_no');
  });

  it('reads typed dates and normalises them', () => {
    expect(
      ok('ccie', { ...good, date: '17/11/2026', date_of_initiation: '10-Feb-2025' }),
    ).toMatchObject({
      date: '2026-11-17',
      date_of_initiation: '2025-02-10',
    });
  });
});

describe('the AT form (SPEC 6.7)', () => {
  const good = {
    ...base,
    name_of_project: 'Kanpur Ring Road',
    length: '42.5',
    civil_cost: '1,280',
    total_cost: 1710,
    mode: 'HAM',
  };

  it('reads numbers, including commas', () => {
    const v = ok('at', good);
    expect(v.length).toBe(42.5);
    expect(v.civil_cost).toBe(1280);
    expect(v.total_cost).toBe(1710);
  });

  it('refuses a length that is not a number, in plain words', () => {
    expect(issues('at', { ...good, length: 'long' })[0]).toEqual({
      field: 'length',
      message: 'Please enter a number for Length.',
    });
  });

  it('a new Mode is accepted because Mode learns', () => {
    expect(ok('at', { ...good, mode: 'PPP' }).mode).toBe('PPP');
  });

  it('name of project is required', () => {
    expect(issues('at', base)[0]?.message).toBe('Please fill in Name of Project.');
  });
});

describe('the core fields on every category', () => {
  const others = { ...base, topic: 'Review' };

  it('topic is required where there is no title template', () => {
    expect(issues('others', base)[0]).toEqual({ field: 'topic', message: 'Please fill in Topic.' });
    expect(ok('others', others).topic).toBe('Review');
  });

  it('the end time must be after the start', () => {
    expect(issues('others', { ...others, end_time: '10:30' })[0]).toEqual({
      field: 'end_time',
      message: 'The end time must be after the start time.',
    });
    expect(ok('others', { ...others, end_time: '11:30' }).end_time).toBe('11:30');
  });

  it('reads typed times', () => {
    expect(ok('others', { ...others, start_time: '2:30 pm' }).start_time).toBe('14:30');
  });

  it('status must be one of the four', () => {
    expect(issues('others', { ...others, meeting_status: 'Maybe' })[0]?.message).toBe(
      'Please choose a valid status.',
    );
    expect(ok('others', { ...others, meeting_status: 'Cancelled' }).meeting_status).toBe(
      'Cancelled',
    );
  });

  it('workspace must exist', () => {
    expect(issues('others', { ...others, workspace: 'secret' })[0]?.message).toBe(
      'Please choose a workspace from the list.',
    );
  });

  it('a meeting link must be a web link', () => {
    expect(
      ok('others', { ...others, meeting_link: 'https://meet.google.com/abc' }).meeting_link,
    ).toBe('https://meet.google.com/abc');
    expect(issues('others', { ...others, meeting_link: 'room 4' })[0]?.message).toBe(
      'Please enter a web link for Meeting Link, starting with https://',
    );
    expect(issues('others', { ...others, meeting_link: 'javascript:alert(1)' })).toHaveLength(1);
  });

  it('text that looks like a formula is kept as plain text', () => {
    expect(ok('others', { ...others, remarks: '=HYPERLINK("x")' }).remarks).toBe('=HYPERLINK("x")');
  });

  it('long text has a limit under the Sheets cell limit', () => {
    expect(issues('others', { ...others, details: 'x'.repeat(40001) })[0]?.field).toBe('details');
    expect(ok('others', { ...others, details: 'x'.repeat(40000) }).details).toHaveLength(40000);
  });

  it('files are not set here', () => {
    expect(ok('others', { ...others, files: 'https://x' })).not.toHaveProperty('files');
  });
});

describe('changing the config changes the rules, with no code change', () => {
  const extra = (patch: Partial<FieldDef>): FieldDef => ({
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
    ...patch,
  });
  const run = (fields: FieldDef[], input: Record<string, unknown>) =>
    validateValues(fields, input, { workspaces, hasTitleTemplate: false });
  const others = fieldsOf('others');
  const input = { ...base, topic: 'Review' };

  it('a new column is accepted and kept', () => {
    const r = run([...others, extra({})], { ...input, venue: 'Room 4' });
    expect(r.ok && r.values.venue).toBe('Room 4');
  });

  it('a new required column is enforced', () => {
    const r = run([...others, extra({ required: true })], input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]).toEqual({ field: 'venue', message: 'Please fill in Venue.' });
  });

  it('a new dropdown limits the choices', () => {
    const f = extra({ type: 'select', options: ['Room 1', 'Room 2'] });
    expect(run([...others, f], { ...input, venue: 'Room 3' }).ok).toBe(false);
    expect(run([...others, f], { ...input, venue: 'room 2' })).toMatchObject({
      ok: true,
      values: { venue: 'Room 2' },
    });
  });

  it('an archived column is ignored', () => {
    const r = run([...others, extra({ required: true, archived: true })], input);
    expect(r.ok).toBe(true);
  });

  it('a column turned into a number is checked as a number', () => {
    expect(run([...others, extra({ type: 'number' })], { ...input, venue: 'abc' }).ok).toBe(false);
  });
});

describe('multi-select, checkbox and legacy values', () => {
  const field = (patch: Partial<FieldDef>): FieldDef => ({
    category_slug: 'x',
    key: 'tags',
    label: 'Tags',
    type: 'multi_select',
    required: false,
    options: ['A', 'B', 'C'],
    allow_new_options: false,
    default_value: '',
    help_text: '',
    placeholder: '',
    unit: '',
    order: 1,
    show_in_form: true,
    show_in_table: false,
    searchable: true,
    case_key: false,
    computed_expr: '',
    locked: false,
    archived: false,
    created_at: '',
    ...patch,
  });
  const run = (f: FieldDef, v: unknown, existing?: Record<string, FieldValue>) =>
    validateValues([f], { [f.key]: v }, { workspaces, existing });

  it('multi-select takes a list or comma-separated text and drops repeats', () => {
    expect(run(field({}), ['a', 'B', 'b'])).toMatchObject({
      ok: true,
      values: { tags: ['A', 'B'] },
    });
    expect(run(field({}), 'A, C')).toMatchObject({ ok: true, values: { tags: ['A', 'C'] } });
    expect(run(field({}), ['Z']).ok).toBe(false);
  });

  it('checkbox reads yes/no style text', () => {
    const f = field({ type: 'checkbox', key: 'done' });
    expect(run(f, 'Yes')).toMatchObject({ values: { done: true } });
    expect(run(f, 'FALSE')).toMatchObject({ values: { done: false } });
    expect(run(f, '')).toMatchObject({ values: { done: false } });
    expect(run(f, 'maybe').ok).toBe(false);
  });

  it('an older value that is no longer on the list does not block an unrelated edit', () => {
    const f = field({ type: 'select', key: 'status', options: ['Open', 'Closed'] });
    expect(run(f, 'Pending').ok).toBe(false);
    expect(run(f, 'Pending', { status: 'Pending' }).ok).toBe(true);
  });
});

describe('missingRequired (the "Incomplete" chip)', () => {
  it('lists required fields that are empty, without blocking', () => {
    const fields = fieldsOf('ccie');
    expect(
      missingRequired(fields, { date: '2026-11-17', start_time: '10:30', case_id: '' }, true),
    ).toEqual(['case_id', 'project_name']);
    expect(
      missingRequired(
        fields,
        { date: '2026-11-17', start_time: '10:30', case_id: 'C-1', project_name: 'P' },
        true,
      ),
    ).toEqual([]);
  });
});
