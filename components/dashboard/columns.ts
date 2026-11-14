import type { Meta } from '@/lib/queries';
import type { FieldDef } from '@/shared/types';

/** Fields that already have a place in every row, so they are not offered again as extra columns. */
const ALREADY_SHOWN = new Set([
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
]);

export type SortKind = 'date' | 'text' | 'number';

export interface Col {
  id: string;
  label: string;
  /** What to send as `sort`. Missing means the column cannot be sorted (Join, Actions). */
  sortKey?: string;
  sortKind: SortKind;
  defaultVisible: boolean;
  /** Always shown: the title, so a row can always be opened, and the actions. */
  fixed?: boolean;
  field?: FieldDef;
}

/**
 * The table's columns (§7.2): Time, Category, Meeting, Status, Join and Reschedule, plus, when one category is chosen,
 * that category's own columns. Files shows how many files a meeting has.
 */
export function buildColumns(
  meta: Meta,
  category: string,
  words: {
    time: string;
    category: string;
    meeting: string;
    status: string;
    join: string;
    files: string;
    actions: string;
  },
): Col[] {
  const base: Col[] = [
    { id: 'time', label: words.time, sortKey: 'date', sortKind: 'date', defaultVisible: true },
    {
      id: 'category',
      label: words.category,
      sortKey: 'category',
      sortKind: 'text',
      defaultVisible: true,
    },
    {
      id: 'title',
      label: words.meeting,
      sortKey: 'title',
      sortKind: 'text',
      defaultVisible: true,
      fixed: true,
    },
    {
      id: 'status',
      label: words.status,
      sortKey: 'status',
      sortKind: 'text',
      defaultVisible: true,
    },
    { id: 'join', label: words.join, sortKind: 'text', defaultVisible: true },
    { id: 'files', label: words.files, sortKind: 'text', defaultVisible: true },
    { id: 'actions', label: words.actions, sortKind: 'text', defaultVisible: true, fixed: true },
  ];
  if (!category) return base;
  const own = meta.fields
    .filter(
      (f) =>
        f.category_slug === category &&
        !f.archived &&
        !ALREADY_SHOWN.has(f.key) &&
        f.type !== 'file' &&
        f.type !== 'auto_number',
    )
    .sort((a, b) => a.order - b.order)
    .map<Col>((f) => ({
      id: `f:${f.key}`,
      label: f.label,
      sortKey: f.key,
      sortKind:
        f.type === 'number' || f.type === 'computed'
          ? 'number'
          : f.type === 'date'
            ? 'date'
            : 'text',
      defaultVisible: f.show_in_table,
      field: f,
    }));
  // The category's own columns sit between Meeting and Status.
  const at = base.findIndex((c) => c.id === 'status');
  return [...base.slice(0, at), ...own, ...base.slice(at)];
}

export interface Chosen {
  on: string[];
  off: string[];
}

export const isVisible = (col: Col, chosen: Chosen | undefined): boolean =>
  col.fixed
    ? true
    : chosen?.on.includes(col.id)
      ? true
      : chosen?.off.includes(col.id)
        ? false
        : col.defaultVisible;

/** The words for the direction of a sort, matching the kind of column ("oldest first", "A to Z", "lowest first"). */
export function orderKey(
  kind: SortKind,
  dir: 'asc' | 'desc',
): 'orderOldest' | 'orderNewest' | 'orderAZ' | 'orderZA' | 'orderLow' | 'orderHigh' {
  if (kind === 'date') return dir === 'asc' ? 'orderOldest' : 'orderNewest';
  if (kind === 'number') return dir === 'asc' ? 'orderLow' : 'orderHigh';
  return dir === 'asc' ? 'orderAZ' : 'orderZA';
}
