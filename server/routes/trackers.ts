import { Router, type Request } from 'express';
import { z } from 'zod';
import type { VerifiedSession } from '../../shared/session';
import { ValidationFailed } from '../lib/errors';
import type { DataLayer } from '../services/data';
import type { Actor } from '../services/meetings';

const unreadable = () =>
  new ValidationFailed([
    {
      field: 'form',
      message: 'That request was not understood. Please reload the page and try again.',
    },
  ]);

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw unreadable();
  return r.data;
}

const rev = z.number().int().min(0);
const values = z.record(z.string(), z.unknown());
const createBody = z.object({ id: z.string(), values: values.default({}) });
const patchBody = z.object({ rev, values });
const target = z.union([z.number(), z.string().max(20), z.null()]).optional();
const targetsBody = z.object({ km: target, cr: target });

const actorOf = (req: Request): Actor => ({
  email: ((req.res?.locals.session ?? {}) as VerifiedSession).email,
  source: 'app',
});

/** The API for trackers (Award Plan, Discussions, DPR, Track, Under Observation and new ones). Signed-in users only. */
export function trackersRouter(data: DataLayer): Router {
  const router = Router();

  /** Every tracker's dashboard numbers, for the home page. Must come before /trackers/:slug. */
  router.get('/trackers/summary', async (_req, res) => {
    const { trackers } = await data.use();
    res.json({ trackers: await trackers.summaries() });
  });

  router.get('/trackers/:slug/rows', async (req, res) => {
    const { trackers } = await data.use();
    const deleted = req.query.deleted === '1';
    res.json(await trackers.list(String(req.params.slug), { deleted }));
  });

  router.get('/trackers/:slug/rows/:id', async (req, res) => {
    const { trackers } = await data.use();
    res.json({ row: await trackers.get(String(req.params.slug), String(req.params.id)) });
  });

  router.post('/trackers/:slug/rows', async (req, res) => {
    const body = parse(createBody, req.body);
    const { trackers } = await data.use();
    const r = await trackers.create(String(req.params.slug), body, actorOf(req));
    res.status(r.existing ? 200 : 201).json(r);
  });

  router.patch('/trackers/:slug/rows/:id', async (req, res) => {
    const body = parse(patchBody, req.body);
    const { trackers } = await data.use();
    const row = await trackers.update(
      String(req.params.slug),
      String(req.params.id),
      body,
      actorOf(req),
    );
    res.json({ row });
  });

  router.delete('/trackers/:slug/rows/:id', async (req, res) => {
    const revision = parse(rev, Number(req.query.rev));
    const { trackers } = await data.use();
    const row = await trackers.remove(
      String(req.params.slug),
      String(req.params.id),
      revision,
      actorOf(req),
    );
    res.json({ row });
  });

  router.post('/trackers/:slug/rows/:id/restore', async (req, res) => {
    const { trackers } = await data.use();
    const row = await trackers.restore(
      String(req.params.slug),
      String(req.params.id),
      actorOf(req),
    );
    res.json({ row });
  });

  router.patch('/trackers/:slug/targets', async (req, res) => {
    const body = parse(targetsBody, req.body);
    const { trackers } = await data.use();
    const tracker = await trackers.setTargets(
      String(req.params.slug),
      { km: (body.km ?? null) as number | null, cr: (body.cr ?? null) as number | null },
      actorOf(req),
    );
    res.json({ tracker });
  });

  return router;
}
