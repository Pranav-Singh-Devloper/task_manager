import type { Cell, CategoryDef, FieldDef, Settings, WorkspaceDef } from './types';

/** Columns every category tab has at the far right. Hidden in the Sheets UI, never in forms. */
export const SYSTEM_COLUMNS = [
  'id',
  'rev',
  'created_at',
  'updated_at',
  'created_by',
  'deleted_at',
  'calendar_event_id',
  'calendar_sync',
  'previous_id',
  'series_id',
] as const;
export type SystemColumn = (typeof SYSTEM_COLUMNS)[number];

export const WORKSPACE_HEADERS = ['slug', 'name', 'color', 'sort'] as const;

export const CATEGORY_HEADERS = [
  'slug',
  'name',
  'color',
  'sort',
  'active',
  'default_workspace',
  'title_template',
  'sheet_gid',
  'is_seed',
  'created_at',
] as const;

export const FIELD_HEADERS = [
  'category_slug',
  'key',
  'label',
  'type',
  'required',
  'options',
  'allow_new_options',
  'default_value',
  'help_text',
  'placeholder',
  'unit',
  'order',
  'show_in_form',
  'show_in_table',
  'searchable',
  'case_key',
  'computed_expr',
  'locked',
  'archived',
  'created_at',
] as const;

export const SETTINGS_HEADERS = ['key', 'value'] as const;

export const TASK_HEADERS = [
  'id',
  'title',
  'meeting_id',
  'category_slug',
  'owner',
  'due_date',
  'status',
  'priority',
  'workspace',
  'created_at',
  'completed_at',
  'deleted_at',
  'rev',
] as const;

export const FILE_HEADERS = [
  'id',
  'meeting_id',
  'category_slug',
  'name',
  'mime',
  'size',
  'drive_file_id',
  'view_link',
  'status',
  'uploaded_at',
] as const;

export const RESCHEDULE_HEADERS = [
  'id',
  'meeting_id',
  'category_slug',
  'old_date',
  'old_start',
  'old_end',
  'new_date',
  'new_start',
  'new_end',
  'reason',
  'source',
  'changed_at',
] as const;

export const AUDIT_HEADERS = [
  'id',
  'ts',
  'user_email',
  'action',
  'table',
  'row_id',
  'changes',
  'source',
] as const;

export const LOOKUP_HEADERS = [
  'field_key',
  'category_slug',
  'value',
  'count',
  'last_used',
] as const;

export const SYSTEM_TAB_HEADERS = ['key', 'value'] as const;

/** Names of the non-category tabs. Config and log tabs start with an underscore. */
export const TAB = {
  tasks: 'Tasks',
  categories: '_categories',
  fields: '_fields',
  workspaces: '_workspaces',
  settings: '_settings',
  files: '_files',
  reschedules: '_reschedules',
  audit: '_audit',
  lookups: '_lookups',
  system: '_system',
} as const;

export const FIXED_TAB_HEADERS: Record<string, readonly string[]> = {
  [TAB.tasks]: TASK_HEADERS,
  [TAB.categories]: CATEGORY_HEADERS,
  [TAB.fields]: FIELD_HEADERS,
  [TAB.workspaces]: WORKSPACE_HEADERS,
  [TAB.settings]: SETTINGS_HEADERS,
  [TAB.files]: FILE_HEADERS,
  [TAB.reschedules]: RESCHEDULE_HEADERS,
  [TAB.audit]: AUDIT_HEADERS,
  [TAB.lookups]: LOOKUP_HEADERS,
  [TAB.system]: SYSTEM_TAB_HEADERS,
};

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  timezone: 'Asia/Kolkata',
  default_duration_min: '60',
  default_reminders: '1440,60',
  calendar_id: 'primary',
  week_starts_on: 'monday',
  time_format: '12h',
  digest_enabled: 'FALSE',
  digest_time: '08:00',
  digest_email: '',
  max_upload_mb: '50',
};

// ---------- row serialisation (config tabs) ----------

const bool = (v: boolean): Cell => (v ? 'TRUE' : 'FALSE');

export function workspaceToRow(w: WorkspaceDef): Cell[] {
  return [w.slug, w.name, w.color, w.sort];
}

export function categoryToRow(c: CategoryDef): Cell[] {
  return [
    c.slug,
    c.name,
    c.color,
    c.sort,
    bool(c.active),
    c.default_workspace,
    c.title_template,
    c.sheet_gid,
    bool(c.is_seed),
    c.created_at,
  ];
}

export function fieldToRow(f: FieldDef): Cell[] {
  return [
    f.category_slug,
    f.key,
    f.label,
    f.type,
    bool(f.required),
    JSON.stringify(f.options),
    bool(f.allow_new_options),
    f.default_value,
    f.help_text,
    f.placeholder,
    f.unit,
    f.order,
    bool(f.show_in_form),
    bool(f.show_in_table),
    bool(f.searchable),
    bool(f.case_key),
    f.computed_expr,
    bool(f.locked),
    bool(f.archived),
    f.created_at,
  ];
}

/** Header row of a category tab: its non-archived field keys in order, then the system columns. */
export function categoryTabHeaders(fields: FieldDef[]): string[] {
  const keys = fields
    .filter((f) => !f.archived)
    .sort((a, b) => a.order - b.order)
    .map((f) => f.key);
  return [...keys, ...SYSTEM_COLUMNS];
}

/** Characters Google Sheets does not allow in a tab title. */
export function sheetTitleFor(name: string): string {
  return (
    name
      .replace(/[:\\/?*[\]]/g, '_')
      .trim()
      .slice(0, 100) || 'Untitled'
  );
}

/** Turns an object into a row in header order. Missing values become empty cells. */
export function rowFromObject(
  headers: readonly string[],
  obj: Record<string, Cell | undefined>,
): Cell[] {
  return headers.map((h) => obj[h] ?? '');
}
