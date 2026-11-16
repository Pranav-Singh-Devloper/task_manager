import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  return { title: t('title'), description: t('description') };
}

// The contact address comes from the server's settings, so it is read on each request and not baked in at build time.
export const dynamic = 'force-dynamic';

const UPDATED = '16 November 2026';
const LINK = 'font-semibold underline';

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  const contact = process.env.CONTACT_EMAIL?.trim();
  const b = (chunks: ReactNode) => <strong>{chunks}</strong>;
  const h2 = 'font-display text-2xl font-bold';
  return (
    <article className="flex flex-col gap-5 text-lg">
      <h1 className="font-display text-4xl font-bold">{t('title')}</h1>
      <p className="text-muted">{t('updated', { date: UPDATED })}</p>
      <p>{t('intro')}</p>

      <h2 className={h2}>{t('accessTitle')}</h2>
      <p>{t('accessIntro')}</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>{t.rich('access1', { b })}</li>
        <li>{t.rich('access2', { b })}</li>
        <li>{t.rich('access3', { b })}</li>
      </ul>

      <h2 className={h2}>{t('storedTitle')}</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>{t.rich('stored1', { b })}</li>
        <li>{t.rich('stored2', { b })}</li>
        <li>{t.rich('stored3', { b })}</li>
      </ul>

      <h2 className={h2}>{t('usedTitle')}</h2>
      <p>{t('usedBody')}</p>

      <h2 className={h2}>{t('googleTitle')}</h2>
      <p>
        {t.rich('googleBody', {
          policy: (chunks) => (
            <a
              className={LINK}
              href="https://developers.google.com/terms/api-services-user-data-policy"
            >
              {chunks}
            </a>
          ),
        })}
      </p>

      <h2 className={h2}>{t('safeTitle')}</h2>
      <p>{t('safeBody')}</p>

      <h2 className={h2}>{t('choicesTitle')}</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          {t.rich('choice1', {
            b,
            perms: (chunks) => (
              <a className={LINK} href="https://myaccount.google.com/permissions">
                {chunks}
              </a>
            ),
          })}
        </li>
        <li>{t.rich('choice2', { b })}</li>
        <li>{t.rich('choice3', { b })}</li>
      </ul>

      <h2 className={h2}>{t('changesTitle')}</h2>
      <p>{t('changesBody')}</p>

      <h2 className={h2}>{t('contactTitle')}</h2>
      <p>
        {contact
          ? t.rich('contactWith', {
              email: contact,
              mail: (chunks) => (
                <a className={LINK} href={`mailto:${contact}`}>
                  {chunks}
                </a>
              ),
            })
          : t('contactWithout')}
      </p>
    </article>
  );
}
