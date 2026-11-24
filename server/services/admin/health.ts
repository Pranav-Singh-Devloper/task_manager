import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SCHEMA_VERSION, SYSTEM_COLUMNS, TAB } from '../../../shared/schema';
import type { JobStatus } from '../google/types';
import type { SheetStore } from '../store';
import { listBackups } from './backups';

export interface Health {
  google: { mode: 'live' | 'mock'; email: string | null; needsSignIn: boolean };
  /** When the app last read the Sheet. */
  last_refresh: string | null;
  not_on_calendar: number;
  pending_uploads: number;
  last_backup: string | null;
  jobs: Record<string, JobStatus>;
  config_problems: string[];
  unmanaged_columns: { tab: string; column: string }[];
  attention: string[];
  duplicate_databases: number;
  app_version: string;
  schema_version: number;
  /** Log writes that failed since the app started. */
  log_failures: number;
}

let version: string | null = null;
async function appVersion(): Promise<string> {
  if (version) return version;
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    version = pkg.version ?? 'unknown';
  } catch {
    version = 'unknown';
  }
  return version;
}

/** Everything the maintainer needs to see at a glance, in plain numbers (§7.9 f). */
export async function systemHealth(store: SheetStore, ownerEmail: string | null): Promise<Health> {
  const snap = await store.snapshot();
  const state = await store.google.state.read();

  let notOnCalendar = 0;
  let pendingUploads = 0;
  for (const data of snap.categories.values()) {
    for (const e of data.entries.values()) {
      const s = e.record.system;
      if (!s.deleted_at && (s.calendar_sync === 'error' || s.calendar_sync === 'pending'))
        notOnCalendar += 1;
    }
  }
  for (const list of snap.files.values()) {
    pendingUploads += list.filter((f) => f.status === 'pending').length;
  }

  const unmanaged: Health['unmanaged_columns'] = [];
  const system = new Set<string>(SYSTEM_COLUMNS);
  const tabs = [
    ...[...snap.categories].map(([slug, data]) => ({
      data,
      cfg: snap.config.byCategory.get(slug),
    })),
    ...[...snap.trackers].map(([slug, data]) => ({ data, cfg: snap.config.byTracker.get(slug) })),
  ];
  for (const { data, cfg } of tabs) {
    const known = new Set((cfg?.fields ?? []).map((f) => f.key));
    for (const h of data.headers) {
      if (h && !known.has(h) && !system.has(h)) unmanaged.push({ tab: data.title, column: h });
    }
  }

  let schemaVersion = SCHEMA_VERSION;
  const systemTab = snap.tabs.find((t) => t.title === TAB.system);
  if (systemTab) {
    const rows =
      (await store.google.sheets.batchGet(store.spreadsheetId, [systemTab.gid]))[systemTab.gid] ??
      [];
    schemaVersion = Number(rows.find((r) => r[0] === 'schema_version')?.[1]) || SCHEMA_VERSION;
  }

  const backups = await listBackups(store).catch(() => []);
  return {
    google: {
      mode: store.google.mode,
      email: ownerEmail ?? state?.ownerEmail ?? null,
      needsSignIn: Boolean(state?.tokenInvalid),
    },
    last_refresh: new Date(snap.loadedAt).toISOString(),
    not_on_calendar: notOnCalendar,
    pending_uploads: pendingUploads,
    last_backup: backups[0]?.created_at ?? null,
    jobs: state?.jobs ?? {},
    config_problems: snap.config.problems,
    unmanaged_columns: unmanaged,
    attention: [...snap.categories.values()].flatMap((c) => c.attention.map((a) => a.message)),
    duplicate_databases: state?.duplicateDatabases ?? 0,
    app_version: await appVersion(),
    schema_version: schemaVersion,
    log_failures: store.log.failures,
  };
}
