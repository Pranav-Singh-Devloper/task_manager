import { getTranslations } from 'next-intl/server';
import { buttonClasses } from '@/components/ui/button';

const KNOWN_ERRORS = [
  'wrong_account',
  'not_set_up',
  'missing_scope',
  'setup_failed',
  'cancelled',
  'try_again',
] as const;
type LoginError = (typeof KNOWN_ERRORS)[number];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const t = await getTranslations('login');
  const { error, email } = await searchParams;
  const message: LoginError | null = error
    ? (KNOWN_ERRORS as readonly string[]).includes(error)
      ? (error as LoginError)
      : 'try_again'
    : null;

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10"
    >
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>

      {message && (
        <div
          role="alert"
          className="rounded-xl border-ui border-danger bg-surface p-4 font-semibold"
        >
          {message === 'wrong_account' ? t('wrong_account', { email: email ?? '' }) : t(message)}
        </div>
      )}

      {/* A plain link: signing in is a full-page trip to Google and back. */}
      <a href="/api/auth/google" className={buttonClasses('primary', 'lg', 'w-full')}>
        {t('signIn')}
      </a>
      {message === 'wrong_account' && (
        <a href="/api/auth/google?switch=1" className={buttonClasses('outline', 'lg', 'w-full')}>
          {t('differentAccount')}
        </a>
      )}
    </main>
  );
}
