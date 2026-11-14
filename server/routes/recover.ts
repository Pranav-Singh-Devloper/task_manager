import { Router } from 'express';
import { z } from 'zod';
import { AppError, ValidationFailed } from '../lib/errors';
import { BACKUP_APP_PROPERTIES } from '../services/admin/backups';
import { bootstrap } from '../services/bootstrap';
import { DATABASE_APP_PROPERTIES } from '../services/databaseSeed';
import type { GoogleServices } from '../services/google/types';

/**
 * The way back when the database cannot be found (§11): use the newest backup, or set up a new, empty database.
 * Neither touches the data that is left in Google.
 */
export function recoverRouter(google: GoogleServices): Router {
  const router = Router();

  router.post('/recover', async (req, res) => {
    const body = z.object({ action: z.enum(['backup', 'new']) }).safeParse(req.body);
    if (!body.success) {
      throw new ValidationFailed([
        { field: 'form', message: 'Please choose what to do and try again.' },
      ]);
    }
    const state = (await google.state.read()) ?? { jobs: {} };

    if (body.data.action === 'backup') {
      const newest = (await google.drive.findByAppProperties({ ...BACKUP_APP_PROPERTIES }))[0];
      if (!newest) {
        throw new AppError(
          404,
          'no_backup',
          'There are no backups to use. You can set up a new database instead.',
        );
      }
      await google.drive.setAppProperties(newest.id, { ...DATABASE_APP_PROPERTIES });
      await google.state.write({ ...state, activeSpreadsheetId: newest.id });
    } else {
      const { activeSpreadsheetId: _gone, ...rest } = state;
      void _gone;
      await google.state.write(rest);
      await bootstrap(google);
    }
    res.json({ ok: true });
  });

  return router;
}
