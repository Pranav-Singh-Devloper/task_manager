import { AppError, NotSetUpError } from '../../lib/errors';
import { DATABASE_APP_PROPERTIES } from '../databaseSeed';
import type { Actor } from '../meetings';
import type { SheetStore } from '../store';

export const BACKUP_APP_PROPERTIES = { app: 'meetings-manager', role: 'backup' } as const;
const KEEP_BACKUPS = 30;

export interface BackupInfo {
  id: string;
  name: string;
  created_at: string;
  /** The database in use right now. */
  active: boolean;
}

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');

/** A copy of the whole database in Drive, tagged as a backup so it is never mistaken for the database (§5.5, §13). */
export async function backupNow(store: SheetStore, actor: Actor): Promise<BackupInfo> {
  const { drive, state } = store.google;
  const s = await state.read();
  const folder = s?.driveBackupsFolderId;
  if (!folder) throw new NotSetUpError();
  const name = `Backup ${stamp(store.now())}`;
  // files.copy does not carry appProperties over, so they are set explicitly on the copy.
  const copy = await drive.copyFile(store.spreadsheetId, name, folder, {
    ...BACKUP_APP_PROPERTIES,
  });
  await store.log.audit({
    user: actor.email,
    action: 'backup',
    table: 'database',
    rowId: copy.id,
    source: actor.source,
  });
  await prune(store);
  return { id: copy.id, name: copy.name, created_at: copy.modifiedTime, active: false };
}

async function prune(store: SheetStore): Promise<void> {
  const all = await store.google.drive.findByAppProperties({ ...BACKUP_APP_PROPERTIES });
  for (const old of all.slice(KEEP_BACKUPS)) {
    await store.google.drive.trashFile(old.id).catch(() => undefined);
  }
}

/** Newest first. */
export async function listBackups(store: SheetStore): Promise<BackupInfo[]> {
  const found = await store.google.drive.findByAppProperties({ ...BACKUP_APP_PROPERTIES });
  return found
    .map((f) => ({ id: f.id, name: f.name, created_at: f.modifiedTime, active: false }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * "Use this backup": backs up the current database first, then makes the chosen backup the database.
 * The two files swap their tags, so the old database becomes a backup and nothing is lost.
 */
export async function activateBackup(
  store: SheetStore,
  backupId: string,
  actor: Actor,
): Promise<{ previous: BackupInfo; activeSpreadsheetId: string }> {
  const { drive, state } = store.google;
  const chosen = (await drive.findByAppProperties({ ...BACKUP_APP_PROPERTIES })).find(
    (f) => f.id === backupId,
  );
  if (!chosen) throw new AppError(404, 'not_found', "We couldn't find that backup.");
  const s = await state.read();
  if (!s) throw new NotSetUpError();

  const previous = await backupNow(store, actor);
  await drive.setAppProperties(backupId, { ...DATABASE_APP_PROPERTIES });
  await drive.setAppProperties(store.spreadsheetId, { ...BACKUP_APP_PROPERTIES });
  await state.write({ ...s, activeSpreadsheetId: backupId });
  return { previous, activeSpreadsheetId: backupId };
}
