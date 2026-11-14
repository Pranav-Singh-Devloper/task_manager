'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusIcon } from '../icons';
import { buttonClasses } from '../ui/button';
import { NAV_ITEMS, isActive } from './nav-items';

/** The navigation shared by the desktop sidebar and the mobile drawer. */
export function SidebarContent() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-4">
      <Link href="/meetings/new" className={buttonClasses('primary', 'lg', 'w-full')}>
        <PlusIcon />
        {t('newMeeting')}
      </Link>
      <ul className="flex flex-col gap-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex min-h-tap items-center rounded-lg border-ui px-4 text-lg font-semibold',
                  active
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-transparent text-ink hover:bg-page',
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
