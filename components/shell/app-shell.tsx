'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CloseIcon, MenuIcon } from '../icons';
import { Button, buttonClasses } from '../ui/button';
import { NAV_ITEMS, isActive, isFormPage } from './nav-items';
import { SidebarContent } from './sidebar-content';
import { SignInBanner } from './sign-in-banner';
import { SignOutButton } from './sign-out-button';
import { TopBarControls } from './top-bar-controls';

/**
 * Left sidebar from 768 px up, a slide-in drawer opened by a labelled "Menu" button below that.
 * No dropdowns and no overflow menus: every action is a visible, labelled button.
 */
export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = NAV_ITEMS.find((i) => isActive(pathname, i.href));

  // Close the drawer after choosing a page.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  return (
    <div className="min-h-screen md:pl-[240px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[240px] overflow-y-auto border-r-ui border-line bg-surface p-4 md:block">
        <SidebarContent />
      </aside>

      <header className="z-30 border-b-ui border-line bg-surface md:sticky md:top-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 md:px-8">
          <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Trigger asChild>
              <Button className="md:hidden">
                <MenuIcon />
                {t('menu')}
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fade-in fixed inset-0 z-40 bg-black/50 md:hidden" />
              <Dialog.Content
                aria-describedby={undefined}
                className="fade-in fixed inset-y-0 left-0 z-50 w-[min(320px,85vw)] overflow-y-auto bg-surface p-4 md:hidden"
              >
                <Dialog.Title className="sr-only">{t('label')}</Dialog.Title>
                <div className="mb-4 flex justify-end">
                  <Dialog.Close asChild>
                    <Button>
                      <CloseIcon />
                      {t('closeMenu')}
                    </Button>
                  </Dialog.Close>
                </div>
                <SidebarContent />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <p className="text-xl font-semibold">{current ? t(current.key) : null}</p>

          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <TopBarControls />
            <p className="font-semibold">{userName}</p>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-[1200px] px-4 pb-28 pt-6 md:px-8 md:pb-10"
      >
        <SignInBanner />
        {children}
      </main>

      {!isFormPage(pathname) && (
        <Link
          href="/meetings/new"
          className={buttonClasses(
            'primary',
            'lg',
            'fixed bottom-4 right-4 z-30 rounded-full shadow-lg md:hidden',
          )}
        >
          {t('newMeeting')}
        </Link>
      )}
    </div>
  );
}
