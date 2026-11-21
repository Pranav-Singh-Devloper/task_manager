import { SCHEMA_VERSION, TAB, SYSTEM_TAB_HEADERS } from '../../shared/schema';
import { GoogleApiError } from './google/errors';
import type { AppState, GoogleServices } from './google/types';
import { DATABASE_APP_PROPERTIES, createDatabase } from './databaseSeed';
import { addTrackers, calendarForSeedLists, hideKindsNowLists } from './migrations';

export interface Migration {
  /** The schema version this migration brings the database to. */
  version: number;
  /** Must be safe to run twice. */
  run: (google: Pick<GoogleServices, 'sheets' | 'drive'>, spreadsheetId: string) => Promise<void>;
}

/** Version 1 is what createDatabase writes. Every later change to the database's shape is a migration here. */
export const MIGRATIONS: Migration[] = [
  { version: 2, run: addTrackers },
  { version: 3, run: calendarForSeedLists },
  { version: 4, run: hideKindsNowLists },
];

export interface BootstrapOptions {
  /** SPREADSHEET_ID override. */
  spreadsheetId?: string;
  now?: Date;
  migrations?: Migration[];
}

export interface BootstrapResult {
  spreadsheetId: string;
  /** True when this run created a new database. */
  created: boolean;
  driveRootFolderId: string;
  driveBackupsFolderId: string;
  duplicateDatabases: number;
}

async function usable(google: Pick<GoogleServices, 'sheets'>, id: string): Promise<boolean> {
  try {
    await google.sheets.getTabs(id);
    return true;
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 403)) return false;
    throw err;
  }
}

/**
 * First-run setup (§5.5). Safe to run any number of times: it finds the database before it ever creates one.
 * Order: saved id, SPREADSHEET_ID, then a Drive search by appProperties. Only then a new database.
 */
export async function bootstrap(
  google: GoogleServices,
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const state: AppState = (await google.state.read()) ?? { jobs: {} };
  let spreadsheetId: string | undefined;
  let created = false;
  let duplicates = 0;

  if (state.activeSpreadsheetId && (await usable(google, state.activeSpreadsheetId))) {
    spreadsheetId = state.activeSpreadsheetId;
  }

  if (!spreadsheetId && options.spreadsheetId) {
    if (!(await usable(google, options.spreadsheetId))) {
      throw new Error(
        'SPREADSHEET_ID is set but that spreadsheet could not be opened. Remove it to let the app find or create its own database.',
      );
    }
    spreadsheetId = options.spreadsheetId;
  }

  if (!spreadsheetId) {
    const found = await google.drive.findByAppProperties({ ...DATABASE_APP_PROPERTIES });
    duplicates = Math.max(0, found.length - 1);
    // findByAppProperties returns the most recently modified first.
    if (found[0]) spreadsheetId = found[0].id;
  }

  if (!spreadsheetId) {
    spreadsheetId = (await createDatabase(google, options.now ?? new Date())).spreadsheetId;
    created = true;
  }

  const root = await google.drive.ensureFolder('Meetings Manager');
  const backups = await google.drive.ensureFolder('Backups', root.id);

  await runMigrations(google, spreadsheetId, options.migrations ?? MIGRATIONS);

  await google.state.write({
    ...state,
    activeSpreadsheetId: spreadsheetId,
    driveRootFolderId: root.id,
    driveBackupsFolderId: backups.id,
    duplicateDatabases: duplicates,
  });

  return {
    spreadsheetId,
    created,
    driveRootFolderId: root.id,
    driveBackupsFolderId: backups.id,
    duplicateDatabases: duplicates,
  };
}

/** Reads schema_version from _system and applies any newer migrations in order, recording each one. */
export async function runMigrations(
  google: Pick<GoogleServices, 'sheets' | 'drive'>,
  spreadsheetId: string,
  migrations: Migration[],
): Promise<number> {
  const tabs = await google.sheets.getTabs(spreadsheetId);
  let gid = tabs.find((t) => t.title === TAB.system)?.gid;
  if (gid === undefined) {
    // Someone removed _system by hand: put it back at the version this app writes.
    const [created] = await google.sheets.addTabs(spreadsheetId, [
      { title: TAB.system, columns: 4 },
    ]);
    gid = (created as { gid: number }).gid;
    await google.sheets.writeBlocks(spreadsheetId, [
      {
        gid,
        startRow: 1,
        rows: [
          [...SYSTEM_TAB_HEADERS],
          ['schema_version', SCHEMA_VERSION],
          ['calendar_sync_token', ''],
        ],
      },
    ]);
    await google.sheets.formatTabs(spreadsheetId, [{ gid, format: { hidden: true } }]);
  }

  const rows = (await google.sheets.batchGet(spreadsheetId, [gid]))[gid] ?? [];
  let rowIndex = rows.findIndex((r) => r[0] === 'schema_version');
  let current = rowIndex >= 0 ? Number(rows[rowIndex]?.[1]) || 0 : 0;
  if (rowIndex < 0) rowIndex = rows.length;

  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    await m.run(google, spreadsheetId);
    current = m.version;
    await google.sheets.updateRow(spreadsheetId, gid, rowIndex + 1, ['schema_version', current]);
  }
  return current;
}
