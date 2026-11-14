import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from './types';

export const SESSION_COOKIE = 'mm_session';
export const SESSION_DAYS = 30;
/** A cookie older than this is re-issued on the next request, so the 30 days slide forward. */
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;

/** Used only when SESSION_SECRET is not set, which is only allowed outside production. */
export const DEV_SESSION_SECRET = 'dev-only-session-secret-change-me-0123456789';

export interface Session {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface VerifiedSession extends Session {
  iat: number;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(session: Session, secret: string): Promise<string> {
  return new SignJWT({ email: session.email, name: session.name, role: session.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key(secret));
}

/** Returns null for anything that is not a valid, unexpired session made with this secret. */
export async function verifySession(
  token: string | undefined,
  secret: string,
): Promise<VerifiedSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] });
    const { sub, email, name, role, iat } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof iat !== 'number')
      return null;
    if (role !== 'owner' && role !== 'admin') return null;
    return { sub, email, name: typeof name === 'string' ? name : email, role, iat };
  } catch {
    return null;
  }
}

export function needsRefresh(
  session: VerifiedSession,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return nowSeconds - session.iat > SESSION_REFRESH_AFTER_SECONDS;
}

export const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
