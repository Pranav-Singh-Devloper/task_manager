'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonClasses, FormField, RadioChips, Textarea } from '@/components/ui';
import { ApiError, NetworkError, api } from '@/lib/api';
import { useMeeting, useMeta, type Meta } from '@/lib/queries';
import { addMinutesToTime, sameWeekdayAfter, todayIn } from '@/shared/dates';
import { newId } from '@/shared/ids';
import type { Meeting } from '@/shared/meeting';
import { dateText, timeText } from './format';
import { lengthOf, WhenFields, type When } from './when-fields';
import { PageTitle } from '@/components/motion';

type Answer = 'yes' | 'no' | 'later' | '';
type Failure = { kind: 'network' | 'text' | 'exists'; text: string; existingId?: string };
interface Done {
  token: string | null;
  next: Meeting | null;
}

/**
 * /meetings/[id]/done: closes the loop in one page (§7.6). Notes, then "is there a next date?", then Save.
 * The same page, without the notes and the question, is "Schedule next meeting" for a meeting that is already done.
 */
export function DoneScreen({ id, scheduleNext }: { id: string; scheduleNext: boolean }) {
  const t = useTranslations('detail');
  const meta = useMeta();
  const detail = useMeeting(id);
  if (meta.isPending || detail.isPending) return <p>{t('loading')}</p>;
  if (detail.isError || !detail.data || !meta.data)
    return <p className="font-semibold">{t('notFound')}</p>;
  const { meeting } = detail.data;
  return <Form key={meeting.id} meeting={meeting} meta={meta.data} scheduleNext={scheduleNext} />;
}

