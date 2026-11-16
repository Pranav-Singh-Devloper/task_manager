'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useIsMobile } from '@/lib/use-choice';

const TABS = [
  ['tables', 'tabTables'],
  ['columns', 'tabColumns'],
  ['trash', 'tabTrash'],
  ['log', 'tabLog'],
  ['backups', 'tabBackups'],
  ['health', 'tabHealth'],
] as const;

/** The Admin tabs (one level only), and the "works best on a computer" notice on small screens (§7.9). */
export function AdminGate({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const path = usePathname();
  const mobile = useIsMobile();
  const [continued, setContinued] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t('tabsLabel')}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map(([slug, label]) => {
            const current = path === `/admin/${slug}` || path.startsWith(`/admin/${slug}/`);
            return (
              <li key={slug}>
                <Link
                  href={`/admin/${slug}`}
                  aria-current={current ? 'page' : undefined}
                  className={`inline-flex min-h-tap items-center rounded-xl border-ui px-4 font-semibold ${
                    current ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                  }`}
                >
                  {t(label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {mobile && !continued ? (
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-4"
        >
          <p className="font-semibold">{t('computerNotice')}</p>
          <Button variant="primary" onClick={() => setContinued(true)}>
            {t('continueAnyway')}
          </Button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
