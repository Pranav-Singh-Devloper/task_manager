'use client';

import { format, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { FocusText, PageTitle, WarmBackground } from '@/components/motion';
import { useUserName } from '@/components/shell/user-name';
import { todayIn } from '@/shared/dates';
import type { Settings } from '@/shared/types';

function hourIn(timezone: string, now: Date): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(now);
    return Number(h);
  } catch {
    return now.getHours();
  }
}

/** The top of the dashboard: a warm greeting, the page heading and today's date, over a slowly drifting background. */
export function Welcome({ settings }: { settings: Settings }) {
  const t = useTranslations('dashboard');
  const name = useUserName().split(' ')[0] ?? '';
  const now = new Date();
  const hour = hourIn(settings.timezone, now);
  const greeting =
    hour < 12 ? t('greetMorning') : hour < 17 ? t('greetAfternoon') : t('greetEvening');
  const today = format(parseISO(todayIn(settings.timezone, now)), 'EEEE, d MMMM yyyy');

  return (
    <section className="relative isolate overflow-hidden rounded-3xl border-ui border-soft shadow-md">
      <WarmBackground />
      <div className="relative flex flex-col gap-2 px-5 py-7 md:px-8 md:py-10">
        <p className="font-display text-xl font-semibold text-accent">
          {name ? t('greetName', { greeting, name }) : greeting}
        </p>
        <PageTitle>{t('title')}</PageTitle>
        <FocusText text={t('todayIs', { date: today })} className="text-lg" />
      </div>
    </section>
  );
}
