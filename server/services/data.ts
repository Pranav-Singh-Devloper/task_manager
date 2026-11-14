import type { Logger } from 'pino';
import { NotSetUpError } from '../lib/errors';
import type { GoogleServices } from './google/types';
import { CalendarService } from './calendarService';
import { FileService } from './files';
import { MeetingService } from './meetings';
import { SheetStore } from './store';
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
      this.current = { id, ctx: { store, meetings, calendar, files } };
    }
    return this.current.ctx;
  }
}
