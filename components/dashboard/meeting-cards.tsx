'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui';
import { dateText, timeText } from '@/components/meeting/format';
import type { Meta } from '@/lib/queries';
import type { Meeting } from '@/shared/meeting';
import {
  CategoryChip,
  FilesCell,
  JoinButton,
  RescheduleButton,
  StatusCell,
  TitleCell,
} from './row-bits';

/** The phone version of the table: one card per meeting, with a large date and time and every action as a labelled button. */
export function MeetingCards({
  meetings,
  meta,
  grouped,
  here,
}: {
  meetings: Meeting[];
  meta: Meta;
  grouped: boolean;
  here: string;
}) {
  const t = useTranslations('dashboard');
  const sections: { date: string; items: Meeting[] }[] = [];
  for (const m of meetings) {
    const date = grouped ? (typeof m.values.date === 'string' ? m.values.date : '') : '';
    const last = sections[sections.length - 1];
    if (last && last.date === date) last.items.push(m);
    else sections.push({ date, items: [m] });
  }
  return (
    <div className="flex flex-col gap-4">
      {sections.map((s, i) => (
        <section
          key={`${s.date}-${i}`}
          aria-label={s.date ? dateText(s.date, meta.settings) : undefined}
          className="flex flex-col gap-3"
        >
          {s.date && <h2 className="text-xl">{dateText(s.date, meta.settings)}</h2>}
          <ul className="flex flex-col gap-3">
            {s.items.map((m) => {
              const date = typeof m.values.date === 'string' ? m.values.date : null;
              const start =
                typeof m.values.start_time === 'string'
                  ? timeText(m.values.start_time, meta.settings)
                  : '';
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 rounded-xl border-ui border-line bg-surface p-4"
                >
                  <p className="text-2xl font-bold">
                    {!grouped && date ? `${dateText(date, meta.settings)} · ` : ''}
                    {start}
                  </p>
                  <TitleCell meeting={m} />
                  <div className="flex flex-wrap gap-2">
                    <CategoryChip meeting={m} meta={meta} />
                    <StatusCell meeting={m} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/meetings/${m.id}`} className={buttonClasses('outline')}>
                      {t('open')}
                      <span className="sr-only">{` — ${m.title}`}</span>
                    </Link>
                    <JoinButton meeting={m} />
                    {m.files.length > 0 && <FilesCell meeting={m} />}
                    <RescheduleButton meeting={m} here={here} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <span className="sr-only">{t('tableCaption')}</span>
    </div>
  );
}
