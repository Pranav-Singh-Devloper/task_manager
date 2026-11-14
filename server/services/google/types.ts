import type { Readable } from 'node:stream';
import type { Cell } from '../../../shared/types';

// ---------- Sheets ----------

export interface TabInfo {
  /** Stable sheet id (gid). Tabs are always referenced by gid, never by title. */
  gid: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface TabFormat {
  frozenRows?: number;
  frozenColumns?: number;
  /** Zero-based column indexes to hide in the Sheets UI. */
  hiddenColumns?: number[];
  /** Zero-based column index to note text, shown on the header cell. */
  headerNotes?: Record<number, string>;
  /** Protect the header row with a warning only. */
  protectHeader?: boolean;
  hidden?: boolean;
}

export interface SheetsRepo {
  getTabs(spreadsheetId: string): Promise<TabInfo[]>;
  addTab(spreadsheetId: string, title: string, rows?: number, columns?: number): Promise<TabInfo>;
  renameTab(spreadsheetId: string, gid: number, title: string): Promise<void>;
  /** One round trip for many tabs. Keys are gids. Rows may be ragged. */
  batchGet(spreadsheetId: string, gids: number[]): Promise<Record<number, Cell[][]>>;
  /** Read a single 1-based row, used to re-check the id cell before an update. */
  getRow(spreadsheetId: string, gid: number, row: number): Promise<Cell[]>;
  /** Append rows below the last used row. Returns the 1-based row of the first appended row. */
  appendRows(spreadsheetId: string, gid: number, rows: Cell[][]): Promise<number>;
  /** Overwrite one 1-based row starting at column A. Values are written RAW. */
  updateRow(spreadsheetId: string, gid: number, row: number, values: Cell[]): Promise<void>;
  /** Overwrite a block of rows starting at a 1-based row, column A. */
  updateRows(spreadsheetId: string, gid: number, startRow: number, rows: Cell[][]): Promise<void>;
  growGrid(spreadsheetId: string, gid: number, rows: number, columns: number): Promise<void>;
  formatTab(spreadsheetId: string, gid: number, format: TabFormat): Promise<void>;
}

// ---------- Drive ----------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink: string;
  parents: string[];
  appProperties: Record<string, string>;
  trashed: boolean;
  modifiedTime: string;
}

export interface UploadInput {
  name: string;
  mimeType: string;
  parentId: string;
  stream: Readable;
  appProperties?: Record<string, string>;
}

export interface DriveClient {
  createFolder(name: string, parentId?: string): Promise<DriveFile>;
  /** Find a folder by name under a parent, or create it. */
  ensureFolder(name: string, parentId?: string): Promise<DriveFile>;
  createSpreadsheetFile(name: string, appProperties: Record<string, string>): Promise<DriveFile>;
  findByAppProperties(props: Record<string, string>): Promise<DriveFile[]>;
  getFile(fileId: string): Promise<DriveFile>;
  uploadFile(input: UploadInput): Promise<DriveFile>;
  copyFile(
    fileId: string,
    name: string,
    parentId: string,
    appProperties: Record<string, string>,
  ): Promise<DriveFile>;
  setAppProperties(fileId: string, props: Record<string, string>): Promise<void>;
  trashFile(fileId: string): Promise<void>;
}

// ---------- Calendar ----------

export interface CalendarEventInput {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: string;
  reminders: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] };
  extendedProperties: { private: Record<string, string> };
  colorId?: string;
  status?: 'confirmed' | 'cancelled';
}

export type CalendarEvent = CalendarEventInput & { status: 'confirmed' | 'cancelled' };

export interface CalendarClient {
  /** Throws GoogleApiError(409) when the id already exists, including after a delete. */
  insertEvent(calendarId: string, event: CalendarEventInput): Promise<CalendarEvent>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;
  updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

// ---------- Mail (Phase 2 digest) ----------

export interface MailClient {
  send(message: { to: string; subject: string; html: string }): Promise<void>;
}

// ---------- Local state ----------

export interface JobStatus {
  lastRunAt: string;
  ok: boolean;
  message?: string;
}

export interface AppState {
  /** AES-256-GCM encrypted refresh token, base64. */
  refreshTokenEnc?: string;
  ownerEmail?: string;
  activeSpreadsheetId?: string;
  driveRootFolderId?: string;
  driveBackupsFolderId?: string;
  /** Scopes the owner has granted, so a missing scope can be requested again. */
  grantedScopes?: string[];
  /** Set when Google rejected the refresh token (invalid_grant). Cleared by the owner's next sign-in. */
  tokenInvalid?: boolean;
  /** More than one database file was found in Drive; shown in System health. */
  duplicateDatabases?: number;
  jobs: Record<string, JobStatus>;
}

export interface StateStore {
  /** Returns null when the state file is missing or unreadable. */
  read(): Promise<AppState | null>;
  write(state: AppState): Promise<void>;
}

export interface GoogleServices {
  mode: 'live' | 'mock';
  sheets: SheetsRepo;
  drive: DriveClient;
  calendar: CalendarClient;
  mail: MailClient;
  state: StateStore;
}
