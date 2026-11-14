'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui';

/** Shown when a page fails to draw. Plain words and a way forward (§11). */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errorPage');
  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1>{t('title')}</h1>
      <p>{t('body')}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClasses('primary')} onClick={() => reset()}>
          {t('tryAgain')}
        </button>
        <Link href="/" className={buttonClasses('outline')}>
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
