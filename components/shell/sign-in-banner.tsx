'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { buttonClasses } from '../ui/button';

/** Shown to everyone when Google no longer accepts the owner's saved sign-in. No data is lost. */
export function SignInBanner() {
  const t = useTranslations('banner');
  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setNeedsSignIn(Boolean(me?.google?.needsSignIn)))
      .catch(() => undefined);
  }, []);

  if (!needsSignIn) return null;
  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border-ui border-danger bg-surface p-4"
    >
      <p className="flex-1 font-semibold">{t('signInAgain')}</p>
      <a href="/api/auth/google" className={buttonClasses('primary')}>
        {t('signIn')}
      </a>
    </div>
  );
}
