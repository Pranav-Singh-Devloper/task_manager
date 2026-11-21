'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMeta } from '@/lib/queries';
import { CalendarIcon, GearIcon, HomeIcon, TableIcon } from '../icons';
import { Shine } from '../motion';
import { isActive } from './nav-items';

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

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex min-h-tap min-w-0 flex-1 items-center gap-2.5 rounded-xl border-ui px-3 py-1 text-base font-semibold leading-tight transition-colors',
        active
          ? 'btn-primary border-accent bg-accent text-accent-ink'
          : 'border-transparent text-ink hover:bg-sunken',
      )}
    >
      {children}
    </Link>
  );
}

/** "Add" beside a list, as in the owner's sketch: one tap to a new row. Its name says which list. */
function AddLink({ href, name }: { href: string; name: string }) {
  const t = useTranslations('nav');
  return (
    <Link
      href={href}
      className="lift inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-xl border-ui border-line bg-surface px-2 font-semibold shadow-sm hover:bg-sunken"
    >
      {t('add')}
      <span className="sr-only">{` — ${name}`}</span>
    </Link>
  );
}

/**
 * The navigation shared by the desktop sidebar and the mobile drawer: the Dashboard, Meetings and every tracker,
 * each list with its own Add, then Admin and Settings.
 */
export function SidebarContent() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const meta = useMeta();
  const trackers = (meta.data?.trackers ?? []).filter((x) => x.active);

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center gap-2">
          <NavLink href="/" active={isActive(pathname, '/')}>
            <HomeIcon width={22} height={22} />
            {t('dashboard')}
          </NavLink>
        </li>
        <li className="flex items-center gap-2">
          <NavLink
            href="/meetings"
            active={isActive(pathname, '/meetings') && pathname !== '/meetings/new'}
          >
            <CalendarIcon width={22} height={22} />
            {t('meetings')}
          </NavLink>
          <AddLink href="/meetings/new" name={t('meetings')} />
        </li>
        {trackers.map((tr) => (
          <li key={tr.slug} className="flex items-center gap-2">
            <NavLink
              href={`/trackers/${tr.slug}`}
              active={isActive(pathname, `/trackers/${tr.slug}`) && !pathname.endsWith('/new')}
            >
              <span
                aria-hidden="true"
                className="ml-1 h-3 w-3 shrink-0 rounded-full"
                style={{ background: tr.color }}
              />
              {tr.name}
            </NavLink>
            <AddLink href={`/trackers/${tr.slug}/new`} name={tr.name} />
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1.5 border-t-ui border-soft pt-3">
        <li className="flex">
          <NavLink href="/admin" active={isActive(pathname, '/admin')}>
            <TableIcon width={22} height={22} />
            {t('admin')}
          </NavLink>
        </li>
        <li className="flex">
          <NavLink href="/settings" active={isActive(pathname, '/settings')}>
            <GearIcon width={22} height={22} />
            {t('settings')}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
