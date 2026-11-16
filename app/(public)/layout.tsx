import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/button';

/** Pages anyone can read without signing in: the home page and the privacy policy that Google asks for. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('publicNav');
  const common = await getTranslations('common');
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5">
        <a href="/about" className="flex items-center gap-3 font-display text-xl font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here */}
          <img src="/icon.svg" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
          {common('appName')}
        </a>
        <a href="/login" className={buttonClasses('outline', 'md')}>
          {t('signIn')}
        </a>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 pb-16">
        {children}
      </main>
      <footer className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 border-t border-line px-4 py-6 text-muted">
        <a href="/about" className="underline">
          {t('home')}
        </a>
        <a href="/privacy" className="underline">
          {t('privacy')}
        </a>
      </footer>
    </div>
  );
}
