import type { Logger } from 'pino';
import { newId } from '../../shared/ids';
import { AUDIT_HEADERS, RESCHEDULE_HEADERS, TAB, rowFromObject } from '../../shared/schema';
import type { Cell } from '../../shared/types';
import type { GoogleServices } from './google/types';

export type AuditAction =
  'create' | 'update' | 'delete' | 'restore' | 'complete' | 'config' | 'purge' | 'backup' | 'undo';
export type ChangeSource = 'app' | 'admin' | 'calendar' | 'sheet' | 'job' | 'undo';

export interface AuditEntry {
  user: string;
  action: AuditAction;
  table: string;
  rowId: string;
  /** Field-level old and new values: { field: [old, new] }. */
  changes?: Record<string, [unknown, unknown]>;
  source: ChangeSource;
}

export interface RescheduleEntry {
  meetingId: string;
  categorySlug: string;
  old: { date: string; start: string; end: string };
  next: { date: string; start: string; end: string };
  reason?: string;
  source: 'app' | 'admin' | 'calendar' | 'sheet' | 'undo';
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * The append-only change log (_audit) and the reschedule history (_reschedules). They are not cached: they only grow,
 * and are read when someone opens the Change log or a meeting's history.
 * Logging is best effort. The change has already been saved, so a hiccup in the log must not turn into a failed save.
 */
export class ActivityLog {
  private gids = new Map<string, number>();
  /** How many log writes failed, for System health. */
  failures = 0;

  constructor(
    private readonly google: GoogleServices,
    private readonly spreadsheetId: string,
    private readonly logger: Logger,
    private readonly clock: () => Date,
  ) {}

  private async gidOf(title: string): Promise<number | undefined> {
    const known = this.gids.get(title);
    if (known !== undefined) return known;
    const tabs = await this.google.sheets.getTabs(this.spreadsheetId);
    for (const t of tabs) this.gids.set(t.title, t.gid);
    return this.gids.get(title);
  }

  private async append(title: string, rows: Cell[][]): Promise<void> {
    if (rows.length === 0) return;
    try {
      const gid = await this.gidOf(title);
      if (gid === undefined) throw new Error(`The ${title} tab was not found`);
      await this.google.sheets.appendRows(this.spreadsheetId, gid, rows);
    } catch (err) {
      this.failures += 1;
      this.logger.error({ err, tab: title }, 'could not write to the change log');
    }
  }

  auditRow(e: AuditEntry): Cell[] {
    return rowFromObject(AUDIT_HEADERS, {
      id: newId(),
      ts: this.clock().toISOString(),
      user_email: e.user,
      action: e.action,
      table: e.table,
      row_id: e.rowId,
      changes: e.changes ? JSON.stringify(e.changes) : '',
      source: e.source,
    });
  }

  rescheduleRow(r: RescheduleEntry): Cell[] {
    return rowFromObject(RESCHEDULE_HEADERS, {
      id: newId(),
      meeting_id: r.meetingId,
      category_slug: r.categorySlug,
      old_date: r.old.date,
      old_start: r.old.start,
      old_end: r.old.end,
      new_date: r.next.date,
      new_start: r.next.start,
      new_end: r.next.end,
      reason: text(r.reason),
      source: r.source,
      changed_at: this.clock().toISOString(),
    });
  }

  async audit(...entries: AuditEntry[]): Promise<void> {
    await this.append(
      TAB.audit,
      entries.map((e) => this.auditRow(e)),
    );
  }

  async reschedule(...entries: RescheduleEntry[]): Promise<void> {
    await this.append(
      TAB.reschedules,
      entries.map((e) => this.rescheduleRow(e)),
    );
  }

  /** Every logged change for one row, oldest first. */
  async history(
    rowId: string,
  ): Promise<{ audit: Record<string, Cell>[]; reschedules: Record<string, Cell>[] }> {
    const read = async (title: string, headers: readonly string[], key: string) => {
      const gid = await this.gidOf(title);
      if (gid === undefined) return [];
      const rows = (await this.google.sheets.batchGet(this.spreadsheetId, [gid]))[gid] ?? [];
      const col = headers.indexOf(key);
      return rows
        .slice(1)
        .filter((r) => r[col] === rowId)
        .map(
          (r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])) as Record<string, Cell>,
        );
    };
    const [audit, reschedules] = await Promise.all([
      read(TAB.audit, AUDIT_HEADERS, 'row_id'),
      read(TAB.reschedules, RESCHEDULE_HEADERS, 'meeting_id'),
    ]);
    return { audit, reschedules };
  }
}
