'use client';

import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Button, Segmented } from '@/components/ui';
import { MeetingCards } from './meeting-cards';
import { api } from '@/lib/api';
import { toApiQuery, type DashboardParams } from '@/lib/dashboard-params';
import type { Meta } from '@/lib/queries';
import { nowIn, todayIn } from '@/shared/dates';
import type { Meeting } from '@/shared/meeting';
import { dateText } from '@/components/meeting/format';

type ViewName = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listMonth';

interface Props {
  meta: Meta;
  params: DashboardParams;
  mobile: boolean;
  here: string;
}

const FIRST_DAY: Record<string, number> = { sunday: 0, monday: 1, saturday: 6 };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The calendar view (§7.2). It uses the same search and filters as the table, for whatever dates are on screen.
 * On a phone it is a month grid of dots and the meetings of the tapped day are listed underneath.
 */
export default function CalendarView({ meta, params, mobile, here }: Props) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const calendar = useRef<FullCalendar>(null);
  const { settings } = meta;
  const [view, setView] = useState<ViewName>('dayGridMonth');
  const [title, setTitle] = useState('');
  const [window_, setWindow] = useState<{ from: string; to: string } | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const qs = window_
    ? toApiQuery(params, settings, {
        scope: 'all',
        from: window_.from,
        to: window_.to,
        limit: 1000,
      })
    : '';
  const data = useQuery({
    queryKey: ['calendar', qs],
    queryFn: () => api<{ meetings: Meeting[]; total: number }>(`/meetings?${qs}`),
    enabled: Boolean(window_),
    placeholderData: (previous) => previous,
  });
  const meetings = data.data?.meetings;

  const events = useMemo<EventInput[]>(() => {
    const byCategory = new Map(meta.categories.map((c) => [c.slug, c]));
    return (meetings ?? [])
      .filter((m) => typeof m.values.date === 'string' && typeof m.values.start_time === 'string')
      .map((m) => {
        const c = byCategory.get(m.category_slug);
        const status = String(m.values.meeting_status || 'Scheduled');
        // The category name leads, unless the title already says it. A finished or cancelled meeting says so in words.
        const named =
          c && !m.title.toLowerCase().startsWith(c.name.toLowerCase())
            ? `${c.name}: ${m.title}`
            : m.title;
        const label =
          status === 'Completed' || status === 'Cancelled' ? `${named} (${status})` : named;
        return {
          id: m.id,
          title: label,
          start: `${m.values.date}T${m.values.start_time}`,
          end:
            typeof m.values.end_time === 'string'
              ? `${m.values.date}T${m.values.end_time}`
              : undefined,
          backgroundColor: c?.color ?? '#334155',
          borderColor: c?.color ?? '#334155',
          textColor: '#ffffff',
        };
      });
  }, [meetings, meta.categories]);

  const api_ = () => calendar.current?.getApi();
  const today = todayIn(settings.timezone);
  const picked = day ?? today;
  const ofDay = (meetings ?? []).filter((m) => m.values.date === picked);

  const views: { value: ViewName; label: string }[] = [
    { value: 'dayGridMonth', label: t('calMonth') },
    ...(mobile
      ? []
      : [
          { value: 'timeGridWeek' as const, label: t('calWeek') },
          { value: 'timeGridDay' as const, label: t('calDay') },
        ]),
    { value: 'listMonth', label: t('calList') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t('calViews')}
          value={view}
          options={views}
          onChange={(v) => {
            setView(v);
            api_()?.changeView(v);
          }}
        />
        <div role="group" aria-label={t('calMove')} className="flex flex-wrap gap-2">
          <Button onClick={() => api_()?.today()}>{t('calToday')}</Button>
          <Button onClick={() => api_()?.prev()}>{t('calPrevious')}</Button>
          <Button onClick={() => api_()?.next()}>{t('calNext')}</Button>
        </div>
      </div>
      <h2 aria-live="polite">{title}</h2>

      <div className={mobile ? 'mm-cal mm-cal-mobile' : 'mm-cal'}>
        <FullCalendar
          ref={calendar}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          initialDate={today}
          // Dates are the same wall-clock times everywhere: nothing shifts if this browser is in another time zone.
          timeZone="UTC"
          now={`${nowIn(settings.timezone)}Z`}
          firstDay={FIRST_DAY[settings.week_starts_on] ?? 1}
          headerToolbar={false}
          height="auto"
          dayMaxEvents={3}
          nowIndicator
          eventDisplay={mobile ? 'list-item' : 'auto'}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            hour12: settings.time_format !== '24h',
          }}
          slotLabelFormat={{
            hour: 'numeric',
            minute: '2-digit',
            hour12: settings.time_format !== '24h',
          }}
          events={events}
          datesSet={(arg: DatesSetArg) => {
            setTitle(arg.view.title);
            setWindow({ from: iso(arg.start), to: iso(new Date(arg.end.getTime() - 86_400_000)) });
          }}
          dateClick={(arg) => setDay(arg.dateStr.slice(0, 10))}
          eventClick={(arg: EventClickArg) => {
            arg.jsEvent.preventDefault();
            router.push(`/meetings/${arg.event.id}`);
          }}
          // The date is already announced by the day number inside each cell. The cell's own label would leave out
          // the meetings written in it, which screen reader users would then not hear as part of the name.
          dayCellDidMount={(arg) => arg.el.removeAttribute('aria-labelledby')}
          // The "+3 more" link opens a list, so it is a button. Without the role, its aria-expanded is not valid on a link.
          moreLinkDidMount={(arg) => arg.el.setAttribute('role', 'button')}
          dayCellClassNames={(arg) => (mobile && iso(arg.date) === picked ? ['mm-picked-day'] : [])}
        />
      </div>

      {data.isPending && window_ && <p>{t('calLoading')}</p>}

      {mobile && view === 'dayGridMonth' && (
        <section aria-labelledby="cal-day" className="flex flex-col gap-3">
          <h2 id="cal-day" className="text-xl">
            {t('calDay_meetings', { date: dateText(picked, settings) })}
          </h2>
          {ofDay.length === 0 ? (
            <p>{t('calNothing')}</p>
          ) : (
            <MeetingCards meetings={ofDay} meta={meta} grouped={false} here={here} />
          )}
        </section>
      )}
    </div>
  );
}
