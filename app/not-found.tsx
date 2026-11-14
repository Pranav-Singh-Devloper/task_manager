import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui';

export default async function NotFound() {
  const t = await getTranslations('errorPage');
  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1>{t('notFoundTitle')}</h1>
      <p>{t('notFoundBody')}</p>
      <Link href="/" className={buttonClasses('primary')}>
        {t('home')}
      </Link>
    </main>
  );
}
