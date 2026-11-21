import { Router, type Request } from 'express';
import { z } from 'zod';
import type { VerifiedSession } from '../../shared/session';
import { FIELD_TYPES } from '../../shared/types';
import { ValidationFailed } from '../lib/errors';
import { activateBackup, backupNow, listBackups } from '../services/admin/backups';
import {
  addField,
  checkTypeChange,
  moveField,
  removeCategory,
  removeField,
  updateCategory,
  updateField,
} from '../services/admin/columns';
import { exportCsv, exportXlsx } from '../services/admin/export';
import { systemHealth } from '../services/admin/health';
import { readLog } from '../services/admin/log';
import { assertEditable, listTables, readTable } from '../services/admin/tables';
import { createTracker, updateTracker } from '../services/admin/trackers';
import { listTrash, purgeMeeting } from '../services/admin/trash';
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

const sessionOf = (req: Request) => (req.res?.locals.session ?? {}) as VerifiedSession;
const actorOf = (req: Request): Actor => ({ email: sessionOf(req).email, source: 'admin' });

const text = z.string().max(2000);
const fieldInput = z.object({
  label: z.string().max(200),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  options: z.array(z.string().max(200)).max(500).optional(),
  allow_new_options: z.boolean().optional(),
  default_value: text.optional(),
  help_text: text.optional(),
  placeholder: text.optional(),
  unit: z.string().max(40).optional(),
  show_in_form: z.boolean().optional(),
  show_in_table: z.boolean().optional(),
  searchable: z.boolean().optional(),
  case_key: z.boolean().optional(),
  computed_expr: text.optional(),
});
const fieldPatch = fieldInput.partial().extend({ archived: z.boolean().optional() });
const page = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
const confirmBody = z.object({ confirm: z.string().max(200) });

