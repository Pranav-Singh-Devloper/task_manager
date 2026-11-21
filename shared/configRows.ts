import { fullRoles } from './trackerSeed';
import {
  FIELD_TYPES,
  TRACKER_KINDS,
  type CategoryDef,
  type TrackerDef,
  type TrackerKind,
  type TrackerSettings,
  type Cell,
  type FieldDef,
  type FieldType,
  type Settings,
  type WorkspaceDef,
} from './types';
import { DEFAULT_SETTINGS } from './schema';

const str = (v: Cell | undefined): string =>
  v === null || v === undefined ? '' : String(v).trim();
const bool = (v: Cell | undefined): boolean => v === true || /^true$/i.test(str(v));
const num = (v: Cell | undefined, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(str(v));
  return Number.isFinite(n) ? n : fallback;
};

export function rowToObject(headers: Cell[], row: Cell[]): Record<string, Cell> {
  const obj: Record<string, Cell> = {};
  headers.forEach((h, i) => {
    const key = str(h);
    if (key) obj[key] = row[i] ?? null;
  });
  return obj;
}

export interface ParseResult<T> {
  items: T[];
  /** Plain-language reasons rows were skipped, shown in Admin, System health. */
  problems: string[];
}

function table(rows: Cell[][]): { headers: Cell[]; body: Cell[][] } {
  return { headers: rows[0] ?? [], body: rows.slice(1) };
}

export function parseWorkspaces(rows: Cell[][]): ParseResult<WorkspaceDef> {
  const { headers, body } = table(rows);
  const result: ParseResult<WorkspaceDef> = { items: [], problems: [] };
  body.forEach((r, i) => {
    const o = rowToObject(headers, r);
    if (!str(o.slug)) return;
    result.items.push({
      slug: str(o.slug),
      name: str(o.name) || str(o.slug),
      color: str(o.color) || '#334155',
      sort: num(o.sort, i + 1),
    });
  });
  return { ...result, items: result.items.sort((a, b) => a.sort - b.sort) };
}

export function parseCategories(rows: Cell[][]): ParseResult<CategoryDef> {
  const { headers, body } = table(rows);
  const result: ParseResult<CategoryDef> = { items: [], problems: [] };
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const o = rowToObject(headers, r);
    const slug = str(o.slug);
    if (!slug) return;
    if (seen.has(slug)) {
      result.problems.push(
        `Category "${slug}" appears twice in the _categories tab (row ${i + 2}). The second one is ignored.`,
      );
      return;
    }
    seen.add(slug);
    const gid = str(o.sheet_gid);
    result.items.push({
      slug,
      name: str(o.name) || slug,
      color: str(o.color) || '#334155',
      sort: num(o.sort, i + 1),
      active: o.active === null || o.active === '' ? true : bool(o.active),
      default_workspace: str(o.default_workspace),
      title_template: str(o.title_template),
      sheet_gid: gid === '' ? null : num(o.sheet_gid, 0),
      is_seed: bool(o.is_seed),
      created_at: str(o.created_at),
    });
  });
  return { ...result, items: result.items.sort((a, b) => a.sort - b.sort) };
}

/** Reads a tracker's settings cell. A cell that is not valid JSON gives the default roles, never an error. */
function trackerSettings(raw: string): { settings: TrackerSettings; ok: boolean } {
  const fallback: TrackerSettings = {
    roles: fullRoles(undefined),
    targets: { km: null, cr: null },
    calendar: false,
  };
  if (!raw) return { settings: fallback, ok: true };
  try {
    const parsed = JSON.parse(raw) as Partial<TrackerSettings> | null;
    if (!parsed || typeof parsed !== 'object') return { settings: fallback, ok: false };
    const roles = fullRoles(
      parsed.roles && typeof parsed.roles === 'object' ? parsed.roles : undefined,
    );
    const asList = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    const asNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    return {
      settings: {
        roles: {
          ...roles,
          closed_values: asList(roles.closed_values),
          sum_keys: asList(roles.sum_keys),
        },
        targets: { km: asNum(parsed.targets?.km), cr: asNum(parsed.targets?.cr) },
        calendar: parsed.calendar === true,
      },
      ok: true,
    };
  } catch {
    return { settings: fallback, ok: false };
  }
}

