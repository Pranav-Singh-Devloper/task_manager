import { checkFormula } from '../../../shared/formula';
import { SYSTEM_COLUMNS, TAB, categoryToRow, fieldToRow } from '../../../shared/schema';
import { CATEGORY_PALETTE } from '../../../shared/seed';
import {
  FIELD_TYPES,
  type CategoryDef,
  type Cell,
  type FieldDef,
  type FieldType,
  type ValidationIssue,
} from '../../../shared/types';
import { AppError, NotFoundError, ValidationFailed } from '../../lib/errors';
import { slugFor } from '../categories';
import type { Actor } from '../meetings';
import type { SheetStore, Snapshot } from '../store';
import { backupNow } from './backups';

const MAX_LABEL = 60;
/** Types a person may choose for a new column. File and automatic number belong to the app itself. */
export const ADDABLE_TYPES = FIELD_TYPES.filter((t) => t !== 'file' && t !== 'auto_number');
/** Types whose values are plain text underneath, so they can change into each other without losing anything. */
const TEXTY: FieldType[] = ['text', 'long_text', 'select'];
/** New columns start after the category's own columns and before the shared ones (Files, Remarks, Details...). */
const SHARED_ORDER_START = 800;

export interface FieldInput {
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  allow_new_options?: boolean;
  default_value?: string;
  help_text?: string;
  placeholder?: string;
  unit?: string;
  show_in_form?: boolean;
  show_in_table?: boolean;
  searchable?: boolean;
  case_key?: boolean;
  computed_expr?: string;
}

export interface TypeCheck {
  allowed: boolean;
  /** Existing values that would no longer fit. */
  invalid_count: number;
  /** Plain words for the person: why it is blocked, or what will happen. */
  message: string;
}

const lockedMessage = 'This column is needed by every row, so it cannot be changed this way.';

/** The columns of a meeting category or a tracker: Admin manages both the same way. */
function tabConfig(snap: Snapshot, slug: string) {
  return snap.config.byCategory.get(slug) ?? snap.config.byTracker.get(slug);
}
function rowsOf(snap: Snapshot, slug: string) {
  return snap.categories.get(slug) ?? snap.trackers.get(slug);
}

async function configTab(store: SheetStore, title: string) {
  const snap = await store.snapshot();
  const tab = snap.tabs.find((t) => t.title === title);
  if (!tab)
    throw new AppError(500, 'not_set_up', `The ${title} tab is missing from the spreadsheet.`);
  return tab;
}

/** Finds a config row by its first columns, in the live Sheet. Returns the 1-based row, or 0. */
function rowOf(rows: Cell[][], match: (r: Cell[]) => boolean): number {
  const i = rows.findIndex((r, n) => n > 0 && match(r));
  return i < 0 ? 0 : i + 1;
}

async function audit(
  store: SheetStore,
  actor: Actor,
  table: string,
  rowId: string,
  changes: Record<string, [unknown, unknown]>,
) {
  await store.log.audit({
    user: actor.email,
    action: 'config',
    table,
    rowId,
    changes,
    source: actor.source,
  });
}

function checkLabel(label: string, issues: ValidationIssue[]) {
  const l = label.trim();
  if (!l) issues.push({ field: 'label', message: 'Please give the column a name.' });
  else if (l.length > MAX_LABEL)
    issues.push({ field: 'label', message: `Please keep the name under ${MAX_LABEL} characters.` });
}

