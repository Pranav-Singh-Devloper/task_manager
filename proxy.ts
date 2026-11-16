import { NextResponse, type NextRequest } from 'next/server';
import {
  DEV_SESSION_SECRET,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  needsRefresh,
  signSession,
  verifySession,
} from '@/shared/session';

/**
 * The page's content security policy (§10). Scripts run only with this request's nonce, never with `unsafe-inline`.
 * Styles allow inline because the calendar and the grid add their own style tags. React's development mode needs `eval`.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const PUBLIC_PATHS = ['/login', '/about', '/privacy'];

/** Sends signed-out visitors to /login and keeps the 30-day session sliding (Next's "middleware", renamed proxy in Next 16). */
export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET || DEV_SESSION_SECRET;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);
  const { pathname, searchParams } = req.nextUrl;

  // The login page and the two public pages Google asks for (home page, privacy policy) need no sign-in.
  if (!session && !PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  // A signed-in person has no reason to see the login page, unless they were just sent back with a message.
  if (session && pathname === '/login' && !searchParams.has('error')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // A new nonce for every request. Next reads it from the request's CSP header and puts it on its own scripts.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production');
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('content-security-policy', csp);
  if (session && needsRefresh(session)) {
    res.cookies.set(SESSION_COOKIE, await signSession(session, secret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: (process.env.APP_URL ?? '').startsWith('https://'),
      path: '/',
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    });
  }
  return res;
}

export const config = {
  // API routes are handled by Express, never by this guard.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|icons/|sw.js|offline.html|manifest.webmanifest).*)',
  ],
};
