import { TAB } from '../../../shared/schema';
import type { Cell } from '../../../shared/types';
import type { SheetStore } from '../store';

export interface LogEntry {
  kind: 'change' | 'reschedule';
  at: string;
  who: string;
  /** What happened, in a short plain sentence. */
  what: string;
  /** The meeting or row it concerns. */
  row_id: string;
  source: string;
  /** Field-level old and new values, for changes. */
  changes: Record<string, [unknown, unknown]> | null;
}

const ACTIONS: Record<string, string> = {
  create: 'Added',
  update: 'Changed',
  delete: 'Moved to Trash',
  restore: 'Restored',
  complete: 'Marked done',
  config: 'Changed settings or columns',
  purge: 'Deleted for good',
  backup: 'Made a backup',
  undo: 'Undid a change',
};

function objects(rows: Cell[][]): Record<string, Cell>[] {
  const header = (rows[0] ?? []).map(String);
  return rows
    .slice(1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])) as Record<string, Cell>);
}

/** The change log: `_audit` and `_reschedules` together, newest first, with a simple search (§7.9 d). */
export async function readLog(
  store: SheetStore,
  options: { q?: string; limit: number; offset: number },
): Promise<{ entries: LogEntry[]; total: number }> {
  const snap = await store.snapshot();
  const gids = [TAB.audit, TAB.reschedules].map((t) => snap.tabs.find((x) => x.title === t)?.gid);
  const wanted = gids.filter((g): g is number => g !== undefined);
  const data = await store.google.sheets.batchGet(store.spreadsheetId, wanted);
  const [auditGid, reschedGid] = gids;

  const entries: LogEntry[] = [];
  for (const r of objects(auditGid !== undefined ? (data[auditGid] ?? []) : [])) {
    let changes: LogEntry['changes'] = null;
    try {
      changes = r.changes ? (JSON.parse(String(r.changes)) as LogEntry['changes']) : null;
    } catch {
      changes = null;
    }
    entries.push({
      kind: 'change',
      at: String(r.ts),
      who: String(r.user_email),
      what: `${ACTIONS[String(r.action)] ?? String(r.action)} in ${String(r.table)}`,
      row_id: String(r.row_id),
      source: String(r.source),
      changes,
    });
  }
  for (const r of objects(reschedGid !== undefined ? (data[reschedGid] ?? []) : [])) {
    entries.push({
      kind: 'reschedule',
      at: String(r.changed_at),
      who: '',
      what: `Moved from ${String(r.old_date)} ${String(r.old_start)} to ${String(r.new_date)} ${String(r.new_start)}${r.reason ? ` (${String(r.reason)})` : ''}`,
      row_id: String(r.meeting_id),
      source: String(r.source),
      changes: null,
    });
  }

  const q = options.q?.trim().toLowerCase();
  const matched = q
    ? entries.filter((e) =>
        `${e.what} ${e.who} ${e.row_id} ${e.source} ${JSON.stringify(e.changes ?? '')}`
          .toLowerCase()
          .includes(q),
      )
    : entries;
  matched.sort((a, b) => b.at.localeCompare(a.at));
  return {
    entries: matched.slice(options.offset, options.offset + options.limit),
    total: matched.length,
  };
}