function cleanOptions(list: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of list ?? []) {
    const v = o.trim().replace(/\s+/g, ' ');
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

/** What would happen if this column changed type (§9 rule 13). Nothing is changed. */
export async function checkTypeChange(
  store: SheetStore,
  slug: string,
  key: string,
  to: FieldType,
  options?: string[],
): Promise<TypeCheck> {
  const snap = await store.snapshot();
  const field = tabConfig(snap, slug)?.fields.find((f) => f.key === key);
  if (!field) throw new NotFoundError("We couldn't find that column.");
  if (field.type === to)
    return { allowed: true, invalid_count: 0, message: 'The type stays the same.' };
  if (field.locked) return { allowed: false, invalid_count: 0, message: lockedMessage };

  const ok =
    (TEXTY.includes(field.type) && TEXTY.includes(to)) ||
    (field.type === 'number' && (to === 'text' || to === 'long_text'));
  if (!ok) {
    return {
      allowed: false,
      invalid_count: 0,
      message:
        'This change could make existing values unreadable, so it is not allowed. Add a new column of the type you want instead, and hide this one.',
    };
  }
  if (to === 'select') {
    const allowed = new Set(cleanOptions(options ?? field.options).map((o) => o.toLowerCase()));
    let bad = 0;
    for (const e of rowsOf(snap, slug)?.entries.values() ?? []) {
      const v = e.record.values[key];
      if (typeof v === 'string' && v.trim() && !allowed.has(v.trim().toLowerCase())) bad += 1;
    }
    if (bad > 0) {
      return {
        allowed: false,
        invalid_count: bad,
        message: `${bad} existing ${bad === 1 ? 'value is' : 'values are'} not in the list of choices. Add them to the choices first.`,
      };
    }
  }
  return { allowed: true, invalid_count: 0, message: 'Every existing value still fits.' };
}

function validateInput(
  store: SheetStore,
  stored: Set<string>,
  input: FieldInput,
  issues: ValidationIssue[],
) {
  void store;
  checkLabel(input.label, issues);
  if (!(ADDABLE_TYPES as readonly string[]).includes(input.type)) {
    issues.push({ field: 'type', message: 'Please choose a type from the list.' });
  }
  if (input.type === 'computed') {
    const problem = input.computed_expr?.trim()
      ? checkFormula(input.computed_expr, stored)
      : 'Please write the formula.';
    if (problem) issues.push({ field: 'computed_expr', message: problem });
  }
}

export async function addField(
  store: SheetStore,
  slug: string,
  input: FieldInput,
  actor: Actor,
): Promise<FieldDef> {
  const snap = await store.snapshot();
  const cfg = tabConfig(snap, slug);
  if (!cfg) throw new NotFoundError("We couldn't find that list.");
  const issues: ValidationIssue[] = [];
  const stored = new Set(cfg.fields.filter((f) => f.type !== 'computed').map((f) => f.key));
  validateInput(store, stored, input, issues);
  if (cfg.fields.some((f) => f.label.toLowerCase() === input.label.trim().toLowerCase())) {
    issues.push({
      field: 'label',
      message: `This list already has a column called "${input.label.trim()}".`,
    });
  }
  if (issues.length > 0) throw new ValidationFailed(issues);

  const tab = await configTab(store, TAB.fields);
  const reserved = new Set<string>(SYSTEM_COLUMNS);
  const field = await store.mutex.run(store.tabKey(tab.gid), async () => {
    const live =
      (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
    const taken = new Set(
      live
        .slice(1)
        .filter((r) => r[0] === slug)
        .map((r) => String(r[1])),
    );
    let key = slugFor(input.label);
    for (let n = 2; taken.has(key) || reserved.has(key); n += 1)
      key = `${slugFor(input.label)}_${n}`;
    const ordinary = cfg.fields.filter((f) => f.order < SHARED_ORDER_START).map((f) => f.order);
    const order = Math.max(90, ...ordinary) + 10;
    const created: FieldDef = {
      category_slug: slug,
      key,
      label: input.label.trim(),
      type: input.type,
      required: Boolean(input.required),
      options:
        input.type === 'select' || input.type === 'multi_select' ? cleanOptions(input.options) : [],
      allow_new_options: Boolean(input.allow_new_options),
      default_value: input.default_value ?? '',
      help_text: input.help_text ?? '',
      placeholder: input.placeholder ?? '',
      unit: input.unit ?? '',
      order,
      show_in_form: input.type === 'computed' ? false : (input.show_in_form ?? true),
      show_in_table: input.show_in_table ?? false,
      searchable: input.searchable ?? true,
      case_key: Boolean(input.case_key),
      computed_expr: input.type === 'computed' ? (input.computed_expr ?? '').trim() : '',
      locked: false,
      archived: false,
      created_at: store.now().toISOString(),
    };
    await store.google.sheets.appendRows(store.spreadsheetId, tab.gid, [fieldToRow(created)]);
    return created;
  });
  await audit(store, actor, TAB.fields, `${slug}.${field.key}`, { added: [null, field.label] });
  // Reloading adds the new column to the category's Sheet header.
  await store.refresh();
  return field;
}

export type FieldPatch = Partial<FieldInput> & { archived?: boolean };

export async function updateField(
  store: SheetStore,
  slug: string,
  key: string,
  patch: FieldPatch,
  actor: Actor,
): Promise<FieldDef> {
  const snap = await store.snapshot();
  const cfg = tabConfig(snap, slug);
  const current = cfg?.fields.find((f) => f.key === key);
  if (!cfg || !current) throw new NotFoundError("We couldn't find that column.");

  const issues: ValidationIssue[] = [];
  if (current.locked) {
    const blocked: (keyof FieldPatch)[] = [
      'type',
      'archived',
      'show_in_form',
      'required',
      'computed_expr',
    ];
    for (const k of blocked) {
      if (patch[k] !== undefined && patch[k] !== current[k as keyof FieldDef]) {
        issues.push({ field: k, message: lockedMessage });
      }
    }
  }
  if (patch.label !== undefined) checkLabel(patch.label, issues);
  if (
    patch.label !== undefined &&
    cfg.fields.some(
      (f) => f.key !== key && f.label.toLowerCase() === patch.label!.trim().toLowerCase(),
    )
  ) {
    issues.push({
      field: 'label',
      message: `This list already has a column called "${patch.label.trim()}".`,
    });
  }
  const nextType = patch.type ?? current.type;
  if (patch.type !== undefined && patch.type !== current.type) {
    const check = await checkTypeChange(store, slug, key, patch.type, patch.options);
    if (!check.allowed) issues.push({ field: 'type', message: check.message });
  }
  if (nextType === 'computed') {
    const stored = new Set(cfg.fields.filter((f) => f.type !== 'computed').map((f) => f.key));
    const expr = patch.computed_expr ?? current.computed_expr;
    const problem = expr.trim() ? checkFormula(expr, stored) : 'Please write the formula.';
    if (problem) issues.push({ field: 'computed_expr', message: problem });
  }
  if (issues.length > 0) throw new ValidationFailed(issues);

  const next: FieldDef = {
    ...current,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.required !== undefined ? { required: patch.required } : {}),
    ...(patch.options !== undefined ? { options: cleanOptions(patch.options) } : {}),
    ...(patch.allow_new_options !== undefined
      ? { allow_new_options: patch.allow_new_options }
      : {}),
    ...(patch.default_value !== undefined ? { default_value: patch.default_value } : {}),
    ...(patch.help_text !== undefined ? { help_text: patch.help_text } : {}),
    ...(patch.placeholder !== undefined ? { placeholder: patch.placeholder } : {}),
    ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
    ...(patch.show_in_form !== undefined ? { show_in_form: patch.show_in_form } : {}),
    ...(patch.show_in_table !== undefined ? { show_in_table: patch.show_in_table } : {}),
    ...(patch.searchable !== undefined ? { searchable: patch.searchable } : {}),
    ...(patch.case_key !== undefined ? { case_key: patch.case_key } : {}),
    ...(patch.computed_expr !== undefined ? { computed_expr: patch.computed_expr.trim() } : {}),
    ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
  };
  return writeField(store, current, next, actor);
}

async function writeField(
  store: SheetStore,
  before: FieldDef,
  after: FieldDef,
  actor: Actor,
): Promise<FieldDef> {
  const tab = await configTab(store, TAB.fields);
  await store.mutex.run(store.tabKey(tab.gid), async () => {
    const live =
      (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
    const row = rowOf(live, (r) => r[0] === before.category_slug && r[1] === before.key);
    if (!row) throw new NotFoundError("We couldn't find that column.");
    await store.google.sheets.updateRow(store.spreadsheetId, tab.gid, row, fieldToRow(after));
  });
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(after) as (keyof FieldDef)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = [before[k], after[k]];
  }
  if (Object.keys(changes).length > 0)
    await audit(store, actor, TAB.fields, `${after.category_slug}.${after.key}`, changes);
  await store.refresh();
  return after;
}

/** Swaps a column with its neighbour in the form order. */
export async function moveField(
  store: SheetStore,
  slug: string,
  key: string,
  direction: 'up' | 'down',
  actor: Actor,
): Promise<void> {
  const snap = await store.snapshot();
  const fields = [...(tabConfig(snap, slug)?.fields ?? [])]
    .filter((f) => !f.archived)
    .sort((a, b) => a.order - b.order);
  const i = fields.findIndex((f) => f.key === key);
  if (i < 0) throw new NotFoundError("We couldn't find that column.");
  const j = direction === 'up' ? i - 1 : i + 1;
  const a = fields[i] as FieldDef;
  const b = fields[j];
  if (!b) return;
  if (a.locked && b.locked) {
    throw new ValidationFailed([{ field: 'form', message: lockedMessage }]);
  }
  await writeField(store, a, { ...a, order: b.order }, actor);
  await writeField(store, b, { ...b, order: a.order }, actor);
}

/**
 * Permanent removal (§9 rule 12): a typed confirmation, and a backup first. The column's definition and its values are
 * removed. Archiving is the normal way and keeps the data.
 */
export async function removeField(
  store: SheetStore,
  slug: string,
  key: string,
  confirm: string,
  actor: Actor,
): Promise<{ backup_id: string }> {
  const snap = await store.snapshot();
  const cfg = tabConfig(snap, slug);
  const field = cfg?.fields.find((f) => f.key === key);
  if (!cfg || !field) throw new NotFoundError("We couldn't find that column.");
  if (field.locked) throw new ValidationFailed([{ field: 'form', message: lockedMessage }]);
  if (confirm.trim().toLowerCase() !== field.label.toLowerCase()) {
    throw new ValidationFailed([
      { field: 'confirm', message: `Please type the column's name, "${field.label}", to confirm.` },
    ]);
  }
  const backup = await backupNow(store, actor);

  const tab = await configTab(store, TAB.fields);
  await store.mutex.run(store.tabKey(tab.gid), async () => {
    const live =
      (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
    const row = rowOf(live, (r) => r[0] === slug && r[1] === key);
    if (row) await store.google.sheets.deleteRow(store.spreadsheetId, tab.gid, row);
  });
  // Clear the column's values and its header so nothing of it is left behind.
  const data = rowsOf(snap, slug);
  const col = data ? data.headers.indexOf(key) : -1;
  if (data && col >= 0) {
    const gid = cfg.tab.gid;
    await store.mutex.run(store.tabKey(gid), async () => {
      const rows = (await store.google.sheets.batchGet(store.spreadsheetId, [gid]))[gid] ?? [];
      const cleared = rows.map((r) => {
        const copy = [...r];
        if (col < copy.length) copy[col] = '';
        return copy;
      });
      if (cleared.length > 0)
        await store.google.sheets.updateRows(store.spreadsheetId, gid, 1, cleared);
    });
  }
  await audit(store, actor, TAB.fields, `${slug}.${key}`, { removed: [field.label, null] });
  await store.refresh();
  return { backup_id: backup.id };
}

// ---------- categories ----------

export interface CategoryPatch {
  name?: string;
  color?: string;
  default_workspace?: string;
  title_template?: string;
  active?: boolean;
}

export async function updateCategory(
  store: SheetStore,
  slug: string,
  patch: CategoryPatch,
  actor: Actor,
): Promise<CategoryDef> {
  const snap = await store.snapshot();
  const current = snap.config.categories.find((c) => c.slug === slug);
  if (!current) throw new NotFoundError("We couldn't find that category.");
  const issues: ValidationIssue[] = [];
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) issues.push({ field: 'name', message: 'Please give the category a name.' });
    else if (n.length > MAX_LABEL)
      issues.push({
        field: 'name',
        message: `Please keep the name under ${MAX_LABEL} characters.`,
      });
    else if (
      snap.config.categories.some(
        (c) => c.slug !== slug && c.name.toLowerCase() === n.toLowerCase(),
      )
    )
      issues.push({ field: 'name', message: `A category called "${n}" already exists.` });
  }
  if (patch.color !== undefined && !(CATEGORY_PALETTE as readonly string[]).includes(patch.color))
    issues.push({ field: 'color', message: 'Please choose a colour from the list.' });
  if (
    patch.default_workspace !== undefined &&
    !snap.config.workspaces.some((w) => w.slug === patch.default_workspace)
  )
    issues.push({
      field: 'default_workspace',
      message: 'Please choose a workspace from the list.',
    });
  if (patch.title_template !== undefined) {
    const known = new Set((tabConfig(snap, slug)?.fields ?? []).map((f) => f.key));
    for (const m of patch.title_template.matchAll(/\{(\w+)\}/g)) {
      if (!known.has(m[1] as string))
        issues.push({
          field: 'title_template',
          message: `"${m[1]}" is not a column of this category.`,
        });
    }
  }
  if (patch.active === false && snap.config.categories.filter((c) => c.active).length <= 1)
    issues.push({ field: 'form', message: 'At least one category must stay available.' });
  if (issues.length > 0) throw new ValidationFailed(issues);

  const next: CategoryDef = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name.trim().replace(/\s+/g, ' ') } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.default_workspace !== undefined
      ? { default_workspace: patch.default_workspace }
      : {}),
    ...(patch.title_template !== undefined ? { title_template: patch.title_template.trim() } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
  };
  const tab = await configTab(store, TAB.categories);
  await store.mutex.run(store.tabKey(tab.gid), async () => {
    const live =
      (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
    const row = rowOf(live, (r) => r[0] === slug);
    if (!row) throw new NotFoundError("We couldn't find that category.");
    await store.google.sheets.updateRow(store.spreadsheetId, tab.gid, row, categoryToRow(next));
  });
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(next) as (keyof CategoryDef)[]) {
    if (current[k] !== next[k]) changes[k] = [current[k], next[k]];
  }
  if (Object.keys(changes).length > 0) await audit(store, actor, TAB.categories, slug, changes);
  await store.refresh();
  return next;
}

