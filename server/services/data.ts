import type { Logger } from 'pino';
import { NotSetUpError } from '../lib/errors';
import { MIGRATIONS, runMigrations } from './bootstrap';
import type { GoogleServices } from './google/types';
import { CalendarService } from './calendarService';
import { FileService } from './files';
import { MeetingService } from './meetings';
import { SheetStore } from './store';
import { TrackerService } from './trackers';
import { UndoService } from './undo';

export interface DataLayerOptions {
  logger: Logger;
  clock?: () => Date;
  ttlMs?: number;
  /** The address people open the app at, put in calendar events as a link back. */
  appUrl?: string;
  /** The upload cap when the max_upload_mb setting is blank. */
  maxUploadMb?: number;
}

export interface DataContext {
  store: SheetStore;
  meetings: MeetingService;
  calendar: CalendarService;
  files: FileService;
  trackers: TrackerService;
}

/**
 * Hands out the store for the active database. If the active spreadsheet changes (a backup is switched in),
 * a new store starts with an empty cache, so old data is never served.
 */
export class DataLayer {
  private current: { id: string; ctx: DataContext } | null = null;
  readonly undo: UndoService;

  constructor(
    private readonly google: GoogleServices,
    private readonly options: DataLayerOptions,
  ) {
    this.undo = new UndoService(options.clock);
  }

  async use(): Promise<DataContext> {
    const state = await this.google.state.read();
    const id = state?.activeSpreadsheetId;
    if (!id) throw new NotSetUpError();
    if (this.current?.id !== id) {
      await this.migrate(id);
      if (this.current?.id === id) return this.current.ctx;
      const store = new SheetStore(this.google, id, this.options);
      const meetings = new MeetingService(store, this.undo);
      const calendar = new CalendarService(store, meetings, {
        appUrl: this.options.appUrl ?? 'http://localhost:3000',
        logger: this.options.logger,
      });
      meetings.onChanged = (changed) => calendar.queue(changed);
      const files = new FileService(store, meetings, {
        maxBytes: () => {
          const fromSettings = Number(store.currentSettings()?.max_upload_mb);
          const mb = fromSettings > 0 ? fromSettings : (this.options.maxUploadMb ?? 50);
          return Math.floor(mb * 1024 * 1024);
        },
      });
      const trackers = new TrackerService(store, {
        appUrl: this.options.appUrl,
        logger: this.options.logger,
      });
      this.current = { id, ctx: { store, meetings, calendar, files, trackers } };
    }
    return this.current.ctx;
  }

  private migrated = new Map<string, Promise<void>>();

  /**
   * Brings a database up to date the first time this server uses it, so a database made before a new feature gets
   * its tabs without waiting for the owner's next sign-in. A failure is logged and retried next time: the rest of
   * the app keeps working.
   */
  private migrate(id: string): Promise<void> {
    let run = this.migrated.get(id);
    if (!run) {
      run = runMigrations(this.google, id, MIGRATIONS).then(
        () => undefined,
        (err: unknown) => {
          this.migrated.delete(id);
          this.options.logger.warn({ err }, 'could not bring the database up to date');
        },
      );
      this.migrated.set(id, run);
    }
    return run;
  }
}
