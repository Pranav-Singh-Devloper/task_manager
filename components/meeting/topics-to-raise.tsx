'use client';

import { useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui';
import { api } from '@/lib/api';
import type { Meta, TrackerData } from '@/lib/queries';
import { isClosed } from '@/shared/trackerKpis';

/**
 * On a meeting with someone, the open discussion topics with that person (from any Discussions-style list), so they
 * can all be raised in the same sitting. A topic matches when its "Discussion with" value appears in the meeting's
 * title or kind, ignoring case: "Member(T)" matches "Meeting with Member(T)".
 */
export function TopicsToRaise({
  meta,
  title,
  categoryName,
}: {
  meta: Meta;
  title: string;
  categoryName: string;
}) {
  const t = useTranslations('detail');
  const lists = meta.trackers.filter(
    (x) => x.active && x.kind === 'discussion' && x.settings.roles.group_key,
  );
  const results = useQueries({
    queries: lists.map((x) => ({
      queryKey: ['tracker', x.slug, 'rows'],
      queryFn: () => api<TrackerData>(`/trackers/${x.slug}/rows`),
    })),
  });
  const hay = `${title} ${categoryName}`.toLowerCase();
  const topics = results.flatMap((r, i) => {
    const list = lists[i];
    if (!r.data || !list) return [];
    const roles = list.settings.roles;
    return r.data.rows
      .filter((row) => !isClosed(row, roles))
      .filter((row) => {
        const who = String(row.values[roles.group_key] ?? '').trim();
        return who.length > 1 && hay.includes(who.toLowerCase());
      })
      .map((row) => ({
        id: row.id,
        slug: list.slug,
        who: String(row.values[roles.group_key] ?? ''),
        topic: String(row.values[roles.title_key] ?? '') || list.name,
      }));
  });
  if (topics.length === 0) return null;
  const who = topics[0]?.who ?? '';
  return (
    <Card className="!p-4 md:!p-5">
      <CardTitle>{t('topicsTitle', { who, count: topics.length })}</CardTitle>
      <ul className="flex flex-col">
        {topics.map((x) => (
          <li key={x.id}>
            <Link
              href={`/trackers/${x.slug}/${x.id}`}
              className="inline-flex min-h-tap items-center underline"
            >
              {x.topic}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
