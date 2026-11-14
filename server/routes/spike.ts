import busboy from 'busboy';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { isValid, parse } from 'date-fns';
import { isUlid } from '../../shared/ids';
import type { VerifiedSession } from '../../shared/session';
import type { Env } from '../env';
import { isAllowedMime } from '../lib/upload';
import type { GoogleServices } from '../services/google/types';
import { loadMeta } from '../services/meta';
import { createSpikeMeeting, type SpikeInput } from '../services/spike';

class BadRequest extends Error {}

const fail = (res: Response, status: number, message: string, code = 'bad_request') => {
  if (!res.headersSent) res.status(status).json({ error: { code, message } });
};

function validate(fields: Record<string, string>): Omit<SpikeInput, 'createdBy' | 'file'> {
  const topic = (fields.topic ?? '').trim();
  if (!topic) throw new BadRequest('Please add a topic.');
  if (topic.length > 200) throw new BadRequest('Please keep the topic under 200 characters.');
  const date = fields.date ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValid(parse(date, 'yyyy-MM-dd', new Date()))) {
    throw new BadRequest('Please choose a valid date.');
  }
  const startTime = fields.start_time ?? '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))
    throw new BadRequest('Please choose a valid start time.');
  const durationMin = Number(fields.duration_min ?? 60);
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) {
    throw new BadRequest('Please choose a length between 15 minutes and 8 hours.');
  }
  const id = fields.id ?? '';
  if (!isUlid(id))
    throw new BadRequest('This form is out of date. Please reload the page and try again.');
  return { id, topic, date, startTime, durationMin };
}

/**
 * M1's working slice (see services/spike.ts). Streams the upload straight to Drive: the file is never held in memory.
 */
export function spikeRouter(env: Env, google: GoogleServices): Router {
  const router = Router();
  const maxBytes = env.maxUploadMb * 1024 * 1024;
  router.use(
    rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }),
  );

  router.post('/meeting', async (req, res, next) => {
    const session = res.locals.session as VerifiedSession;
    const length = Number(req.headers['content-length'] ?? 0);
    if (length > maxBytes + 64 * 1024) {
      fail(res, 413, `That file is too big. The limit is ${env.maxUploadMb} MB.`, 'too_big');
      return;
    }

    const state = await google.state.read();
    if (!state?.activeSpreadsheetId || !state.driveRootFolderId) {
      fail(
        res,
        503,
        'The app is not set up yet. The owner needs to sign in once first.',
        'not_set_up',
      );
      return;
    }
    const meta = await loadMeta(google, state.activeSpreadsheetId);
    const ctx = {
      spreadsheetId: state.activeSpreadsheetId,
      rootFolderId: state.driveRootFolderId,
      timezone: meta.settings.timezone,
      appUrl: env.appUrl,
      calendarId: meta.settings.calendar_id,
      defaultReminders: meta.settings.default_reminders,
    };

    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: maxBytes, fields: 10 },
      });
    } catch {
      fail(res, 400, 'That request was not understood. Please try again.');
      return;
    }

    const fields: Record<string, string> = {};
    let work: Promise<unknown> | null = null;
    let problem: { status: number; message: string; code?: string } | null = null;

    const start = (file?: SpikeInput['file']) => {
      try {
        const base = validate(fields);
        work = createSpikeMeeting(google, ctx, { ...base, createdBy: session.email, file }).then(
          (result) => res.status(result.existing ? 200 : 201).json(result),
        );
      } catch (err) {
        file?.stream.resume();
        if (!(err instanceof BadRequest)) throw err;
        problem = { status: 400, message: err.message };
      }
    };

    parser.on('field', (name, value) => {
      fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || !info.filename) {
        stream.resume();
        return;
      }
      if (!isAllowedMime(info.mimeType)) {
        stream.resume();
        problem = {
          status: 415,
          message:
            'That type of file cannot be added. Please use a PDF, Office document, image, text, CSV or zip file.',
          code: 'bad_type',
        };
        return;
      }
      // If the file turns out to be bigger than the limit, stop the upload instead of saving half a file.
      stream.on('limit', () => stream.destroy(new Error('too_big')));
      start({ name: info.filename, mimeType: info.mimeType, stream });
    });
    parser.on('error', () => fail(res, 400, 'That request was not understood. Please try again.'));
    parser.on('close', () => {
      // With no file part, nothing has started yet. Validation can still fail here, so check for a problem last.
      if (!work && !problem) start();
      if (problem) {
        fail(res, problem.status, problem.message, problem.code);
        return;
      }
      Promise.resolve(work).catch(next);
    });
    req.pipe(parser);
  });

  return router;
}
