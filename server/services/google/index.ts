import type { Env } from '../../env';
import { FileStateStore } from '../state';
import { GoogleAuth } from './auth';
import { LiveCalendar } from './live/calendar';
import { LiveDrive } from './live/drive';
import { LiveMail } from './live/mail';
import { LiveSheets } from './live/sheets';
import { createMockGoogle } from './mock';
import type { FailureInjector } from './mock/failure';
import type { GoogleServices } from './types';

export interface GoogleSetup {
  google: GoogleServices;
  /** Only in live mode. */
  auth?: GoogleAuth;
  /** Only in mock mode. */
  failures?: FailureInjector;
}

/** Picks the Google implementation for the configured mode. */
export async function createGoogleServices(env: Env): Promise<GoogleSetup> {
  if (env.googleMode === 'mock') {
    const mock = await createMockGoogle({
      failures: env.mockFail,
      seed: 'demo',
      timezone: env.defaultTimezone,
    });
    return { google: mock.services, failures: mock.failures };
  }

  const state = new FileStateStore(env.dataDir);
  const auth = new GoogleAuth(env, state);
  const ctx = { authClient: () => auth.ownerClient(), onInvalidGrant: () => auth.markInvalid() };
  return {
    auth,
    google: {
      mode: 'live',
      sheets: new LiveSheets(ctx),
      drive: new LiveDrive(ctx),
      calendar: new LiveCalendar(ctx),
      mail: new LiveMail(),
      state,
    },
  };
}