export function parseTrackers(rows: Cell[][]): ParseResult<TrackerDef> {
  const { headers, body } = table(rows);
  const result: ParseResult<TrackerDef> = { items: [], problems: [] };
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const o = rowToObject(headers, r);
    const slug = str(o.slug);
    if (!slug) return;
    if (seen.has(slug)) {
      result.problems.push(
        `Tracker "${slug}" appears twice in the _trackers tab (row ${i + 2}). The second one is ignored.`,
      );
      return;
    }
    seen.add(slug);
    const kind = str(o.kind);
    const parsed = trackerSettings(str(o.settings));
    if (!parsed.ok) {
      result.problems.push(
        `The settings of tracker "${slug}" (row ${i + 2}) could not be read, so its dashboard uses the defaults.`,
      );
    }
    const gid = str(o.sheet_gid);
    result.items.push({
      slug,
      name: str(o.name) || slug,
      item_name: str(o.item_name) || 'item',
      kind: (TRACKER_KINDS as readonly string[]).includes(kind) ? (kind as TrackerKind) : 'custom',
      color: str(o.color) || '#334155',
      sort: num(o.sort, i + 1),
      active: o.active === null || o.active === '' ? true : bool(o.active),
      sheet_gid: gid === '' ? null : num(o.sheet_gid, 0),
      settings: parsed.settings,
      is_seed: bool(o.is_seed),
      created_at: str(o.created_at),
    });
  });
  return { ...result, items: result.items.sort((a, b) => a.sort - b.sort) };
}

export function parseFields(rows: Cell[][]): ParseResult<FieldDef> {
  const { headers, body } = table(rows);
  const result: ParseResult<FieldDef> = { items: [], problems: [] };
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const o = rowToObject(headers, r);
    const rowNo = i + 2;
    const slug = str(o.category_slug);
    const key = str(o.key);
    if (!slug && !key) return;
    const where = `_fields row ${rowNo} (${slug || '?'} / ${key || '?'})`;
    if (!slug || !key) {
      result.problems.push(`${where} is missing its category or key, so it was skipped.`);
      return;
    }
    const id = `${slug}:${key}`;
    if (seen.has(id)) {
      result.problems.push(`${where} repeats a field that already exists, so it was skipped.`);
      return;
    }
    if (!(FIELD_TYPES as readonly string[]).includes(str(o.type))) {
      result.problems.push(`${where} has an unknown type "${str(o.type)}", so it was skipped.`);
      return;
    }
    let options: string[] = [];
    const rawOptions = str(o.options);
    if (rawOptions) {
      try {
        const parsed: unknown = JSON.parse(rawOptions);
        if (!Array.isArray(parsed)) throw new Error('not a list');
        options = parsed.map(String);
      } catch {
        result.problems.push(`${where} has options that are not a valid list, so it was skipped.`);
        return;
      }
    }
    seen.add(id);
    result.items.push({
      category_slug: slug,
      key,
      label: str(o.label) || key,
      type: str(o.type) as FieldType,
      required: bool(o.required),
      options,
      allow_new_options: bool(o.allow_new_options),
      default_value: str(o.default_value),
      help_text: str(o.help_text),
      placeholder: str(o.placeholder),
      unit: str(o.unit),
      order: num(o.order, 1000 + i),
      show_in_form: o.show_in_form === null || o.show_in_form === '' ? true : bool(o.show_in_form),
      show_in_table: bool(o.show_in_table),
      searchable: o.searchable === null || o.searchable === '' ? true : bool(o.searchable),
      case_key: bool(o.case_key),
      computed_expr: str(o.computed_expr),
      locked: bool(o.locked),
      archived: bool(o.archived),
      created_at: str(o.created_at),
    });
  });
  return result;
}

export function parseSettings(rows: Cell[][]): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows.slice(1)) {
    const key = str(r[0]);
    if (key in settings && str(r[1]) !== '') (settings as Record<string, string>)[key] = str(r[1]);
  }
  return settings;
}
