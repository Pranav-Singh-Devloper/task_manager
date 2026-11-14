import type { Env } from '../../env';
import { createMockGoogle } from './mock';
import type { GoogleServices } from './types';

/** Picks the Google implementation for the configured mode. */
export async function createGoogleServices(env: Env): Promise<GoogleServices> {
  if (env.googleMode === 'mock') {
    const mock = await createMockGoogle({
      failures: env.mockFail,
      seed: 'demo',
      timezone: env.defaultTimezone,
    });
    return mock.services;
  }
  throw new Error(
    'GOOGLE_MODE=live is not available yet. Use GOOGLE_MODE=mock until the live adapters land.',
  );
}
