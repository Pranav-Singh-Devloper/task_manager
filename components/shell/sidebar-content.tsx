'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GearIcon, HomeIcon, TableIcon } from '../icons';
import { Glare, Shine } from '../motion';
import { buttonClasses } from '../ui/button';
import { NAV_ITEMS, isActive, type NavKey } from './nav-items';

const ICONS: Record<NavKey, typeof HomeIcon> = {
  dashboard: HomeIcon,
  admin: TableIcon,
  settings: GearIcon,
};

/** The app's name and mark, at the top of the sidebar and the drawer. */
export function Brand() {
  const common = useTranslations('common');
  return (
    <Link href="/" className="flex min-h-tap items-center gap-3 rounded-xl px-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here */}
      <img
        src="/icon.svg"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 rounded-xl shadow-sm"
      />
      <span className="font-display text-xl font-semibold leading-tight">
        <Shine>{common('appName')}</Shine>
      </span>
    </Link>
  );
}

/** The navigation shared by the desktop sidebar and the mobile drawer. */
export function SidebarContent() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-4">
      <Glare block>
        {/* Less side padding than other large buttons, so "+ New meeting" stays on one line in the 240 px sidebar. */}
        <Link href="/meetings/new" className={buttonClasses('primary', 'lg', 'w-full !px-3')}>
          {t('newMeeting')}
        </Link>
      </Glare>
      <ul className="flex flex-col gap-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = ICONS[item.key];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex min-h-tap items-center gap-3 rounded-xl border-ui px-4 text-lg font-semibold transition-colors',
                  active
                    ? 'btn-primary border-accent bg-accent text-accent-ink'
                    : 'border-transparent text-ink hover:bg-sunken',
                )}
              >
                <Icon width={22} height={22} />
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
