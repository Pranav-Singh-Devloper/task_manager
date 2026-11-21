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
  /** Track: a list of states, each with the date it was reached. One "Name (YYYY-MM-DD)" per line in the Sheet. */
  'stages',
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

/** What a tracker is for. Its dashboard tiles follow from this; "custom" trackers get the general set. */
export const TRACKER_KINDS = [
  'award',
  'discussion',
  'dpr',
  'track',
  'observation',
  'custom',
] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

/**
 * Which columns play which part. The dashboard reads these, so a column can be renamed or a new tracker made
 * without any code: the tiles follow the roles.
 */
export interface TrackerRoles {
  /** The column that names a row (project, topic, event). */
  title_key: string;
  /** The status or stage column. */
  status_key: string;
  /** Status values that mean "finished": these rows are not open. */
  closed_values: string[];
  /** The date that matters: bid due date, target date, completion date. Overdue and "due soon" read this. */
  due_key: string;
  /** Rows are grouped by this column in the breakdown: person, consultant, mode. */
  group_key: string;
  /** Number columns that are added up, such as km or ₹ Cr. */
  sum_keys: string[];
  /** Award Plan: the date a project was awarded, for "awarded this year". */
  done_date_key: string;
  /** Track: the column that holds the states. */
  stages_key: string;
  /** A step-by-step column shown as a pipeline, such as DPR's present stage. */
  stage_key: string;
}

export interface TrackerTargets {
  /** Award Plan: this financial year's target, in km and ₹ Cr. Blank until set. */
  km: number | null;
  cr: number | null;
}

export interface TrackerSettings {
  roles: TrackerRoles;
  targets: TrackerTargets;
}

export interface TrackerDef {
  slug: string;
  name: string;
  /** Singular, for buttons: "Add project". */
  item_name: string;
  kind: TrackerKind;
  color: string;
  sort: number;
  active: boolean;
  sheet_gid: number | null;
  settings: TrackerSettings;
  is_seed: boolean;
  created_at: string;
}
