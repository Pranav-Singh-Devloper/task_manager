import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AdminGate } from '@/components/admin/admin-gate';
import { PageTitle } from '@/components/motion';

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getTranslations('admin');
  return (
    <>
      <PageTitle className="mb-4">{t('title')}</PageTitle>
      <AdminGate>{children}</AdminGate>
    </>
  );
}
