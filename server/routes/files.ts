import busboy from 'busboy';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { VerifiedSession } from '../../shared/session';
import { isUlid } from '../../shared/ids';
import { ValidationFailed } from '../lib/errors';
import type { DataContext, DataLayer } from '../services/data';
import { FileTooBigError, type UploadRequest } from '../services/files';
import type { Actor } from '../services/meetings';

const unreadable = () =>
  new ValidationFailed([
    { field: 'file', message: 'That upload was not understood. Please try adding the file again.' },
  ]);

const actorOf = (req: Request): Actor => ({
  email: ((req.res?.locals.session ?? {}) as VerifiedSession).email,
  source: 'app',
});

/** Reads one file from a multipart request and streams it on to Drive without holding it in memory. */
function receive(req: Request, ctx: DataContext, actor: Actor) {
  const max = ctx.files.maxBytes();
  return new Promise<Awaited<ReturnType<DataContext['files']['upload']>>>((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > max + 1024 * 1024) {
      reject(new FileTooBigError(Math.floor(max / 1024 / 1024)));
      return;
    }
    let bb: busboy.Busboy;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fields: 10, fileSize: max + 1 } });
    } catch {
      reject(unreadable());
      return;
    }
    const fields: Record<string, string> = {};
    let started = false;
    bb.on('field', (name, value) => {
      fields[name] = value;
    });
    bb.on('file', (name, stream, info) => {
      started = true;
      const meetingId = fields.meeting_id ?? '';
      const category = fields.category ?? '';
      if (name !== 'file' || !isUlid(meetingId) || !category) {
        stream.resume();
        reject(unreadable());
        return;
      }
      let truncated = false;
      stream.on('limit', () => {
        truncated = true;
      });
      const request: UploadRequest = {
        meetingId,
        category,
        ...(fields.date ? { date: fields.date } : {}),
        ...(fields.title ? { title: fields.title.slice(0, 200) } : {}),
        name: info.filename ?? 'file',
        mime: info.mimeType,
        stream,
        attach: fields.attach === '1',
      };
      ctx.files.upload(request, actor).then(
        async (file) => {
          if (!truncated) {
            resolve(file);
            return;
          }
          await ctx.files.remove(file.id, actor).catch(() => undefined);
          reject(new FileTooBigError(Math.floor(max / 1024 / 1024)));
        },
        (err: unknown) => {
          stream.resume();
          reject(err);
        },
      );
    });
    bb.on('close', () => {
      if (!started) reject(unreadable());
    });
    bb.on('error', reject);
    req.pipe(bb);
  });
}

/** Files for meetings (§8): upload, remove, and a re-check for restored drafts. */
export function filesRouter(data: DataLayer): Router {
  const router = Router();

  router.post('/files', async (req, res) => {
    const ctx = await data.use();
    const file = await receive(req, ctx, actorOf(req));
    await ctx.calendar.settle();
    // Only a saved meeting comes back (attaching on its own page); a form's meeting does not exist yet.
    const meeting = await ctx.meetings.get(file.meeting_id).catch(() => null);
    res.status(201).json({ file, meeting });
  });

  router.delete('/files/:id', async (req, res) => {
    const ctx = await data.use();
    const { meetingId } = await ctx.files.remove(String(req.params.id), actorOf(req));
    await ctx.calendar.settle();
    const meeting = await ctx.meetings.get(meetingId).catch(() => null);
    res.json({ meeting });
  });

  router.get('/files/check', async (req, res) => {
    const q = z
      .object({ meeting_id: z.string().max(40), ids: z.string().max(2000) })
      .safeParse(req.query);
    if (!q.success) throw unreadable();
    const ctx = await data.use();
    const ids = q.data.ids.split(',').filter(Boolean).slice(0, 50);
    res.json({ ok: await ctx.files.check(q.data.meeting_id, ids) });
  });

  return router;
}

/** Calendar helpers (§8): try again for one meeting, or for every meeting that is not on the calendar yet. */
export function calendarRouter(data: DataLayer): Router {
  const router = Router();

  router.post('/calendar/retry-all', async (_req, res) => {
    const ctx = await data.use();
    res.json(await ctx.calendar.retryAll());
  });

  router.post('/calendar/retry/:id', async (req, res) => {
    const ctx = await data.use();
    const id = String(req.params.id);
    await ctx.meetings.get(id);
    await ctx.calendar.sync(id);
    res.json({ meeting: await ctx.meetings.get(id) });
  });

  return router;
}
