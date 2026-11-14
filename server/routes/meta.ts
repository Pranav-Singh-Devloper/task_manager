import { Router } from 'express';
import type { DataLayer } from '../services/data';

export function metaRouter(data: DataLayer): Router {
  const router = Router();

  /** Everything the UI needs to draw forms and tables: categories, fields, workspaces, settings. */
  router.get('/meta', async (_req, res) => {
    const { store } = await data.use();
    const snap = await store.snapshot();
    const { config } = snap;
    res.json({
      categories: config.categories,
      fields: config.fields,
      workspaces: config.workspaces,
      settings: config.settings,
      // Config rows that were skipped, and cells that could not be read, in plain words.
      problems: config.problems,
      attention: [...snap.categories.values()].flatMap((c) => c.attention),
    });
  });

  return router;
}
