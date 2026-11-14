'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Chip, buttonClasses } from '@/components/ui';
import { StatusChip } from '@/components/meeting/status-chip';
import type { Meta } from '@/lib/queries';
import type { Meeting } from '@/shared/meeting';

export const isWebLink = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\//i.test(v);
export const isOpen = (m: Meeting) =>
  !m.deleted_at &&
  (m.values.meeting_status === 'Scheduled' ||
    m.values.meeting_status === 'Rescheduled' ||
    !m.values.meeting_status);

/** A meeting that should be on the calendar but is not yet: shown as a small note. */
export const offCalendar = (m: Meeting) =>
  isOpen(m) && (m.calendar_sync === 'error' || m.calendar_sync === 'pending');

/** The meeting's title as a link, with its small "Rescheduled ×2" and "Incomplete" notes. */
export function TitleCell({ meeting }: { meeting: Meeting }) {
  const t = useTranslations('dashboard');
  return (
    <div className="flex flex-col items-start gap-1">
      <Link
        href={`/meetings/${meeting.id}`}
        className="inline-flex min-h-tap items-center text-lg font-semibold underline"
      >
        {meeting.title}
      </Link>
      <span className="flex flex-wrap gap-2">
        {offCalendar(meeting) && <Chip>{t('notOnCalendar')}</Chip>}
        {meeting.reschedule_count > 0 && (
          <Chip>{t('rescheduledTimes', { count: meeting.reschedule_count })}</Chip>
        )}
        {meeting.incomplete.length > 0 && <Chip>{t('incomplete')}</Chip>}
      </span>
    </div>
  );
}

export function CategoryChip({ meeting, meta }: { meeting: Meeting; meta: Meta }) {
  const c = meta.categories.find((x) => x.slug === meeting.category_slug);
  return c ? <Chip color={c.color}>{c.name}</Chip> : null;
}

export function StatusCell({ meeting }: { meeting: Meeting }) {
  return <StatusChip status={String(meeting.values.meeting_status || 'Scheduled')} />;
}

export function JoinButton({ meeting }: { meeting: Meeting }) {
  const t = useTranslations('dashboard');
  const link = meeting.values.meeting_link;
  if (!isWebLink(link) || meeting.deleted_at) return null;
  return (
    <a href={link} target="_blank" rel="noreferrer" className={buttonClasses('outline')}>
      {t('join')}
      <span className="sr-only">{` — ${meeting.title}`}</span>
    </a>
  );
}

/** How many files, with one button: Open for a single file, or the meeting page when there are several. */
export function FilesCell({ meeting }: { meeting: Meeting }) {
  const t = useTranslations('dashboard');
  const files = meeting.files;
  if (files.length === 0) return <span className="text-muted">{'—'}</span>;
  const one = files[0]!;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="font-semibold">{t('fileCount', { count: files.length })}</span>
      {files.length === 1 ? (
        <a
          href={one.view_link}
          target="_blank"
          rel="noreferrer"
          className={buttonClasses('outline')}
        >
          {t('openFile')}
          <span className="sr-only">{` — ${one.name}`}</span>
        </a>
      ) : (
        <Link href={`/meetings/${meeting.id}`} className={buttonClasses('outline')}>
          {t('seeFiles')}
          <span className="sr-only">{` — ${meeting.title}`}</span>
        </Link>
      )}
    </span>
  );
}

/** Reschedule is three taps from here: this button, Same time tomorrow, Save new time. */
export function RescheduleButton({ meeting, here }: { meeting: Meeting; here: string }) {
  const t = useTranslations('dashboard');
  if (!isOpen(meeting)) return null;
  return (
    <Link
      href={`/meetings/${meeting.id}/reschedule?return=${encodeURIComponent(here)}`}
      className={buttonClasses('outline')}
    >
      {t('reschedule')}
      <span className="sr-only">{` — ${meeting.title}`}</span>
    </Link>
  );
}
