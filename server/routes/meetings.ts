import { Router, type Request } from 'express';
import { z } from 'zod';
import type { VerifiedSession } from '../../shared/session';
import { MEETING_STATUSES } from '../../shared/types';
import { ValidationFailed } from '../lib/errors';
import type { DataLayer } from '../services/data';
import type { Actor } from '../services/meetings';
import { createCategory } from '../services/categories';
import { FILTER_OPS } from '../../shared/filters';
import { parseDateLoose } from '../../shared/dates';
import { updateSettings } from '../services/settings';

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
const createBody = z.object({
  id: z.string(),
  category: z.string(),
  values: z.record(z.string(), z.unknown()).default({}),
  previous_id: z.string().optional(),
});
const patchBody = z.object({ rev, values: z.record(z.string(), z.unknown()) });
const rescheduleBody = z.object({
  date: z.string(),
  start_time: z.string(),
  end_time: z.string().nullish(),
  reason: z.string().max(500).optional(),
  rev,
  confirm_completed: z.boolean().optional(),
});
const statusBody = z.object({ status: z.enum(MEETING_STATUSES), rev });
const completeBody = z.object({
  notes: z.string().max(25000).optional(),
  next: z
    .object({
      id: z.string(),
      date: z.string(),
      start_time: z.string(),
      end_time: z.string().nullish(),
    })
    .optional(),
  awaiting_next: z.boolean().optional(),
  allow_second_next: z.boolean().optional(),
  rev,
});
const categoryBody = z.object({ name: z.string(), color: z.string() });

const filterSpec = z.object({
  field: z.string().min(1).max(100),
  op: z.enum(FILTER_OPS),
  value: z.string().max(500).optional(),
  value2: z.string().max(500).optional(),
});
const flag = z.enum(['1', 'true']).optional();
const dateParam = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const d = parseDateLoose(v);
    if (!d) ctx.addIssue({ code: 'custom', message: 'bad date' });
    return d ?? undefined;
  });
const listQuery = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).default('all'),
  category: z.string().max(100).optional(),
  workspace: z.string().max(100).optional(),
  status: z.string().max(40).optional(),
  q: z.string().max(200).optional(),
  from: dateParam,
  to: dateParam,
  sort: z.string().max(100).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  filters: z
    .string()
    .max(10_000)
    .optional()
    .transform((v, ctx) => {
      if (!v) return [];
      try {
        const parsed = z.array(filterSpec).max(20).safeParse(JSON.parse(v));
        if (parsed.success) return parsed.data;
      } catch {
        // fall through
      }
      ctx.addIssue({ code: 'custom', message: 'bad filters' });
      return [];
    }),
  awaiting: flag,
  incomplete: flag,
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
});

const actorOf = (req: Request): Actor => ({
  email: ((req.res?.locals.session ?? {}) as VerifiedSession).email,
  source: 'app',
});

