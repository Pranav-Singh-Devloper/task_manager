import { NextResponse, type NextRequest } from 'next/server';
import {
  DEV_SESSION_SECRET,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  needsRefresh,
  signSession,
  verifySession,
} from '@/shared/session';

/** Sends signed-out visitors to /login and keeps the 30-day session sliding (Next's "middleware", renamed proxy in Next 16). */
export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET || DEV_SESSION_SECRET;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);
  const { pathname, searchParams } = req.nextUrl;

  if (!session && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  // A signed-in person has no reason to see the login page, unless they were just sent back with a message.
  if (session && pathname === '/login' && !searchParams.has('error')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const res = NextResponse.next();
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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
