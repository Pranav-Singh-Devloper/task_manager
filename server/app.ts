import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Env } from './env';
import { requireSession } from './middleware/session';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { metaRouter } from './routes/meta';
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
  api.use(metaRouter(google));
  api.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'We could not find that.' } });
  });
  app.use('/api', api);

  // Express only treats a handler as an error handler when it takes four arguments.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    logger.error({ err, path: req.path }, 'request failed');
    if (res.headersSent) return;
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
