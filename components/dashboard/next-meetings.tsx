'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { GlowCard } from '@/components/motion';
import { dateText, timeText } from '@/components/meeting/format';
import { buttonClasses } from '@/components/ui';
import type { Meta } from '@/lib/queries';
import type { Meeting } from '@/shared/meeting';
import type { Settings } from '@/shared/types';
import { CategoryChip, StatusCell, isWebLink } from './row-bits';

/**
 * The next three open meetings, soonest first, one compact row each: when, what, and Open (plus Join when there is
 * a link). Only the soonest one's Open is the filled button, so the screen keeps one main action.
 */
export function NextMeetings({
  meetings,
  meta,
  settings,
  pending,
}: {
  meetings: Meeting[];
  meta: Meta;
  settings: Settings;
  pending: boolean;
}) {
  const t = useTranslations('dashboard');
  const nav = useTranslations('nav');

  return (
    <GlowCard as="section" className="h-full">
      <h2 className="mb-2 font-display text-2xl font-semibold">
        {t('nextTitle', { count: Math.max(1, meetings.length) })}
      </h2>
      {pending ? (
        <p>{t('loading')}</p>
      ) : meetings.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p>{t('noUpcoming')}</p>
          <Link href="/meetings/new" className={buttonClasses('primary')}>
            {nav('newMeeting')}
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col divide-y divide-soft">
          {meetings.map((m, i) => {
            const date = typeof m.values.date === 'string' ? dateText(m.values.date, settings) : '';
            const time =
              typeof m.values.start_time === 'string'
                ? timeText(m.values.start_time, settings)
                : '';
            const status = String(m.values.meeting_status || 'Scheduled');
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0 md:gap-x-4"
              >
                {/* One line on a phone; the date above the time in a column of its own on a computer. */}
                <p className="w-full font-display text-lg font-semibold leading-snug text-accent md:w-44 md:shrink-0">
                  {date}
                  {time && (
                    <>
                      <span className="md:hidden">{' · '}</span>
                      <span className="md:block">{time}</span>
                    </>
                  )}
                </p>
                {/* On a phone the title gets its own line and the chips share the last line with the buttons. */}
                <div className="contents md:flex md:min-w-0 md:flex-1 md:basis-[11rem] md:flex-col md:items-start md:gap-1">
                  <p className="w-full font-semibold leading-snug">{m.title}</p>
                  <span className="flex max-w-full flex-wrap gap-2">
                    <CategoryChip meeting={m} meta={meta} />
                    {status !== 'Scheduled' && <StatusCell meeting={m} />}
                  </span>
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  <Link
                    href={`/meetings/${m.id}`}
                    className={buttonClasses(
                      i === 0 ? 'primary' : 'outline',
                      'md',
                      '!px-3 md:!px-5',
                    )}
                  >
                    {t('open')}
                    <span className="sr-only">{` — ${m.title}`}</span>
                  </Link>
                  {isWebLink(m.values.meeting_link) && (
                    <a
                      href={m.values.meeting_link}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClasses('outline', 'md', '!px-3 md:!px-5')}
                    >
                      {t('join')}
                      <span className="sr-only">{` — ${m.title}`}</span>
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </GlowCard>
  );
}
