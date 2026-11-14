'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useDatabaseMissing } from '@/lib/db-missing';

/** Shows the recovery page instead of the screen when the database cannot be found (§11). */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const missing = useDatabaseMissing();
  return missing ? <Recovery /> : <>{children}</>;
}

function Recovery() {
  const t = useTranslations('recover');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function run(action: 'backup' | 'new') {
    setBusy(true);
    setMessage('');
    try {
      await api('/recover', { method: 'POST', body: { action } });
      // A full reload on purpose: it clears everything the screen remembered about the old database.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t('failed'));
      setBusy(false);
    }
  }

  return (
    <div role="alert" className="flex max-w-2xl flex-col gap-4">
      <h1>{t('title')}</h1>
      <p>{t('body')}</p>
      <ul className="list-disc pl-6">
        <li>{t('stepLook')}</li>
        <li>{t('stepBackup')}</li>
        <li>{t('stepNew')}</li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={busy} onClick={() => window.location.reload()}>
          {t('tryAgain')}
        </Button>
        <Button disabled={busy} onClick={() => void run('backup')}>
          {t('useBackup')}
        </Button>
        <Button disabled={busy} onClick={() => void run('new')}>
          {t('setUpNew')}
        </Button>
      </div>
      <p role="status" className="font-semibold">
        {message}
      </p>
    </div>
  );
}