/** The API for meetings, undo, settings and refresh (§8). Every route needs a signed-in user. */
export function meetingsRouter(data: DataLayer): Router {
  const router = Router();

  router.get('/meetings', async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) throw unreadable();
    const q = parsed.data;
    const { meetings } = await data.use();
    const page = await meetings.query({
      scope: q.scope,
      category: q.category,
      workspace: q.workspace,
      status: q.status,
      q: q.q,
      from: q.from,
      to: q.to,
      sort: q.sort,
      dir: q.dir,
      filters: q.filters,
      awaiting: Boolean(q.awaiting),
      incomplete: Boolean(q.incomplete),
      limit: q.limit,
      offset: q.cursor,
    });
    res.json({
      meetings: page.meetings,
      total: page.total,
      next_cursor: page.nextOffset === null ? null : String(page.nextOffset),
    });
  });

  /** The top of the dashboard: the next meeting, and how many need attention. Must come before /meetings/:id. */
  router.get('/meetings/summary', async (_req, res) => {
    const { meetings } = await data.use();
    res.json(await meetings.summary());
  });

  router.get('/meetings/:id', async (req, res) => {
    const { meetings } = await data.use();
    const id = String(req.params.id);
    res.json({ meeting: await meetings.get(id), ...(await meetings.neighbors(id)) });
  });

  router.get('/meetings/:id/history', async (req, res) => {
    const { meetings } = await data.use();
    res.json(await meetings.history(String(req.params.id)));
  });

  router.post('/meetings', async (req, res) => {
    const body = parse(createBody, req.body);
    const { meetings } = await data.use();
    const r = await meetings.create(
      { id: body.id, category: body.category, values: body.values, previousId: body.previous_id },
      actorOf(req),
    );
    res
      .status(r.existing ? 200 : 201)
      .json({ meeting: r.meeting, existing: r.existing, undo_token: r.undoToken });
  });

  router.patch('/meetings/:id', async (req, res) => {
    const body = parse(patchBody, req.body);
    const { meetings } = await data.use();
    const r = await meetings.update(String(req.params.id), body.values, body.rev, actorOf(req));
    res.json({ meeting: r.meeting, undo_token: r.undoToken });
  });

  router.post('/meetings/:id/reschedule', async (req, res) => {
    const body = parse(rescheduleBody, req.body);
    const { meetings } = await data.use();
    const r = await meetings.reschedule(
      String(req.params.id),
      { ...body, confirmCompleted: body.confirm_completed },
      actorOf(req),
    );
    res.json({ meeting: r.meeting, undo_token: r.undoToken });
  });

  router.post('/meetings/:id/status', async (req, res) => {
    const body = parse(statusBody, req.body);
    const { meetings } = await data.use();
    const r = await meetings.setStatus(String(req.params.id), body.status, body.rev, actorOf(req));
    res.json({ meeting: r.meeting, undo_token: r.undoToken });
  });

  router.delete('/meetings/:id', async (req, res) => {
    const revision = parse(rev, Number(req.query.rev));
    const { meetings } = await data.use();
    const r = await meetings.remove(String(req.params.id), revision, actorOf(req));
    res.json({ meeting: r.meeting, undo_token: r.undoToken });
  });

  router.post('/meetings/:id/dismiss-waiting', async (req, res) => {
    const body = parse(z.object({ rev }), req.body);
    const { meetings } = await data.use();
    const r = await meetings.dismissWaiting(String(req.params.id), body.rev, actorOf(req));
    res.json({ meeting: r.meeting, undo_token: r.undoToken });
  });

  router.post('/meetings/:id/restore', async (req, res) => {
    const { meetings } = await data.use();
    const r = await meetings.restore(String(req.params.id), actorOf(req));
    res.json({ meeting: r.meeting, undo_token: r.undoToken });
  });

  router.post('/meetings/:id/complete', async (req, res) => {
    const body = parse(completeBody, req.body);
    const { meetings } = await data.use();
    const r = await meetings.complete(
      String(req.params.id),
      {
        notes: body.notes,
        next: body.next,
        awaitingNext: body.awaiting_next,
        allowSecondNext: body.allow_second_next,
        rev: body.rev,
      },
      actorOf(req),
    );
    res.json({ meeting: r.meeting, next: r.next, existing: r.existing, undo_token: r.undoToken });
  });

  router.post('/categories', async (req, res) => {
    const body = parse(categoryBody, req.body);
    const { store } = await data.use();
    res.status(201).json({ category: await createCategory(store, body, actorOf(req)) });
  });

  router.post('/undo/:token', async (req, res) => {
    const { meetings } = await data.use();
    const r = await meetings.undoChange(String(req.params.token), actorOf(req));
    res.json({ meeting: r.meeting, label: r.label });
  });

  router.get('/settings', async (_req, res) => {
    const { store } = await data.use();
    res.json({ settings: (await store.snapshot()).config.settings });
  });

  router.patch('/settings', async (req, res) => {
    const body = parse(z.record(z.string(), z.unknown()), req.body);
    const { store } = await data.use();
    res.json({ settings: await updateSettings(store, body, actorOf(req)) });
  });

  /** The Refresh button: reload everything from the Sheet now. */
  router.post('/refresh', async (_req, res) => {
    const { store } = await data.use();
    const snap = await store.refresh();
    res.json({ loaded_at: new Date(snap.loadedAt).toISOString(), problems: snap.config.problems });
  });

  return router;
}
