import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { DEV_SESSION_SECRET, SESSION_COOKIE, verifySession } from '@/shared/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const session = await verifySession(
    jar.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET || DEV_SESSION_SECRET,
  );
  // proxy.ts already sends signed-out visitors to /login, so a session is always present here.
  return <AppShell userName={session?.name ?? ''}>{children}</AppShell>;
}
