import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('dashboard');
  return (
    <>
      <h1 className="mb-4">{t('title')}</h1>
      <p>{t('placeholder')}</p>
    </>
  );
}
