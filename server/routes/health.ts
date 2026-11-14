import { Router } from 'express';
import type { Env } from '../env';
import type { GoogleServices } from '../services/google/types';

export const APP_VERSION = '1.0.0';

export function healthRouter(env: Env, google: GoogleServices): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const state = await google.state.read().catch(() => null);
    const googleStatus =
      env.googleMode === 'mock' ? 'mock' : state?.refreshTokenEnc ? 'connected' : 'needs_sign_in';
    res.status(200).json({
      ok: true,
      version: APP_VERSION,
      mode: env.googleMode,
      stateFile: state ? 'ok' : 'missing',
      google: googleStatus,
    });
  });

  return router;
}
