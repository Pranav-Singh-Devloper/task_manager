import express, { type ErrorRequestHandler, type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './env';
import { requireSession } from './middleware/session';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { calendarRouter, filesRouter } from './routes/files';
import { healthRouter } from './routes/health';
import { meetingsRouter } from './routes/meetings';
import { metaRouter } from './routes/meta';
import { recoverRouter } from './routes/recover';
import { trackersRouter } from './routes/trackers';
import { AppError } from './lib/errors';
import { DataLayer } from './services/data';
import { isGoogleApiError } from './services/google/errors';
import type { GoogleAuth } from './services/google/auth';
import type { GoogleServices } from './services/google/types';

export interface AppDeps {
  env: Env;
  google: GoogleServices;
  logger: Logger;
  /** Present in live mode only. */
  auth?: GoogleAuth;
}

/** The API half of the server. Next.js pages are attached in index.ts. */
export function createApp({ env, google, logger, auth }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // The strict nonce-based CSP is added in the hardening phase; Next dev needs inline scripts until then.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.use(healthRouter(env, google));
  api.use('/auth', authRouter({ env, google, auth, logger }));
  // Everything below needs a signed-in user, and mutating requests need the CSRF header.
  api.use(requireSession(env));
  api.use(recoverRouter(google));
  const data = new DataLayer(google, {
    logger,
    appUrl: env.appUrl,
    maxUploadMb: env.maxUploadMb,
  });
  app.locals.data = data;
  api.use(metaRouter(data));
  api.use(meetingsRouter(data));
  api.use(trackersRouter(data));
  // Uploads are the heavy request, so they get their own limit (§10).
  api.post(
    '/files',
    rateLimit({
      windowMs: 10 * 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: {
            code: 'rate_limited',
            message: 'That is a lot of files at once. Please wait a few minutes and try again.',
          },
        });
      },
    }),
  );
  api.use(filesRouter(data));
  api.use(adminRouter(data));
  api.use(calendarRouter(data));
  api.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'We could not find that.' } });
  });
  app.use('/api', api);

  // Express only treats a handler as an error handler when it takes four arguments.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (res.headersSent) return;

    // Problems we expect and can explain: say what happened in plain words.
    if (err instanceof AppError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          ...(err.issues ? { issues: err.issues } : {}),
          ...(err.details ? { details: err.details } : {}),
        },
      });
      return;
    }
    if (isGoogleApiError(err)) {
      logger.warn(
        { status: err.status, reason: err.reason, path: req.path },
        'google request failed',
      );
      if (err.reason === 'invalid_grant' || err.reason === 'needs_sign_in') {
        res
          .status(401)
          .json({ error: { code: 'needs_sign_in', message: 'Please sign in with Google again.' } });
      } else {
        res.status(503).json({
          error: {
            code: 'google_unavailable',
            message:
              "We couldn't reach Google right now. Your changes are still here. Please try again.",
          },
        });
      }
      return;
    }
    // A request body that is not valid JSON.
    if ((err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({
        error: {
          code: 'bad_request',
          message: 'That request was not understood. Please reload the page and try again.',
        },
      });
      return;
    }

    logger.error({ err, path: req.path }, 'request failed');
    res.status(500).json({
      error: {
        code: 'server_error',
        message: 'Something went wrong on our side. Please try again.',
      },
    });
  };
  app.use(onError);
  return app;
}
