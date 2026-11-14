import type { Logger } from 'pino';
import { NotSetUpError } from '../lib/errors';
import type { GoogleServices } from './google/types';
import { MeetingService } from './meetings';
import { SheetStore } from './store';
import { UndoService } from './undo';

export interface DataLayerOptions {
  logger: Logger;
  clock?: () => Date;
  ttlMs?: number;
}

export interface DataContext {
  store: SheetStore;
  meetings: MeetingService;
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
      this.current = { id, ctx: { store, meetings: new MeetingService(store, this.undo) } };
    }
    return this.current.ctx;
  }
}
