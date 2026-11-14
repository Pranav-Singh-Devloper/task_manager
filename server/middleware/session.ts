import type { Request, RequestHandler, Response } from 'express';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  needsRefresh,
  signSession,
  verifySession,
  type VerifiedSession,
} from '../../shared/session';
import type { Env } from '../env';
import { readCookie } from '../lib/cookies';

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'mm';

export function cookieOptions(env: Pick<Env, 'appUrl'>) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.appUrl.startsWith('https://'),
    path: '/',
  };
}

export async function readSession(
  req: Request,
  env: Pick<Env, 'sessionSecret'>,
): Promise<VerifiedSession | null> {
  return verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), env.sessionSecret);
}

export async function setSessionCookie(
  res: Response,
  env: Pick<Env, 'sessionSecret' | 'appUrl'>,
  session: { sub: string; email: string; name: string; role: 'owner' | 'admin' },
): Promise<void> {
  res.cookie(SESSION_COOKIE, await signSession(session, env.sessionSecret), {
    ...cookieOptions(env),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/** Every route after this needs a signed-in user, and mutating requests need the CSRF header. */
export function requireSession(env: Pick<Env, 'sessionSecret' | 'appUrl'>): RequestHandler {
  return async (req, res, next) => {
    const session = await readSession(req, env);
    if (!session) {
      res
        .status(401)
        .json({ error: { code: 'not_signed_in', message: 'Please sign in to continue.' } });
      return;
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers[CSRF_HEADER] !== CSRF_VALUE
    ) {
      res.status(403).json({
        error: {
          code: 'csrf',
          message: 'That request could not be checked. Please reload the page and try again.',
        },
      });
      return;
    }
    // Slide the 30 days forward once the cookie is a day old.
    if (needsRefresh(session)) await setSessionCookie(res, env, session);
    res.locals.session = session;
    next();
  };
}
