import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buttonClasses } from '@/components/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about');
  return { title: t('title'), description: t('description') };
}

export default async function AboutPage() {
  const t = await getTranslations('about');
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  return (
    <article className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-bold">{t('title')}</h1>
      <p className="text-lg">{t('lead')}</p>

      <h2 className="font-display text-2xl font-bold">{t('whatTitle')}</h2>
      <ul className="list-disc space-y-2 pl-6 text-lg">
        <li>{t('what1')}</li>
        <li>{t.rich('what2', { b })}</li>
        <li>{t.rich('what3', { b })}</li>
      </ul>

      <h2 className="font-display text-2xl font-bold">{t('dataTitle')}</h2>
      <p className="text-lg">
        {t.rich('dataBody', {
          policy: (chunks) => (
            <a href="/privacy" className="font-semibold underline">
              {chunks}
            </a>
          ),
        })}
      </p>

      <h2 className="font-display text-2xl font-bold">{t('whoTitle')}</h2>
      <p className="text-lg">{t('whoBody')}</p>

      <div>
        <a href="/login" className={buttonClasses('primary', 'lg')}>
          {t('cta')}
        </a>
      </div>
    </article>
  );
}
