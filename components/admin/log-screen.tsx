'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, FormField, Input } from '@/components/ui';
import { stampText } from '@/components/meeting/format';
import { api } from '@/lib/api';
import { useMeta } from '@/lib/queries';

interface Entry {
  kind: 'change' | 'reschedule';
  at: string;
  who: string;
  what: string;
  row_id: string;
  source: string;
  changes: Record<string, [unknown, unknown]> | null;
}
interface Page {
  entries: Entry[];
  total: number;
}

const PAGE = 50;
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Admin, Change log (§7.9 d): every change, newest first, searchable. */
export function LogScreen() {
  const t = useTranslations('admin');
  const meta = useMeta();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const log = useInfiniteQuery({
    queryKey: ['admin', 'log', q],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<Page>(`/admin/log?limit=${PAGE}&offset=${pageParam}&q=${encodeURIComponent(q)}`),
    getNextPageParam: (last, all) => {
      const seen = all.reduce((n, p) => n + p.entries.length, 0);
      return seen < last.total ? seen : undefined;
    },
  });
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? [];
  const total = log.data?.pages[0]?.total ?? 0;

  return (
    <section aria-labelledby="log-heading" className="flex flex-col gap-4">
      <h2 id="log-heading">{t('tabLog')}</h2>
      <div className="max-w-xl">
        <FormField name="log-search" label={t('searchLog')}>
          {(c) => (
            <Input id={c.id} type="search" value={text} onChange={(e) => setText(e.target.value)} />
          )}
        </FormField>
      </div>
      <p role="status" className="font-semibold">
        {log.isPending ? t('loading') : t('logCount', { count: total })}
      </p>
      <ul className="flex flex-col gap-3">
        {entries.map((e, i) => (
          <li key={`${e.at}-${i}`} className="rounded-2xl border-ui border-soft bg-surface shadow-sm p-4">
            <p className="font-semibold">{e.what}</p>
            <p className="text-muted">
              {meta.data ? stampText(e.at, meta.data.settings) : e.at}
              {e.who ? ` · ${e.who}` : ''} · {t('via', { source: e.source })}
            </p>
            {e.changes && Object.keys(e.changes).length > 0 && (
              <ul className="mt-2 list-disc pl-6">
                {Object.entries(e.changes).map(([k, [from, to]]) => (
                  <li key={k}>{t('changedField', { field: k, from: show(from), to: show(to) })}</li>
                ))}
              </ul>
            )}
            {/^[0-9A-Z]{26}$/.test(e.row_id) && !e.what.startsWith('Deleted for good') && (
              <p className="mt-2">
                <Link
                  href={`/meetings/${e.row_id}`}
                  className="inline-flex min-h-tap items-center underline"
                >
                  {t('openMeeting')}
                </Link>
              </p>
            )}
          </li>
        ))}
      </ul>
      {log.hasNextPage && (
        <div>
          <Button disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
            {t('showMore')}
          </Button>
        </div>
      )}
    </section>
  );
}
