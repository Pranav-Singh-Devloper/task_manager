import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { SignJWT, jwtVerify } from 'jose';
import { SESSION_COOKIE } from '../../shared/session';
import type { Env } from '../env';
import { readCookie } from '../lib/cookies';
import type { Logger } from 'pino';
import {
  CSRF_HEADER,
  CSRF_VALUE,
  cookieOptions,
  readSession,
  setSessionCookie,
} from '../middleware/session';
import { bootstrap } from '../services/bootstrap';
import { GoogleAuth, hasOwnerScopes } from '../services/google/auth';
import type { GoogleServices } from '../services/google/types';
import { decideSignIn, needsSignIn, ownerIsReady, type Identity } from '../services/signIn';

const OAUTH_COOKIE = 'mm_oauth';
const OAUTH_COOKIE_PATH = '/api/auth';

export interface AuthDeps {
  env: Env;
  google: GoogleServices;
  auth?: GoogleAuth;
  logger: Logger;
}

const loginUrl = (error: string, email?: string) =>
  `/login?error=${error}${email ? `&email=${encodeURIComponent(email)}` : ''}`;

export function authRouter({ env, google, auth, logger }: AuthDeps): Router {
  const router = Router();
  const secret = new TextEncoder().encode(env.sessionSecret);

  router.use(
    rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false }),
  );

  /** Shared by the real Google callback and the mock sign-in. */
  async function finish(
    res: Response,
    identity: Identity,
    grant?: { refreshToken?: string; scopes: string[] },
  ): Promise<void> {
    const state = await google.state.read();
    const decision = decideSignIn(env, state, identity);
    if (!decision.ok) {
      res.redirect(loginUrl(decision.reason, identity.email));
      return;
    }

    if (decision.role === 'owner') {
      if (auth && grant) {
        const scopes = [...new Set([...(state?.grantedScopes ?? []), ...grant.scopes])];
        if (!hasOwnerScopes(scopes)) {
          // Google lets people untick individual permissions; without both the app cannot work.
          res.redirect(loginUrl('missing_scope', identity.email));
          return;
        }
        if (!grant.refreshToken && !state?.refreshTokenEnc) {
          res.redirect(loginUrl('setup_failed', identity.email));
          return;
        }
        await auth.saveOwner(grant.refreshToken, grant.scopes, identity.email);
      }
      try {
        await bootstrap(google, { spreadsheetId: env.spreadsheetId });
      } catch (err) {
        logger.error({ err }, 'first-run setup failed');
        res.redirect(loginUrl('setup_failed', identity.email));
        return;
      }
    }

    await setSessionCookie(res, env, {
      sub: identity.sub,
      email: identity.email,
      name: identity.name,
      role: decision.role,
    });
    res.redirect('/');
  }

  router.get('/google', async (req: Request, res: Response) => {
    if (env.googleMode === 'mock') {
      const as = typeof req.query.as === 'string' ? req.query.as.toLowerCase() : env.ownerEmail;
      await finish(res, {
        email: as,
        name: as === env.ownerEmail ? 'Demo owner' : 'Demo user',
        sub: `mock:${as}`,
      });
      return;
    }
    if (!auth) throw new Error('Google sign-in is not configured');
    const state = await google.state.read();
    const {
      url,
      state: oauthState,
      verifier,
    } = await auth.start({
      ownerReady: ownerIsReady(env.googleMode, state),
      hasScopes: hasOwnerScopes(state?.grantedScopes),
      switchAccount: req.query.switch === '1',
    });
    const token = await new SignJWT({ state: oauthState, verifier })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(secret);
    res.cookie(OAUTH_COOKIE, token, {
      ...cookieOptions(env),
      path: OAUTH_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(url);
  });

  router.get('/google/callback', async (req: Request, res: Response) => {
    if (env.googleMode === 'mock' || !auth) {
      res.redirect(loginUrl('try_again'));
      return;
    }
    res.clearCookie(OAUTH_COOKIE, { ...cookieOptions(env), path: OAUTH_COOKIE_PATH });
    if (typeof req.query.error === 'string') {
      res.redirect(loginUrl('cancelled'));
      return;
    }
    try {
      const { payload } = await jwtVerify(
        readCookie(req.headers.cookie, OAUTH_COOKIE) ?? '',
        secret,
        { algorithms: ['HS256'] },
      );
      if (typeof req.query.code !== 'string' || payload.state !== req.query.state)
        throw new Error('state mismatch');
      const grant = await auth.complete(req.query.code, String(payload.verifier));
      await finish(res, grant.identity, { refreshToken: grant.refreshToken, scopes: grant.scopes });
    } catch (err) {
      logger.warn({ err }, 'sign-in did not complete');
      res.redirect(loginUrl('try_again'));
    }
  });

  router.post('/logout', (req: Request, res: Response) => {
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      res
        .status(403)
        .json({
          error: {
            code: 'csrf',
            message: 'That request could not be checked. Please reload the page and try again.',
          },
        });
      return;
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions(env));
    res.status(204).end();
  });

  router.get('/me', async (req: Request, res: Response) => {
    const session = await readSession(req, env);
    if (!session) {
      res
        .status(401)
        .json({ error: { code: 'not_signed_in', message: 'Please sign in to continue.' } });
      return;
    }
    const state = await google.state.read();
    res.json({
      user: { email: session.email, name: session.name, role: session.role },
      google: { mode: env.googleMode, needsSignIn: needsSignIn(env.googleMode, state) },
    });
  });

  return router;
}
