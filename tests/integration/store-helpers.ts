import { createLogger } from '../../server/lib/logger';
import type { GoogleServices } from '../../server/services/google/types';
import {
  createMockGoogle,
  type MockGoogle,
  type MockOptions,
} from '../../server/services/google/mock';
import { SheetStore } from '../../server/services/store';

export const logger = createLogger('silent');

export interface Counted {
  services: GoogleServices;
  calls: () => number;
  reset: () => void;
}

/** Wraps the Sheets adapter so tests can count how many API calls were made. */
export function countSheetsCalls(services: GoogleServices): Counted {
  let n = 0;
  const sheets = new Proxy(services.sheets, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function'
        ? (...args: unknown[]) => {
            n += 1;
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          }
        : v;
    },
  });
  return { services: { ...services, sheets }, calls: () => n, reset: () => void (n = 0) };
}

export interface Fixture {
  mock: MockGoogle;
  store: SheetStore;
  spreadsheetId: string;
  clock: { now: Date; advance: (ms: number) => void };
  calls: () => number;
  resetCalls: () => void;
  /** Reads a tab by title straight from the mock Sheet. */
  tab: (
    title: string,
  ) => Promise<{ gid: number; rows: (string | number | boolean | null)[][]; headers: string[] }>;
}

export async function fixture(options: MockOptions = { seed: 'demo' }): Promise<Fixture> {
  const mock = await createMockGoogle(options);
  const { bootstrap } = await import('../../server/services/bootstrap');
  const { spreadsheetId } = await bootstrap(mock.services);
  const counted = countSheetsCalls(mock.services);
  const clock = {
    now: new Date(),
    advance(ms: number) {
      this.now = new Date(this.now.getTime() + ms);
    },
  };
  const store = new SheetStore(counted.services, spreadsheetId, { logger, clock: () => clock.now });
  const tab = async (title: string) => {
    const t = (await mock.services.sheets.getTabs(spreadsheetId)).find((x) => x.title === title)!;
    const rows = (await mock.services.sheets.batchGet(spreadsheetId, [t.gid]))[t.gid] ?? [];
    return { gid: t.gid, rows, headers: (rows[0] ?? []).map(String) };
  };
  return {
    mock,
    store,
    spreadsheetId,
    clock,
    calls: counted.calls,
    resetCalls: counted.reset,
    tab,
  };
}
