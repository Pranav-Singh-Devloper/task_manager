import cron from 'node-cron';
import type { Logger } from 'pino';
import type { DataLayer } from './services/data';
import type { GoogleServices } from './services/google/types';

/** Writes when a job last ran and how it went, for System health (§13). Best effort. */
async function record(google: GoogleServices, name: string, ok: boolean, message?: string) {
  try {
    const state = (await google.state.read()) ?? { jobs: {} };
    state.jobs = {
      ...state.jobs,
      [name]: { lastRunAt: new Date().toISOString(), ok, ...(message ? { message } : {}) },
    };
    await google.state.write(state);
  } catch {
    // Not being able to note a run must never stop the job.
  }
}

/**
 * Runs one job body: skips when the owner's sign-in is not valid (jobs pause and resume after the next sign-in),
 * never overlaps itself, and never throws.
 */
export function guarded(
  name: string,
  google: GoogleServices,
  logger: Logger,
  body: () => Promise<string | void>,
): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const state = await google.state.read();
      if (!state?.activeSpreadsheetId || state.tokenInvalid) return;
      const message = await body();
      await record(google, name, true, message || undefined);
    } catch (err) {
      logger.warn({ err, job: name }, 'background job failed');
      await record(google, name, false, 'The last run did not finish. It will try again.');
    } finally {
      running = false;
    }
  };
}

export interface JobSet {
  /** Run one job right now, for tests. */
  run(name: 'calendar-retry' | 'expire-uploads'): Promise<void>;
  stop(): void;
}

/** The background jobs for the first release (§13): retry the calendar every 5 minutes, clear stale uploads hourly. */
export function startJobs(data: DataLayer, google: GoogleServices, logger: Logger): JobSet {
  const retry = guarded('calendar-retry', google, logger, async () => {
    const ctx = await data.use();
    const r = await ctx.calendar.retryAll();
    // Lists too: rows whose event failed, and rows pasted into the Sheet that should be on the calendar.
    const lists = await ctx.trackers.resync();
    const tried = r.tried + lists.tried;
    const ok = r.ok + lists.tried - lists.failed;
    return tried === 0 ? undefined : `Tried ${tried}, ${ok} worked`;
  });
  const expire = guarded('expire-uploads', google, logger, async () => {
    const ctx = await data.use();
    const n = await ctx.files.expirePending();
    return n === 0 ? undefined : `Removed ${n} unsaved upload${n === 1 ? '' : 's'}`;
  });
  const tasks = [
    cron.schedule('*/5 * * * *', () => void retry()),
    cron.schedule('0 * * * *', () => void expire()),
  ];
  return {
    run: (name) => (name === 'calendar-retry' ? retry() : expire()),
    stop: () => tasks.forEach((t) => t.stop()),
  };
}
