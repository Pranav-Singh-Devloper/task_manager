'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { stampText } from '@/components/meeting/format';
import { ApiError, api } from '@/lib/api';
import { useMeta } from '@/lib/queries';

interface Health {
  google: { mode: 'live' | 'mock'; email: string | null; needsSignIn: boolean };
  last_refresh: string | null;
  not_on_calendar: number;
  pending_uploads: number;
  last_backup: string | null;
  jobs: Record<string, { lastRunAt: string; ok: boolean; message?: string }>;
  config_problems: string[];
  unmanaged_columns: { tab: string; column: string }[];
  attention: string[];
  duplicate_databases: number;
  app_version: string;
  schema_version: number;
}

function Line({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border-ui border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div>{children}</div>
      </div>
      {action}
    </li>
  );
}

/** Admin, System health (§7.9 f): plain words, and a button wherever there is something to do. */
export function HealthScreen() {
  const t = useTranslations('admin');
  const client = useQueryClient();
  const meta = useMeta();
  const health = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () => api<Health>('/admin/health'),
    staleTime: 0,
  });
  const [message, setMessage] = useState('');

  if (health.isPending || meta.isPending) return <p>{t('loading')}</p>;
  if (health.isError || !health.data || !meta.data)
    return <p className="font-semibold">{t('loadFailed')}</p>;
  const h = health.data;
  const when = (iso: string | null) => (iso ? stampText(iso, meta.data.settings) : t('never'));

  async function run(call: () => Promise<unknown>, done: string) {
    setMessage('');
    try {
      await call();
      await client.invalidateQueries();
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : t('cellFailed'));
    }
  }

  const jobNames: Record<string, string> = {
    'calendar-retry': t('jobCalendar'),
    'expire-uploads': t('jobUploads'),
  };

  return (
    <section aria-labelledby="health-heading" className="flex flex-col gap-4">
      <h2 id="health-heading">{t('tabHealth')}</h2>
      <p role="status" className="min-h-6 font-semibold">
        {message}
      </p>
      <ul className="flex flex-col gap-3">
        <Line
          title={t('hGoogle')}
          action={
            h.google.needsSignIn ? (
              <a
                href="/api/auth/google"
                className="inline-flex min-h-tap items-center rounded-xl border-ui border-accent bg-accent px-5 font-semibold text-accent-ink"
              >
                {t('signIn')}
              </a>
            ) : undefined
          }
        >
          {h.google.needsSignIn
            ? t('needsSignIn')
            : t('connectedAs', { email: h.google.email ?? '—', mode: h.google.mode })}
        </Line>
        <Line
          title={t('hRefresh')}
          action={
            <Button
              onClick={() => void run(() => api('/refresh', { method: 'POST' }), t('refreshed'))}
            >
              {t('refreshNow')}
            </Button>
          }
        >
          {when(h.last_refresh)}
        </Line>
        <Line
          title={t('hCalendar')}
          action={
            h.not_on_calendar > 0 ? (
              <Button
                onClick={() =>
                  void run(() => api('/calendar/retry-all', { method: 'POST' }), t('retried'))
                }
              >
                {t('retryAll')}
              </Button>
            ) : undefined
          }
        >
          {h.not_on_calendar === 0
            ? t('allOnCalendar')
            : t('notOnCalendar', { count: h.not_on_calendar })}
        </Line>
        <Line title={t('hUploads')}>{t('pendingUploads', { count: h.pending_uploads })}</Line>
        <Line title={t('hBackup')}>{when(h.last_backup)}</Line>
        {Object.entries(h.jobs).map(([name, j]) => (
          <Line key={name} title={jobNames[name] ?? name}>
            {when(j.lastRunAt)} · {j.ok ? t('jobOk') : t('jobFailed')}
            {j.message ? ` · ${j.message}` : ''}
          </Line>
        ))}
        <Line title={t('hProblems')}>
          {h.config_problems.length === 0 &&
          h.attention.length === 0 &&
          h.unmanaged_columns.length === 0 ? (
            t('noProblems')
          ) : (
            <ul className="list-disc pl-6">
              {h.config_problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
              {h.attention.map((p) => (
                <li key={p}>{p}</li>
              ))}
              {h.unmanaged_columns.map((c) => (
                <li key={`${c.tab}-${c.column}`}>
                  {t('unmanaged', { tab: c.tab, column: c.column })}
                </li>
              ))}
            </ul>
          )}
        </Line>
        <Line title={t('hDuplicates')}>
          {h.duplicate_databases === 0
            ? t('noDuplicates')
            : t('duplicates', { count: h.duplicate_databases })}
        </Line>
        <Line title={t('hVersion')}>
          {t('versionLine', { app: h.app_version, schema: h.schema_version })}
        </Line>
      </ul>
    </section>
  );
}
