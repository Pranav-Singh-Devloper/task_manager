/** Types shared by the server and the browser. */

export type Cell = string | number | boolean | null;

export const FIELD_TYPES = [
  'text',
  'long_text',
  'number',
  'date',
  'time',
  'select',
  'multi_select',
  'checkbox',
  'url',
  'file',
  'auto_number',
  'computed',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const MEETING_STATUSES = ['Scheduled', 'Rescheduled', 'Completed', 'Cancelled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const CALENDAR_SYNC_STATES = ['ok', 'pending', 'error', 'none'] as const;
export type CalendarSyncState = (typeof CALENDAR_SYNC_STATES)[number];

export interface WorkspaceDef {
  slug: string;
  name: string;
  color: string;
  sort: number;
}

export interface CategoryDef {
  slug: string;
  name: string;
  color: string;
  sort: number;
  active: boolean;
  default_workspace: string;
  title_template: string;
  sheet_gid: number | null;
  is_seed: boolean;
  created_at: string;
}

export interface FieldDef {
  category_slug: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  allow_new_options: boolean;
  default_value: string;
  help_text: string;
  placeholder: string;
  unit: string;
  order: number;
  show_in_form: boolean;
  show_in_table: boolean;
  searchable: boolean;
  case_key: boolean;
  computed_expr: string;
  locked: boolean;
  archived: boolean;
  created_at: string;
}

export type SettingKey =
  | 'timezone'
  | 'default_duration_min'
  | 'default_reminders'
  | 'calendar_id'
  | 'week_starts_on'
  | 'time_format'
  | 'digest_enabled'
  | 'digest_time'
  | 'digest_email'
  | 'max_upload_mb';

export type Settings = Record<SettingKey, string>;

export type UserRole = 'owner' | 'admin';

/** A field value as the app holds it: dates as YYYY-MM-DD, times as HH:mm, multi-selects as a list. */
export type FieldValue = string | number | boolean | string[] | null;

export interface ValidationIssue {
  /** The field key, or "form" for a problem with the form as a whole. */
  field: string;
  /** Plain language, safe to show next to the field. */
  message: string;
}
