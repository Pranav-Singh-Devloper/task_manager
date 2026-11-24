import type { SystemFields } from '../../shared/meeting';
import { parseDateLoose, parseTimeLoose } from '../../shared/dates';
import { SYSTEM_COLUMNS } from '../../shared/schema';
import type { CalendarSyncState, Cell, FieldDef, FieldValue } from '../../shared/types';
import { CALENDAR_SYNC_STATES } from '../../shared/types';

export interface RowRecord {
  values: Record<string, FieldValue>;
  system: SystemFields;
  /** Cells that could not be read: a small "needs attention" marker, never a crash (§4.6). */
  problems: string[];
}

const text = (c: Cell | undefined): string =>
  c === null || c === undefined ? '' : String(c).trim();
const isSystem = (key: string) => (SYSTEM_COLUMNS as readonly string[]).includes(key);

function readValue(f: FieldDef, raw: Cell | undefined, problems: string[]): FieldValue {
  const s = text(raw);
  if (s === '') return f.type === 'checkbox' ? false : null;
  switch (f.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(s.replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
      problems.push(`${f.label}: "${s}" is not a number.`);
      return null;
    }
    case 'date': {
      const d = parseDateLoose(raw);
      if (d) return d;
      problems.push(`${f.label}: "${s}" is not a date.`);
      return null;
    }
    case 'time': {
      const t = parseTimeLoose(raw);
      if (t) return t;
      problems.push(`${f.label}: "${s}" is not a time.`);
      return null;
    }
    case 'checkbox':
      return raw === true || /^(true|yes|y|1)$/i.test(s);
    case 'stages':
      return s
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean);
    case 'multi_select':
      return s
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    case 'auto_number': {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    default:
      return s;
  }
}

/** Reads one Sheet row by header name. Padded, ragged and re-ordered rows are fine. Computed columns are not stored. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Reads a tab's heading row as column keys. A heading someone retyped in the Sheet ("BDD" for bdd, or the column's
 * name, "BDD (Bid Due Date)") still counts for its column, ignoring capitals, spaces and punctuation. A heading
 * that is exactly a key wins over a retyped one, and each column is matched once.
 */
export function headingKeys(raw: string[], fields: FieldDef[]): string[] {
  const wanted = [
    ...fields.map((f) => ({ key: f.key, label: f.label })),
    ...SYSTEM_COLUMNS.map((k) => ({ key: k as string, label: k as string })),
  ];
  const isKey = new Set(wanted.map((w) => w.key));
  const taken = new Set(raw.filter((h) => isKey.has(h)));
  return raw.map((h) => {
    if (isKey.has(h)) return h;
    const s = squash(h);
    if (!s) return h;
    const w = wanted.find(
      (x) => !taken.has(x.key) && (squash(x.key) === s || squash(x.label) === s),
    );
    if (!w) return h;
    taken.add(w.key);
    return w.key;
  });
}

export function parseRow(headers: string[], row: Cell[], fields: FieldDef[]): RowRecord {
  const at = (key: string): Cell | undefined => {
    const i = headers.indexOf(key);
    return i >= 0 ? row[i] : undefined;
  };
  const problems: string[] = [];
  const values: Record<string, FieldValue> = {};
  for (const f of fields) {
    if (f.type === 'computed') continue;
    values[f.key] = readValue(f, at(f.key), problems);
  }
  const sync = text(at('calendar_sync'));
  const rev = Number(text(at('rev')));
  return {
    values,
    problems,
    system: {
      id: text(at('id')),
      rev: Number.isFinite(rev) ? rev : 0,
      created_at: text(at('created_at')),
      updated_at: text(at('updated_at')),
      created_by: text(at('created_by')),
      deleted_at: text(at('deleted_at')),
      calendar_event_id: text(at('calendar_event_id')),
      calendar_sync: (CALENDAR_SYNC_STATES as readonly string[]).includes(sync)
        ? (sync as CalendarSyncState)
        : '',
      previous_id: text(at('previous_id')),
      series_id: text(at('series_id')),
      awaiting_next:
        /^(true|yes|1)$/i.test(text(at('awaiting_next'))) || at('awaiting_next') === true,
    },
  };
}

function writeValue(v: FieldValue | undefined): Cell {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/**
 * Builds the row to write. Starts from the row as it is now, so columns the app does not manage
 * (ones the owner added by hand) are never wiped. Computed columns are left blank.
 */
export function serializeRow(
  headers: string[],
  base: Cell[],
  values: Record<string, FieldValue>,
  system: SystemFields,
  fields: FieldDef[],
): Cell[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: Cell[] = headers.map((_, i) => base[i] ?? '');
  headers.forEach((h, i) => {
    if (isSystem(h)) {
      const v = (system as unknown as Record<string, Cell>)[h];
      // A true flag is written as TRUE and a false one as an empty cell, so the Sheet stays tidy.
      out[i] = typeof v === 'boolean' ? (v ? 'TRUE' : '') : (v ?? '');
      return;
    }
    const f = byKey.get(h);
    if (!f) return; // an unmanaged column: keep what is there
    const v = values[h];
    out[i] =
      f.type === 'computed'
        ? ''
        : f.type === 'stages' && Array.isArray(v)
          ? v.join('\n')
          : writeValue(v);
  });
  return out;
}
