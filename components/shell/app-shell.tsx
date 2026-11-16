'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CloseIcon, MenuIcon } from '../icons';
import { Sparkles } from '../motion';
import { Button, buttonClasses } from '../ui/button';
import { NAV_ITEMS, isActive, isFormPage } from './nav-items';
import { Brand, SidebarContent } from './sidebar-content';
import { SignInBanner } from './sign-in-banner';
import { SignOutButton } from './sign-out-button';
import { TopBarControls } from './top-bar-controls';
import { UserNameContext } from './user-name';

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
    <UserNameContext.Provider value={userName}>
      <Sparkles className="min-h-screen md:pl-[240px]">
        <aside className="glass fixed inset-y-0 left-0 hidden w-[240px] overflow-y-auto border-r-ui border-soft p-4 md:flex md:flex-col md:gap-6">
          <Brand />
          <SidebarContent />
        </aside>

        <header className="glass z-30 border-b-ui border-soft md:sticky md:top-0">
          {/* Phone: Menu, the name and Sign out on one row, the text size and contrast buttons below. The page's own
              heading says where you are, so the page name is shown here from tablet width up only. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 md:gap-x-4 md:px-8 md:py-3">
            <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <Dialog.Trigger asChild>
                <Button className="md:hidden">
                  <MenuIcon />
                  {t('menu')}
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fade-in fixed inset-0 z-40 bg-[#2a1f16]/45 backdrop-blur-sm md:hidden" />
                <Dialog.Content
                  aria-describedby={undefined}
                  className="drawer-in fixed inset-y-0 left-0 z-50 flex w-[min(320px,85vw)] flex-col gap-6 overflow-y-auto rounded-r-3xl bg-surface p-4 shadow-lg md:hidden"
                >
                  <Dialog.Title className="sr-only">{t('label')}</Dialog.Title>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Brand />
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

            <p className="hidden font-display text-xl font-semibold md:mr-auto md:block">
              {current ? t(current.key) : null}
            </p>

            <div className="order-last w-full md:order-none md:w-auto">
              <TopBarControls />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3 md:flex-none md:gap-4">
              <p className="min-w-0 truncate font-semibold" title={userName}>
                {userName}
              </p>
              <SignOutButton />
            </div>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-[1200px] px-4 pb-28 pt-4 md:px-8 md:pb-8 md:pt-5"
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
              'fixed bottom-4 right-4 z-30 !rounded-full !shadow-lg md:hidden',
            )}
          >
            {t('newMeeting')}
          </Link>
        )}
      </Sparkles>
    </UserNameContext.Provider>
  );
}
