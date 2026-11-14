import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('topbar');
  // Sign-in arrives in the next phase; until then the shell shows a demo user.
  return <AppShell userName={t('demoUser')}>{children}</AppShell>;
}
