import { Router } from 'express';
import type { GoogleServices } from '../services/google/types';
import { loadMeta } from '../services/meta';

export function metaRouter(google: GoogleServices): Router {
  const router = Router();

  router.get('/meta', async (_req, res) => {
    const state = await google.state.read();
    if (!state?.activeSpreadsheetId) {
      res.status(503).json({
        error: {
          code: 'not_set_up',
          message: 'The app is not set up yet. The owner needs to sign in once first.',
        },
      });
      return;
    }
    res.json(await loadMeta(google, state.activeSpreadsheetId));
  });

  return router;
}
