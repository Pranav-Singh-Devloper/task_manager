import type { CalendarSyncState, FieldValue } from './types';
import type { Value } from './formula';

export interface SystemFields {
  id: string;
  rev: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string;
  calendar_event_id: string;
  calendar_sync: CalendarSyncState | '';
  previous_id: string;
  series_id: string;
  awaiting_next: boolean;
}

/** One row of the _files tab. The Sheet is the source of truth for files (§5.7). */
export interface FileRecord {
  id: string;
  meeting_id: string;
  category_slug: string;
  name: string;
  mime: string;
  size: number;
  drive_file_id: string;
  view_link: string;
  /** pending: uploaded, meeting not saved yet. attached: part of a saved meeting. removed: detached, in the Drive trash. */
  status: 'pending' | 'attached' | 'removed';
  uploaded_at: string;
}

/** A file as the screens show it. */
export type MeetingFile = Pick<FileRecord, 'id' | 'name' | 'mime' | 'size' | 'view_link'>;

/** A meeting as the API returns it: core and category fields together, computed values and a ready-made title. */
export interface Meeting {
  id: string;
  category_slug: string;
  rev: number;
  title: string;
  values: Record<string, FieldValue>;
  computed: Record<string, Value>;
  created_at: string;
  updated_at: string;
  created_by: string;
  deleted_at: string | null;
  calendar_event_id: string;
  calendar_sync: CalendarSyncState | '';
  previous_id: string;
  series_id: string;
  /** Attached files, oldest first. */
  files: MeetingFile[];
  /** The last sitting is done and the next date is not decided yet. */
  awaiting_next: boolean;
  /** How many times it has been rescheduled. */
  reschedule_count: number;
  /** Cells that could not be read, in plain words ("needs attention"). */
  needs_attention: string[];
  /** Required fields that are empty: the "Incomplete" chip. */
  incomplete: string[];
}
