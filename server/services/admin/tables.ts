import { SYSTEM_COLUMNS, TAB } from '../../../shared/schema';
import type { Cell, FieldDef } from '../../../shared/types';
import { AppError, NotFoundError } from '../../lib/errors';
import { toMeeting } from '../meetingView';
import type { SheetStore } from '../store';

export type TableKind = 'category' | 'config' | 'log';

export interface TableInfo {
  /** The tab's title, used in URLs. */
  name: string;
  /** A friendlier name for the selector. */
  label: string;
  kind: TableKind;
  /** Cells can be edited in the grid (through the same rules as the rest of the app). */
  editable: boolean;
  rows: number | null;
  category_slug: string | null;
}

export interface GridColumn {
  key: string;
  label: string;
  type: string;
  /** Calculated or system: shown, never edited. */
  readonly: boolean;
  computed: boolean;
  options: string[];
}

export interface TableData {
  table: TableInfo;
  columns: GridColumn[];
  /** One object per row, keyed by column. `__id` is the meeting id (or the row number), `__rev` the version. */
  rows: Record<string, Cell>[];
  total: number;
}

const CONFIG_TABS: string[] = [TAB.categories, TAB.fields, TAB.workspaces, TAB.settings];

/** Every table the Admin grid can show: all but `_system`, which is never shown (§7.9 a). */
export async function listTables(store: SheetStore): Promise<TableInfo[]> {
  const snap = await store.snapshot();
  const bySlug = new Map(
    [...snap.config.byCategory.values()].map((c) => [c.tab.title, c.category] as const),
  );
  const out: TableInfo[] = [];
  for (const tab of snap.tabs) {
    if (tab.title === TAB.system) continue;
    const cat = bySlug.get(tab.title);
    const cached = snap.raw.get(tab.gid);
    const counted = cat
      ? [...(snap.categories.get(cat.slug)?.entries.values() ?? [])].length
      : cached
        ? Math.max(0, cached.length - 1)
        : null;
    out.push({
      name: tab.title,
      label: cat ? cat.name : tab.title,
      kind: cat ? 'category' : CONFIG_TABS.includes(tab.title) ? 'config' : 'log',
      editable: Boolean(cat),
      rows: counted,
      category_slug: cat?.slug ?? null,
    });
  }
  const order = (t: TableInfo) => (t.kind === 'category' ? 0 : t.kind === 'config' ? 1 : 2);
  return out.sort((a, b) => order(a) - order(b));
}

const text = (c: Cell) => String(c ?? '').toLowerCase();

/** The rows of one table. Category tabs come through the app's own reader, so calculated columns have values. */
export async function readTable(
  store: SheetStore,
  name: string,
  options: { q?: string; limit: number; offset: number },
): Promise<TableData> {
  const tables = await listTables(store);
  const table = tables.find((t) => t.name === name);
  if (!table) throw new NotFoundError("We couldn't find that table.");
  const snap = await store.snapshot();

  let columns: GridColumn[];
  let rows: Record<string, Cell>[];

  if (table.kind === 'category') {
    const cfg = snap.config.byCategory.get(table.category_slug as string)!;
    const data = snap.categories.get(table.category_slug as string)!;
    const fieldByKey = new Map<string, FieldDef>(cfg.fields.map((f) => [f.key, f]));
    const system = new Set<string>(SYSTEM_COLUMNS);
    columns = data.headers
      .filter((h) => h)
      .map((h) => {
        const f = fieldByKey.get(h);
        const isSystem = system.has(h);
        return {
          key: h,
          label: f?.label ?? h,
          type: f?.type ?? (isSystem ? 'system' : 'text'),
          readonly:
            isSystem ||
            !f ||
            f.type === 'computed' ||
            f.type === 'auto_number' ||
            f.type === 'file',
          computed: f?.type === 'computed',
          options: f?.options ?? [],
        };
      });
    rows = [...data.entries.entries()]
      .sort((a, b) => a[1].row - b[1].row)
      .map(([id, entry]) => {
        const m = toMeeting(store, snap, table.category_slug as string, entry);
        const row: Record<string, Cell> = {
          __id: id,
          __rev: m.rev,
          __deleted: Boolean(m.deleted_at),
        };
        for (const h of data.headers) {
          if (!h) continue;
          const f = fieldByKey.get(h);
          if (f?.type === 'computed') {
            const v = m.computed[h];
            row[h] = v === null || v === undefined ? '' : (v as Cell);
          } else if (h in entry.record.system) {
            row[h] = (entry.record.system as unknown as Record<string, Cell>)[h] ?? '';
          } else {
            const v = entry.record.values[h];
            row[h] = Array.isArray(v) ? v.join(', ') : (v ?? '');
          }
        }
        return row;
      });
  } else {
    const tab = snap.tabs.find((t) => t.title === name)!;
    const raw =
      snap.raw.get(tab.gid) ??
      (await store.google.sheets.batchGet(store.spreadsheetId, [tab.gid]))[tab.gid] ??
      [];
    const header = (raw[0] ?? []).map(String);
    columns = header
      .filter((h) => h)
      .map((h) => ({
        key: h,
        label: h,
        type: 'text',
        readonly: true,
        computed: false,
        options: [],
      }));
    rows = raw.slice(1).map((r, i) => {
      const row: Record<string, Cell> = { __id: String(i + 2) };
      header.forEach((h, c) => {
        if (h) row[h] = r[c] ?? '';
      });
      return row;
    });
    if (name === TAB.audit || name === TAB.reschedules) rows.reverse();
  }

  const q = options.q?.trim().toLowerCase();
  const matched = q
    ? rows.filter((r) =>
        Object.entries(r).some(([k, v]) => !k.startsWith('__') && text(v).includes(q)),
      )
    : rows;
  return {
    table,
    columns,
    rows: matched.slice(options.offset, options.offset + options.limit),
    total: matched.length,
  };
}

export function assertEditable(table: TableInfo | undefined): asserts table is TableInfo {
  if (!table) throw new NotFoundError("We couldn't find that table.");
  if (!table.editable) {
    throw new AppError(
      403,
      'read_only',
      'This table is read-only here. Change it in Columns & categories or Settings.',
    );
  }
}