/** The Admin API (§8, §7.9). Every route needs a signed-in user. */
export function adminRouter(data: DataLayer): Router {
  const router = Router();

  // ---- data tables ----
  router.get('/admin/tables', async (_req, res) => {
    const { store } = await data.use();
    res.json({
      tables: await listTables(store),
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${store.spreadsheetId}`,
      mock: store.google.mode === 'mock',
    });
  });

  router.get('/admin/tables/:tab', async (req, res) => {
    const q = parse(page, req.query);
    const { store } = await data.use();
    res.json(await readTable(store, String(req.params.tab), q));
  });

  router.patch('/admin/tables/:tab/rows/:id', async (req, res) => {
    const body = parse(
      z.object({ rev: z.number().int().min(0), values: z.record(z.string(), z.unknown()) }),
      req.body,
    );
    const ctx = await data.use();
    const tables = await listTables(ctx.store);
    assertEditable(tables.find((t) => t.name === String(req.params.tab)));
    // The same rules as the rest of the app: rev check, validation, log, calendar and reschedule history.
    const r = await ctx.meetings.update(
      String(req.params.id),
      body.values,
      body.rev,
      actorOf(req),
      { confirmCompleted: true },
    );
    await ctx.calendar.settle();
    res.json({ meeting: await ctx.meetings.get(r.meeting.id), undo_token: r.undoToken });
  });

  router.delete('/admin/tables/:tab/rows/:id', async (req, res) => {
    const rev = parse(z.coerce.number().int().min(0), req.query.rev);
    const ctx = await data.use();
    const tables = await listTables(ctx.store);
    assertEditable(tables.find((t) => t.name === String(req.params.tab)));
    const r = await ctx.meetings.remove(String(req.params.id), rev, actorOf(req));
    await ctx.calendar.settle();
    res.json({ meeting: await ctx.meetings.get(r.meeting.id), undo_token: r.undoToken });
  });

  router.get('/admin/export/:tab', async (req, res) => {
    const format = parse(z.enum(['csv', 'xlsx']).default('csv'), req.query.format);
    const { store } = await data.use();
    const name = String(req.params.tab);
    await readTable(store, name, { limit: 1, offset: 0 }); // a missing table is a clear 404
    const file = name.replace(/[^\w.-]+/g, '_');
    if (format === 'csv') {
      res.type('text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${file}.csv"`);
      res.send(`﻿${await exportCsv(store, name)}`);
    } else {
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${file}.xlsx"`);
      res.send(await exportXlsx(store, name));
    }
  });

  // ---- columns and categories ----
  router.post('/admin/fields', async (req, res) => {
    const body = parse(fieldInput.extend({ category: z.string().max(100) }), req.body);
    const { store } = await data.use();
    const { category, ...input } = body;
    res.status(201).json({ field: await addField(store, category, input, actorOf(req)) });
  });

  router.patch('/admin/fields/:slug/:key', async (req, res) => {
    const body = parse(fieldPatch, req.body);
    const { store } = await data.use();
    res.json({
      field: await updateField(
        store,
        String(req.params.slug),
        String(req.params.key),
        body,
        actorOf(req),
      ),
    });
  });

  router.get('/admin/fields/:slug/:key/type-check', async (req, res) => {
    const q = parse(
      z.object({ type: z.enum(FIELD_TYPES), options: z.string().max(10000).optional() }),
      req.query,
    );
    const { store } = await data.use();
    const options = q.options === undefined ? undefined : q.options.split('\n');
    res.json(
      await checkTypeChange(
        store,
        String(req.params.slug),
        String(req.params.key),
        q.type,
        options,
      ),
    );
  });

  router.post('/admin/fields/:slug/:key/move', async (req, res) => {
    const body = parse(z.object({ direction: z.enum(['up', 'down']) }), req.body);
    const { store } = await data.use();
    await moveField(
      store,
      String(req.params.slug),
      String(req.params.key),
      body.direction,
      actorOf(req),
    );
    res.json({ ok: true });
  });

  router.post('/admin/fields/:slug/:key/remove', async (req, res) => {
    const body = parse(confirmBody, req.body);
    const { store } = await data.use();
    res.json(
      await removeField(
        store,
        String(req.params.slug),
        String(req.params.key),
        body.confirm,
        actorOf(req),
      ),
    );
  });

  router.patch('/admin/categories/:slug', async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().max(200).optional(),
        color: z.string().max(20).optional(),
        default_workspace: z.string().max(100).optional(),
        title_template: z.string().max(300).optional(),
        active: z.boolean().optional(),
      }),
      req.body,
    );
    const { store } = await data.use();
    res.json({
      category: await updateCategory(store, String(req.params.slug), body, actorOf(req)),
    });
  });

  router.post('/admin/categories/:slug/remove', async (req, res) => {
    const body = parse(confirmBody, req.body);
    const { store } = await data.use();
    res.json(await removeCategory(store, String(req.params.slug), body.confirm, actorOf(req)));
  });

  // ---- lists (trackers) ----
  router.post('/admin/trackers', async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().max(200),
        item_name: z.string().max(200),
        color: z.string().max(20),
      }),
      req.body,
    );
    const { store } = await data.use();
    res.status(201).json({ tracker: await createTracker(store, body, actorOf(req)) });
  });

  router.patch('/admin/trackers/:slug', async (req, res) => {
    const key = z.string().max(100);
    const body = parse(
      z.object({
        name: z.string().max(200).optional(),
        item_name: z.string().max(200).optional(),
        color: z.string().max(20).optional(),
        active: z.boolean().optional(),
        calendar: z.boolean().optional(),
        roles: z
          .object({
            title_key: key,
            status_key: key,
            closed_values: z.array(z.string().max(200)).max(20),
            due_key: key,
            group_key: key,
            sum_keys: z.array(key).max(5),
            done_date_key: key,
            stages_key: key,
            stage_key: key,
          })
          .partial()
          .optional(),
      }),
      req.body,
    );
    const ctx = await data.use();
    const slug = String(req.params.slug);
    const tracker = await updateTracker(ctx.store, slug, body, actorOf(req));
    // Turning the calendar on or off, or changing the date column, adds or removes events.
    await ctx.trackers.resync(slug);
    res.json({ tracker });
  });

  // ---- trash ----
  router.get('/admin/trash', async (_req, res) => {
    const { store } = await data.use();
    res.json({ meetings: await listTrash(store) });
  });

  router.post('/admin/trash/:id/restore', async (req, res) => {
    const ctx = await data.use();
    const r = await ctx.meetings.restore(String(req.params.id), actorOf(req));
    await ctx.calendar.settle();
    res.json({ meeting: await ctx.meetings.get(r.meeting.id), undo_token: r.undoToken });
  });

  router.delete('/admin/trash/:id', async (req, res) => {
    const body = parse(confirmBody, req.body ?? {});
    const { store } = await data.use();
    await purgeMeeting(store, String(req.params.id), body.confirm, actorOf(req));
    res.json({ ok: true });
  });

  // ---- log, backups, health ----
  router.get('/admin/log', async (req, res) => {
    const q = parse(
      page.extend({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
      req.query,
    );
    const { store } = await data.use();
    res.json(await readLog(store, q));
  });

  router.get('/admin/backups', async (_req, res) => {
    const { store } = await data.use();
    res.json({ backups: await listBackups(store) });
  });

  router.post('/admin/backup', async (req, res) => {
    const { store } = await data.use();
    res.status(201).json({ backup: await backupNow(store, actorOf(req)) });
  });

  router.post('/admin/backups/:id/activate', async (req, res) => {
    const { store } = await data.use();
    await activateBackup(store, String(req.params.id), actorOf(req));
    // The next request builds a fresh store for the chosen database.
    res.json({ ok: true });
  });

  router.get('/admin/health', async (req, res) => {
    const { store } = await data.use();
    res.json(await systemHealth(store, sessionOf(req).email ?? null));
  });

  return router;
}
