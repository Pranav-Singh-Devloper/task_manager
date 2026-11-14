import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AdminGate } from '@/components/admin/admin-gate';

export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getTranslations('admin');
  return (
    <>
      <h1 className="mb-4">{t('title')}</h1>
      <AdminGate>{children}</AdminGate>
    </>
  );
}
