'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, ConfirmDialog } from '@/components/ui';
import { stampText } from '@/components/meeting/format';
import { ApiError, api } from '@/lib/api';
import { useMeta } from '@/lib/queries';

interface Backup {
  id: string;
  name: string;
  created_at: string;
}

/** Admin, Backups (§7.9 e): Back up now, and "Use this backup" in one button. */
export function BackupsScreen() {
  const t = useTranslations('admin');
  const client = useQueryClient();
  const meta = useMeta();
  const list = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: () => api<{ backups: Backup[] }>('/admin/backups'),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [choice, setChoice] = useState<Backup | null>(null);

  async function run(call: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage('');
    try {
      await call();
      await client.invalidateQueries();
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t('cellFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="backups-heading" className="flex flex-col gap-4">
      <h2 id="backups-heading">{t('tabBackups')}</h2>
      <p>{t('backupsIntro')}</p>
      <div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void run(() => api('/admin/backup', { method: 'POST' }), t('backedUp'))}
        >
          {busy ? t('working') : t('backUpNow')}
        </Button>
      </div>
      <p role="status" className="min-h-6 font-semibold">
        {message}
      </p>
      {list.isPending || meta.isPending ? (
        <p>{t('loading')}</p>
      ) : !list.data || !meta.data ? (
        <p className="font-semibold">{t('loadFailed')}</p>
      ) : list.data.backups.length === 0 ? (
        <p className="rounded-2xl border-ui border-soft bg-surface shadow-sm p-4">{t('noBackups')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.data.backups.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-4"
            >
              <span className="flex-1">
                <span className="block font-semibold">{b.name}</span>
                <span className="text-muted">{stampText(b.created_at, meta.data.settings)}</span>
              </span>
              <Button disabled={busy} onClick={() => setChoice(b)}>
                {t('useBackup')}
                <span className="sr-only">{` — ${b.name}`}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={choice !== null}
        onOpenChange={(o) => !o && setChoice(null)}
        title={t('useBackupTitle')}
        description={t('useBackupBody')}
        confirmLabel={t('useBackup')}
        destructive
        onConfirm={() => {
          const id = choice?.id;
          setChoice(null);
          if (id)
            void run(
              () => api(`/admin/backups/${id}/activate`, { method: 'POST' }),
              t('backupInUse'),
            );
        }}
      />
    </section>
  );
}