function Form({
  meeting,
  meta,
  scheduleNext,
}: {
  meeting: Meeting;
  meta: Meta;
  scheduleNext: boolean;
}) {
  const t = useTranslations('done');
  const f = useTranslations('form');
  const common = useTranslations('common');
  const detail = useTranslations('detail');
  const client = useQueryClient();

  const { settings } = meta;
  const today = todayIn(settings.timezone);
  const oldDate = String(meeting.values.date ?? today);
  const oldStart = String(meeting.values.start_time ?? '10:00');
  const length = lengthOf(meeting.values.start_time, meeting.values.end_time);
  // Already done: skip the notes and the question, go straight to the next date.
  const nextOnly = scheduleNext && meeting.values.meeting_status === 'Completed';

  // The next meeting's id is made now, so pressing Save twice, or retrying after a lost answer, never makes two.
  const [nextId] = useState(() => newId());
  const [notes, setNotes] = useState('');
  const [answer, setAnswer] = useState<Answer>(nextOnly ? 'yes' : '');
  const [when, setWhen] = useState<When>({ date: '', start: oldStart, length });
  const [errors, setErrors] = useState<{ answer?: string; date?: string; start?: string }>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [undone, setUndone] = useState(false);

  const quick = (weeks: number) => () => {
    setErrors({});
    setWhen({ date: sameWeekdayAfter(oldDate, weeks, today), start: oldStart, length });
  };

  async function save(allowSecond = false) {
    const problems: typeof errors = {};
    if (!answer) problems.answer = t('needAnswer');
    if (answer === 'yes' && !when.date) problems.date = t('needDate');
    if (answer === 'yes' && !when.start) problems.start = t('needStart');
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      const first = problems.answer
        ? 'field-answer'
        : problems.date
          ? 'input-when_date'
          : 'input-when_start';
      const el = document.getElementById(first);
      (el?.querySelector<HTMLElement>('button') ?? el)?.focus();
      return;
    }
    setFailure(null);
    setSaving(true);
    try {
      const end = answer === 'yes' && when.start ? addMinutesToTime(when.start, when.length) : null;
      const res = await api<{ meeting: Meeting; next: Meeting | null; undo_token: string | null }>(
        `/meetings/${meeting.id}/complete`,
        {
          method: 'POST',
          body: {
            notes: nextOnly ? undefined : notes.trim() || undefined,
            next:
              answer === 'yes'
                ? { id: nextId, date: when.date, start_time: when.start, end_time: end }
                : undefined,
            awaiting_next: answer === 'later' || undefined,
            allow_second_next: allowSecond || undefined,
            rev: meeting.rev,
          },
        },
      );
      await client.invalidateQueries();
      setDone({ token: res.undo_token, next: res.next });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'next_exists') {
        setFailure({
          kind: 'exists',
          text: e.message,
          existingId: String(e.details.existing_id ?? ''),
        });
      } else if (e instanceof ApiError) setFailure({ kind: 'text', text: e.message });
      else setFailure({ kind: e instanceof NetworkError ? 'network' : 'text', text: t('failed') });
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!done?.token) return;
    try {
      await api(`/undo/${done.token}`, { method: 'POST' });
      await client.invalidateQueries();
      setUndone(true);
    } catch (e) {
      setFailure({ kind: 'text', text: e instanceof ApiError ? e.message : detail('undoFailed') });
    }
  }

  if (done) {
    const next = done.next;
    const when =
      next && typeof next.values.date === 'string' && typeof next.values.start_time === 'string'
        ? `${dateText(next.values.date, settings)} ${t('at')} ${timeText(next.values.start_time, settings)}`
        : '';
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageTitle>{nextOnly ? t('scheduleNextTitle') : t('title')}</PageTitle>
        <div
          role="status"
          className="flex flex-col gap-4 rounded-2xl border-ui border-soft bg-surface shadow-sm p-5"
        >
          <p className="text-xl font-semibold">
            {undone
              ? t('undone')
              : next
                ? nextOnly
                  ? t('resultNextOnly', { when })
                  : t('resultNext', { when })
                : t('resultDone')}
          </p>
          <div className="flex flex-wrap gap-3">
            {next && !undone && (
              <Link href={`/meetings/${next.id}`} className={buttonClasses('primary')}>
                {t('openIt')}
              </Link>
            )}
            <Link
              href={`/meetings/${meeting.id}`}
              className={buttonClasses(next && !undone ? 'outline' : 'primary')}
            >
              {t('backToMeeting')}
            </Link>
            {done.token && !undone && <Button onClick={() => void undo()}>{common('undo')}</Button>}
          </div>
        </div>
        {failure?.kind === 'text' && (
          <p role="alert" className="font-semibold text-danger">
            {failure.text}
          </p>
        )}
      </div>
    );
  }

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
        <PageTitle className="mb-2">{nextOnly ? t('scheduleNextTitle') : t('title')}</PageTitle>
        <p className="text-xl font-semibold">{t('for', { title: meeting.title })}</p>
      </div>

      {!nextOnly && (
        <>
          <FormField name="notes" label={t('notes')} hint={t('notesHint')}>
            {(c) => (
              <Textarea
                id={c.id}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>

          <FormField name="answer" label={t('nextQuestion')} required error={errors.answer} group>
            {(c) => (
              <RadioChips
                aria-labelledby={c.labelId}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                value={answer}
                onValueChange={(v) => {
                  setErrors({});
                  setAnswer(v as Answer);
                }}
                options={[
                  { value: 'yes', label: t('yes') },
                  { value: 'no', label: t('no') },
                  { value: 'later', label: t('notDecided') },
                ]}
              />
            )}
          </FormField>
        </>
      )}

      {answer === 'yes' && (
        <section aria-labelledby="sec-next" className="flex flex-col gap-5">
          <h2 id="sec-next">{t('nextWhen')}</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button size="lg" onClick={quick(1)}>
              {t('quickNextWeek')}
            </Button>
            <Button size="lg" onClick={quick(2)}>
              {t('quickTwoWeeks')}
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
            dateLabel={t('nextDate')}
            startLabel={t('nextStart')}
            lengthLabel={t('length')}
            endLabel={t('endTime')}
            otherLabel={t('dOther')}
            labels={{ d30: f('d30'), d60: f('d60'), d120: f('d120') }}
            errors={errors}
          />
        </section>
      )}

      {failure && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border-ui border-danger bg-surface p-4"
        >
          <p className="font-semibold">
            {failure.kind === 'exists' ? t('existingTitle') : failure.text}
          </p>
          {failure.kind === 'exists' && <p>{failure.text}</p>}
          <div className="flex flex-wrap gap-3">
            {failure.kind === 'network' && (
              <Button variant="primary" onClick={() => void save()}>
                {common('tryAgain')}
              </Button>
            )}
            {failure.kind === 'exists' && (
              <>
                <Link href={`/meetings/${failure.existingId}`} className={buttonClasses('outline')}>
                  {t('openExisting')}
                </Link>
                <Button onClick={() => void save(true)}>{t('createAnother')}</Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="glass fixed inset-x-0 bottom-0 z-30 border-t-ui border-soft shadow-lg md:left-[240px]">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 px-4 py-3 md:px-0">
          <Button type="submit" variant="primary" size="lg" disabled={saving}>
            {saving ? t('saving') : nextOnly ? t('scheduleNext') : t('save')}
          </Button>
          <Link href={`/meetings/${meeting.id}`} className={buttonClasses('outline', 'lg')}>
            {common('cancel')}
          </Link>
        </div>
      </div>
    </form>
  );
}
