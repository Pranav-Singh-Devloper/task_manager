'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { NextMeetings } from '@/components/dashboard/next-meetings';
import { Welcome } from '@/components/dashboard/welcome';
import { tileHref, useTileWords } from '@/components/trackers/kpi-tiles';
import { api } from '@/lib/api';
import { useMeta, useTrackerSummaries, type Meta, type TrackerSummary } from '@/lib/queries';
import type { Meeting } from '@/shared/meeting';

interface MeetingsSummary {
  upcoming: Meeting[];
  incomplete: number;
  waiting: number;
  unsynced: number;
}

/**
 * The home page: what is coming up and what needs a look, across meetings and every tracker, on one screen.
 * Every number opens the list behind it.
 */
export function HomeScreen() {
  const t = useTranslations('home');
  const meta = useMeta();
  if (meta.isPending) return <p>{t('loading')}</p>;
  if (!meta.data) return null;
  return <Home meta={meta.data} />;
}

function Home({ meta }: { meta: Meta }) {
  const t = useTranslations('home');
  const words = useTileWords();
  const meetings = useQuery({
    queryKey: ['summary'],
    queryFn: () => api<MeetingsSummary>('/meetings/summary'),
  });
  const trackers = useTrackerSummaries();
  const lists = trackers.data?.trackers ?? [];

  const alerts: { key: string; href: string; text: string }[] = [];
  const m = meetings.data;
  if (m?.incomplete)
    alerts.push({
      key: 'm-incomplete',
      href: '/meetings?show=incomplete',
      text: t('meetingsIncomplete', { count: m.incomplete }),
    });
  if (m?.waiting)
    alerts.push({
      key: 'm-waiting',
      href: '/meetings?show=awaiting',
      text: t('meetingsWaiting', { count: m.waiting }),
    });
  if (m?.unsynced)
    alerts.push({
      key: 'm-unsynced',
      href: '/meetings',
      text: t('meetingsUnsynced', { count: m.unsynced }),
    });
  for (const s of lists) {
    for (const tile of s.kpis.tiles) {
      if (tile.tone !== 'alert' || tile.value <= 0) continue;
      const w = words(tile);
      alerts.push({
        key: `${s.tracker.slug}-${tile.id}`,
        href: tileHref(s.tracker.slug, tile),
        text: t('alertLine', { name: s.tracker.name, what: `${w.value} · ${w.label}` }),
      });
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <Welcome settings={meta.settings} title={t('welcomeTitle')} />
        <NextMeetings
          meetings={m?.upcoming ?? []}
          meta={meta}
          settings={meta.settings}
          pending={meetings.isPending}
        />
      </div>

      <section aria-labelledby="attention-heading" className="flex flex-col gap-2">
        <h2 id="attention-heading" className="font-display text-2xl font-semibold">
          {t('attentionTitle')}
        </h2>
        {meetings.isPending || trackers.isPending ? (
          <p>{t('loading')}</p>
        ) : alerts.length === 0 ? (
          <p className="text-muted">{t('allClear')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className="lift inline-flex min-h-tap items-center rounded-2xl border-ui border-danger bg-surface px-4 py-2 font-semibold shadow-sm hover:bg-sunken"
                >
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lists-heading" className="flex flex-col gap-2">
        <h2 id="lists-heading" className="sr-only">
          {t('listsTitle')}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lists.map((s) => (
            <li key={s.tracker.slug}>
              <ListCard summary={s} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** One tracker: its name and its numbers, each opening the list with that filter. */
function ListCard({ summary }: { summary: TrackerSummary }) {
  const words = useTileWords();
  const nav = useTranslations('nav');
  const { tracker, kpis } = summary;
  const headingId = `card-${tracker.slug}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-2 rounded-2xl border-ui border-soft bg-surface p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="font-display text-xl font-semibold">
          <Link
            href={`/trackers/${tracker.slug}`}
            className="inline-flex min-h-tap items-center gap-2 underline-offset-4 hover:underline"
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ background: tracker.color }}
            />
            {tracker.name}
          </Link>
        </h3>
        <Link
          href={`/trackers/${tracker.slug}/new`}
          className="lift inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl border-ui border-line bg-surface px-3 font-semibold shadow-sm hover:bg-sunken"
        >
          {nav('add')}
          <span className="sr-only">{` — ${tracker.name}`}</span>
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {kpis.tiles.map((tile) => {
          const w = words(tile);
          const alert = tile.tone === 'alert' && tile.value > 0;
          return (
            <li key={tile.id}>
              <Link
                href={tileHref(tracker.slug, tile)}
                className={clsx(
                  'flex h-full min-h-tap flex-col justify-center rounded-xl border-ui px-3 py-2 hover:bg-sunken',
                  alert ? 'border-danger' : 'border-soft',
                )}
              >
                <span
                  className={clsx(
                    'font-display text-2xl font-semibold leading-none',
                    alert && 'text-danger',
                  )}
                >
                  {w.value}
                </span>
                <span className="leading-snug">{w.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
