'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonClasses, Chip } from '@/components/ui';
import { stampText } from '@/components/meeting/format';
import { ApiError, api } from '@/lib/api';
import { useMeta } from '@/lib/queries';
import type { Meeting } from '@/shared/meeting';
import { TypedConfirm } from './typed-confirm';

/** Admin, Trash (§7.9 c): deleted meetings, with Restore and Delete forever. */
export function TrashScreen() {
  const t = useTranslations('admin');
  const client = useQueryClient();
  const meta = useMeta();
  const trash = useQuery({
    queryKey: ['admin', 'trash'],
    queryFn: () => api<{ meetings: Meeting[] }>('/admin/trash'),
  });
  const [purging, setPurging] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (trash.isPending || meta.isPending) return <p>{t('loading')}</p>;
  if (trash.isError || !trash.data || !meta.data)
    return <p className="font-semibold">{t('loadFailed')}</p>;

  async function restore(m: Meeting) {
    setMessage('');
    try {
      await api(`/admin/trash/${m.id}/restore`, { method: 'POST' });
      await client.invalidateQueries();
      setMessage(t('restored', { name: m.title }));
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t('cellFailed'));
    }
  }

  async function purge(m: Meeting, confirm: string) {
    setError('');
    try {
      await api(`/admin/trash/${m.id}`, { method: 'DELETE', body: { confirm } });
      setPurging(null);
      await client.invalidateQueries();
      setMessage(t('purged', { name: m.title }));
    } catch (e) {
      setError(e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : t('cellFailed'));
    }
  }

  return (
    <section aria-labelledby="trash-heading" className="flex flex-col gap-4">
      <h2 id="trash-heading">{t('tabTrash')}</h2>
      <p>{t('trashIntro')}</p>
      <p role="status" className="min-h-6 font-semibold">
        {message}
      </p>
      {trash.data.meetings.length === 0 ? (
        <p className="rounded-2xl border-ui border-soft bg-surface shadow-sm p-4">{t('trashEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trash.data.meetings.map((m) => {
            const cat = meta.data.categories.find((c) => c.slug === m.category_slug);
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded-2xl border-ui border-soft bg-surface shadow-sm p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold">{m.title}</span>
                  {cat && <Chip color={cat.color}>{cat.name}</Chip>}
                </div>
                {m.deleted_at && (
                  <p className="text-muted">
                    {t('deletedOn', { when: stampText(m.deleted_at, meta.data.settings) })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => void restore(m)}>
                    {t('restore')}
                    <span className="sr-only">{` — ${m.title}`}</span>
                  </Button>
                  <Link href={`/meetings/${m.id}`} className={buttonClasses('outline')}>
                    {t('view')}
                    <span className="sr-only">{` — ${m.title}`}</span>
                  </Link>
                  <Button variant="danger" onClick={() => setPurging(m.id)}>
                    {t('deleteForever')}
                    <span className="sr-only">{` — ${m.title}`}</span>
                  </Button>
                </div>
                {purging === m.id && (
                  <TypedConfirm
                    word="DELETE"
                    warning={t('purgeWarning')}
                    confirmLabel={t('deleteForever')}
                    error={error}
                    onConfirm={(typed) => void purge(m, typed)}
                    onCancel={() => setPurging(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