/** A category with no meetings at all can be removed for good, with a typed name and a backup first (§9 rule 12). */
export async function removeCategory(
  store: SheetStore,
  slug: string,
  confirm: string,
  actor: Actor,
): Promise<{ backup_id: string }> {
  const snap = await store.snapshot();
  const category = snap.config.categories.find((c) => c.slug === slug);
  if (!category) throw new NotFoundError("We couldn't find that category.");
  if ((rowsOf(snap, slug)?.entries.size ?? 0) > 0) {
    throw new ValidationFailed([
      {
        field: 'form',
        message:
          'This category has meetings, so it cannot be removed. Hide it instead; its meetings and data are kept.',
      },
    ]);
  }
  if (snap.config.categories.length <= 1) {
    throw new ValidationFailed([{ field: 'form', message: 'At least one category must stay.' }]);
  }
  if (confirm.trim().toLowerCase() !== category.name.toLowerCase()) {
    throw new ValidationFailed([
      {
        field: 'confirm',
        message: `Please type the category's name, "${category.name}", to confirm.`,
      },
    ]);
  }
  const backup = await backupNow(store, actor);
  for (const title of [TAB.fields, TAB.categories]) {
    const tab = await configTab(store, title);
    await store.mutex.run(store.tabKey(tab.gid), async () => {
      // Delete from the bottom up so row numbers stay valid.
      const live =
        (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ?? [];
      const rows = live
        .map((r, i) => ({ r, row: i + 1 }))
        .filter(({ r, row }) => row > 1 && r[0] === slug)
        .reverse();
      for (const { row } of rows)
        await store.google.sheets.deleteRow(store.spreadsheetId, tab.gid, row);
    });
  }
  await audit(store, actor, TAB.categories, slug, { removed: [category.name, null] });
  await store.refresh();
  return { backup_id: backup.id };
}
