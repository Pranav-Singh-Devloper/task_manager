import { getTranslations } from 'next-intl/server';
import { FocusText, Glare, PageTitle, Sparkles, WarmBackground } from '@/components/motion';
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
    <Sparkles className="relative min-h-screen">
      <WarmBackground className="!fixed" />
      <main
        id="main"
        tabIndex={-1}
        className="relative mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10"
      >
        <div className="glass flex flex-col gap-6 rounded-3xl border-ui border-soft p-6 shadow-lg md:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here */}
          <img
            src="/icon.svg"
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl shadow-md"
          />
          <PageTitle>{t('title')}</PageTitle>
          <FocusText text={t('intro')} className="text-lg" />

          {message && (
            <div
              role="alert"
              className="rounded-2xl border-ui border-danger bg-surface p-4 font-semibold"
            >
              {message === 'wrong_account'
                ? t('wrong_account', { email: email ?? '' })
                : t(message)}
            </div>
          )}

          {/* A plain link: signing in is a full-page trip to Google and back. */}
          <Glare block>
            <a href="/api/auth/google" className={buttonClasses('primary', 'lg', 'w-full')}>
              {t('signIn')}
            </a>
          </Glare>
          {message === 'wrong_account' && (
            <a
              href="/api/auth/google?switch=1"
              className={buttonClasses('outline', 'lg', 'w-full')}
            >
              {t('differentAccount')}
            </a>
          )}
          <p className="flex flex-wrap gap-x-6 gap-y-2 text-muted">
            <a href="/about" className="underline">
              {t('aboutLink')}
            </a>
            <a href="/privacy" className="underline">
              {t('privacyLink')}
            </a>
          </p>
        </div>
      </main>
    </Sparkles>
  );
}
