'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonClasses, ConfirmDialog, FormField, Input } from '@/components/ui';
import { ApiError, NetworkError, api } from '@/lib/api';
import { useMeeting, useMeta, type Meta } from '@/lib/queries';
import { useUndoToast } from '@/lib/use-undo-toast';
import { addMinutesToTime, sameWeekdayAfter, shiftDate, todayIn } from '@/shared/dates';
import type { Meeting } from '@/shared/meeting';
import { dateText, timeText } from './format';
import { lengthOf, WhenFields, type When } from './when-fields';
import { PageTitle } from '@/components/motion';

/** /meetings/[id]/reschedule: a short full page. Quick choices fill the fields in; nothing is saved until Save new time. */
export function RescheduleScreen({ id, returnTo }: { id: string; returnTo?: string }) {
  const t = useTranslations('detail');
  const meta = useMeta();
  const detail = useMeeting(id);
  if (meta.isPending || detail.isPending) return <p>{t('loading')}</p>;
  if (detail.isError || !detail.data || !meta.data)
    return <p className="font-semibold">{t('notFound')}</p>;
  const { meeting } = detail.data;
  return <Form key={meeting.id} meeting={meeting} meta={meta.data} returnTo={returnTo} />;
}

function Form({ meeting, meta, returnTo }: { meeting: Meeting; meta: Meta; returnTo?: string }) {
  const t = useTranslations('reschedule');
  const f = useTranslations('form');
  const common = useTranslations('common');
  const router = useRouter();
  const client = useQueryClient();
  const announce = useUndoToast();

  const { settings } = meta;
  const today = todayIn(settings.timezone);
  const oldDate = String(meeting.values.date ?? today);
  const oldStart = String(meeting.values.start_time ?? '10:00');
  const length = lengthOf(meeting.values.start_time, meeting.values.end_time);

  const [when, setWhen] = useState<When>({ date: oldDate, start: oldStart, length });
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ date?: string; start?: string; end?: string }>({});
  const [failure, setFailure] = useState<{ network: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Back to where the person came from if they said so (an in-app path), otherwise to the meeting.
  const back = returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : `/meetings/${meeting.id}`;

  async function save(confirmCompleted = false) {
    const problems: typeof errors = {};
    if (!when.date) problems.date = t('needDate');
    if (!when.start) problems.start = t('needStart');
    const end = when.start ? addMinutesToTime(when.start, when.length) : null;
    if (when.start && !end) problems.end = t('endAfter');
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      document.getElementById(problems.date ? 'input-when_date' : 'input-when_start')?.focus();
      return;
    }
    setFailure(null);
    setSaving(true);
    try {
      const res = await api<{ undo_token: string | null }>(`/meetings/${meeting.id}/reschedule`, {
        method: 'POST',
        body: {
          date: when.date,
          start_time: when.start,
          end_time: end,
          reason: reason.trim() || undefined,
          rev: meeting.rev,
          confirm_completed: confirmCompleted || undefined,
        },
      });
      await client.invalidateQueries();
      announce(t('moved'), res.undo_token);
      router.push(back);
    } catch (e) {
      if (e instanceof ApiError && e.details.needs_confirmation === 'completed') setConfirm(true);
      else if (e instanceof ApiError && e.issues.length > 0 && e.issues[0]?.field === 'end_time') {
        setErrors({ end: e.issues[0].message });
      } else if (e instanceof ApiError) setFailure({ network: false, text: e.message });
      else setFailure({ network: e instanceof NetworkError, text: f('saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  const quick = (date: string) => () => {
    setErrors({});
    setWhen({ date, start: oldStart, length });
  };
  const nowText = (() => {
    const d =
      typeof meeting.values.date === 'string' ? dateText(meeting.values.date, settings) : '';
    const s =
      typeof meeting.values.start_time === 'string'
        ? timeText(meeting.values.start_time, settings)
        : '';
    return `${d} · ${s}`;
  })();

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="mx-auto flex max-w-2xl flex-col gap-6 pb-32"
    >
      <div>
        <PageTitle className="mb-2">{t('title')}</PageTitle>
        <p className="mb-1 text-xl font-semibold">{meeting.title}</p>
        <p className="text-muted">{t('current', { when: nowText })}</p>
        <p className="mt-2">{t('intro')}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button size="lg" onClick={quick(shiftDate(today, 1))}>
          {t('quickTomorrow')}
        </Button>
        <Button size="lg" onClick={quick(sameWeekdayAfter(oldDate, 1, today))}>
          {t('quickNextWeek')}
        </Button>
        <Button size="lg" onClick={() => document.getElementById('input-when_date')?.focus()}>
          {t('quickPick')}
        </Button>
      </div>

      <WhenFields
        value={when}
        onChange={(next) => {
          setErrors({});
          setWhen(next);
        }}
        dateLabel={t('newDate')}
        startLabel={t('newStart')}
        lengthLabel={t('length')}
        endLabel={t('endTime')}
        otherLabel={t('dOther')}
        labels={{ d30: f('d30'), d60: f('d60'), d120: f('d120') }}
        errors={errors}
      />

      <FormField name="reason" label={t('reason')} hint={t('reasonHint')}>
        {(c) => (
          <Input
            id={c.id}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={c['aria-describedby']}
          />
        )}
      </FormField>

      {failure && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border-ui border-danger bg-surface p-4"
        >
          <p className="flex-1 font-semibold">{failure.text}</p>
          {failure.network && (
            <Button variant="primary" onClick={() => void save()}>
              {common('tryAgain')}
            </Button>
          )}
        </div>
      )}

      <div className="glass fixed inset-x-0 bottom-0 z-30 border-t-ui border-soft shadow-lg md:left-[240px]">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 px-4 py-3 md:px-0">
          <Button type="submit" variant="primary" size="lg" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
          <Link href={back} className={buttonClasses('outline', 'lg')}>
            {common('cancel')}
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('confirmTitle')}
        description={t('confirmBody')}
        confirmLabel={t('confirmYes')}
        cancelLabel={t('confirmNo')}
        onConfirm={() => void save(true)}
      />
    </form>
  );
}
