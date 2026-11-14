import { parseDateLoose, parseTimeLoose } from './dates';
import type { Value } from './formula';
import type { FieldType, FieldValue } from './types';

/**
 * The filter builder (§7.2): add a filter, pick a column, pick an operator that makes sense for that kind of column,
 * enter a value. The same rules run on the server and in the browser, so what the builder offers is what the server understands.
 */
export const FILTER_OPS = [
  'contains',
  'is',
  'is_not',
  'before',
  'after',
  'between',
  'is_empty',
  'is_not_empty',
  'greater',
  'less',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export interface FilterSpec {
  /** A field key, or "title" or "category". */
  field: string;
  op: FilterOp;
  value?: string;
  /** The upper end of "between". */
  value2?: string;
}

/** What kind of value a column holds, for choosing operators. */
export type FilterKind = 'text' | 'number' | 'date' | 'time' | 'checkbox';

export function kindOf(type: FieldType | 'title' | 'category'): FilterKind {
  switch (type) {
    case 'number':
    case 'computed':
      return 'number';
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'checkbox':
      return 'checkbox';
    default:
      return 'text';
  }
}

const EMPTINESS: FilterOp[] = ['is_empty', 'is_not_empty'];

export function opsFor(kind: FilterKind): FilterOp[] {
  switch (kind) {
    case 'number':
      return ['is', 'is_not', 'greater', 'less', 'between', ...EMPTINESS];
    case 'date':
    case 'time':
      return ['is', 'before', 'after', 'between', ...EMPTINESS];
    case 'checkbox':
      return ['is'];
    default:
      return ['contains', 'is', 'is_not', ...EMPTINESS];
  }
}

export const needsValue = (op: FilterOp) => op !== 'is_empty' && op !== 'is_not_empty';
export const needsSecondValue = (op: FilterOp) => op === 'between';

const isEmptyValue = (v: unknown) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Lower-case text for each item: a multi-select is a list, anything else is one item. */
const textsOf = (v: FieldValue | Value | undefined): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : [String(v ?? '').toLowerCase()];

/**
 * Does one value satisfy one filter? A meeting whose category has no such column counts as having an empty value,
 * so "is empty" matches it and "is" never does. A filter whose value cannot be read matches nothing.
 */
export function filterMatches(
  spec: FilterSpec,
  value: FieldValue | Value | undefined,
  kind: FilterKind,
): boolean {
  const empty = isEmptyValue(value);
  if (spec.op === 'is_empty') return empty;
  if (spec.op === 'is_not_empty') return !empty;

  const want = (spec.value ?? '').trim();
  if (kind === 'checkbox')
    return spec.op === 'is' && (value === true) === (want.toLowerCase() === 'yes');

  if (kind === 'number') {
    const a = Number(want.replace(/,/g, ''));
    const b = Number((spec.value2 ?? '').replace(/,/g, ''));
    if (!Number.isFinite(a)) return false;
    if (spec.op === 'is_not') return empty || Number(value) !== a;
    if (empty || typeof value === 'boolean') return false;
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    switch (spec.op) {
      case 'is':
        return n === a;
      case 'greater':
        return n > a;
      case 'less':
        return n < a;
      case 'between':
        return Number.isFinite(b) && n >= Math.min(a, b) && n <= Math.max(a, b);
      default:
        return false;
    }
  }

  if (kind === 'date' || kind === 'time') {
    const read = kind === 'date' ? parseDateLoose : parseTimeLoose;
    const a = read(want);
    const b = read(spec.value2 ?? '');
    if (!a) return false;
    if (empty || typeof value !== 'string') return false;
    switch (spec.op) {
      case 'is':
        return value === a;
      case 'before':
        return value < a;
      case 'after':
        return value > a;
      case 'between':
        return !!b && value >= (a < b ? a : b) && value <= (a < b ? b : a);
      default:
        return false;
    }
  }

  // Text, choices and lists.
  const needle = want.toLowerCase();
  const items = textsOf(value);
  switch (spec.op) {
    case 'contains':
      return needle !== '' && items.some((t) => t.includes(needle));
    case 'is':
      return needle !== '' && items.some((t) => t === needle);
    case 'is_not':
      return !items.some((t) => t === needle);
    default:
      return false;
  }
}

/** A filter that can be sent: the operator fits the column, and a value is present when one is needed. */
export function filterIsComplete(spec: FilterSpec, kind: FilterKind): boolean {
  if (!opsFor(kind).includes(spec.op)) return false;
  if (needsValue(spec.op) && !(spec.value ?? '').trim()) return false;
  if (needsSecondValue(spec.op) && !(spec.value2 ?? '').trim()) return false;
  return true;
}
