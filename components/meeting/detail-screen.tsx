'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Button, buttonClasses, Card, CardTitle, Chip, ConfirmDialog } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useHistory, useMeeting, useMeta, type History, type Meta } from '@/lib/queries';
import { useUndoToast } from '@/lib/use-undo-toast';
import { instantOf } from '@/shared/dates';
import type { Meeting } from '@/shared/meeting';
import type { FieldDef } from '@/shared/types';
import { useToast } from '@/components/ui';
import { dateText, fullDate, stampText, timeText, valueText } from './format';
import { FilesField } from './files-field';
import { StatusChip } from './status-chip';
import { PageTitle } from '@/components/motion';

const CORE = new Set([
  'sr_no',
  'topic',
  'meeting_status',
  'meeting_link',
  'remarks',
  'details',
  'workspace',
  'reminder_minutes',
]);
/** Shown in the header or managed elsewhere, so not repeated in the list. */
const HIDDEN_ROWS = new Set(['date', 'start_time', 'end_time', 'files']);

const isWebLink = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v);

function Row({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="grid gap-1 border-b-ui border-soft py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="font-semibold">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">
        {children}
        {note && <span className="block text-muted">{note}</span>}
      </dd>
    </div>
  );
}

/** /meetings/[id]: everything about one meeting, and every action as a visible, labelled button (§7.3). */
export function DetailScreen({ id }: { id: string }) {
  const t = useTranslations('detail');
  const form = useTranslations('form');
  const common = useTranslations('common');
  const meta = useMeta();
  const detail = useMeeting(id);
  const history = useHistory(id);

  if (meta.isPending || detail.isPending) return <p>{t('loading')}</p>;
  if (detail.isError || !detail.data || !meta.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-semibold">{detail.error?.message ?? t('notFound')}</p>
        <Link href="/" className={buttonClasses('outline')}>
          {common('back')}
        </Link>
      </div>
    );
  }
  return (
    <Loaded
      meeting={detail.data.meeting}
      previous={detail.data.previous}
      next={detail.data.next}
      meta={meta.data}
      history={history.data}
      labels={{ yes: common('yes'), no: common('no') }}
      reminderLabel={(m) =>
        ({ '10080': form('r10080'), '1440': form('r1440'), '60': form('r60'), '15': form('r15') })[
          m
        ] ?? form('rCustom', { minutes: m })
      }
      t={t}
    />
  );
}

interface LoadedProps {
  meeting: Meeting;
  previous: { id: string; title: string; date: string | null } | null;
  next: { id: string; title: string; date: string | null } | null;
  meta: Meta;
  history: History | undefined;
  labels: { yes: string; no: string };
  reminderLabel: (minutes: string) => string;
  t: ReturnType<typeof useTranslations<'detail'>>;
}

function Loaded({ meeting, previous, next, meta, history, labels, reminderLabel, t }: LoadedProps) {
  const client = useQueryClient();
  const toast = useToast();
  const announce = useUndoToast();
  const [confirm, setConfirm] = useState<null | 'cancel' | 'delete'>(null);
  const [busy, setBusy] = useState(false);
  // Taken once when the page opens: whether the meeting has started decides which button is the main one.
  const [now] = useState(() => Date.now());

  const { settings } = meta;
  const v = meeting.values;
  const status = String(v.meeting_status || 'Scheduled');
  const deleted = Boolean(meeting.deleted_at);
  const category = meta.categories.find((c) => c.slug === meeting.category_slug);
  const workspace = meta.workspaces.find((w) => w.slug === v.workspace);
  const date = typeof v.date === 'string' ? v.date : null;
  const start = typeof v.start_time === 'string' ? v.start_time : null;
  const end = typeof v.end_time === 'string' ? v.end_time : null;
  const link = isWebLink(v.meeting_link) ? v.meeting_link : null;

  const open = !deleted && (status === 'Scheduled' || status === 'Rescheduled');
  const started =
    date && start ? now >= instantOf(date, start, settings.timezone).getTime() : false;
  const primary: string = deleted
    ? 'restore'
    : status === 'Cancelled'
      ? 'restore'
      : status === 'Completed'
        ? next
          ? ''
          : 'scheduleNext'
        : started
          ? 'done'
          : 'reschedule';
  const kind = (name: string) => (primary === name ? 'primary' : 'outline');

  const rescheduledTimes = history?.reschedules.length ?? 0;
  // What the Calendar card says (§7.3 item 7). Cancelled and deleted meetings are taken off the calendar on purpose.
  const calendarState: 'ok' | 'missing' | 'removed' | 'past' =
    deleted || status === 'Cancelled'
      ? 'removed'
      : meeting.calendar_sync === 'ok'
        ? 'ok'
        : meeting.calendar_sync === 'none' || meeting.calendar_sync === ''
          ? 'past'
          : 'missing';
  const offCalendar = calendarState === 'missing';

  async function retryCalendar() {
    setBusy(true);
    try {
      const r = await api<{ meeting: Meeting }>(`/calendar/retry/${meeting.id}`, {
        method: 'POST',
      });
      await client.invalidateQueries();
      toast.show({
        message: r.meeting.calendar_sync === 'ok' ? t('calendarFixed') : t('calendarStillFailing'),
      });
    } catch (e) {
      toast.show({ message: e instanceof ApiError ? e.message : t('actionFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function act(call: () => Promise<{ undo_token?: string | null }>, message: string) {
    setBusy(true);
    try {
      const r = await call();
      await client.invalidateQueries();
      announce(message, r.undo_token);
    } catch (e) {
      await client.invalidateQueries();
      toast.show({ message: e instanceof ApiError ? e.message : t('actionFailed') });
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (to: string, message: string) =>
    act(
      () =>
        api(`/meetings/${meeting.id}/status`, {
          method: 'POST',
          body: { status: to, rev: meeting.rev },
        }),
      message,
    );

  const rows = (fields: FieldDef[]) =>
    fields.map((f) => {
      const computed = f.type === 'computed';
      const raw = computed ? meeting.computed[f.key] : v[f.key];
      let shown: ReactNode;
      if (f.key === 'workspace')
        shown = workspace?.name ?? valueText(f, raw as string, settings, labels);
      else if (f.key === 'reminder_minutes') {
        const list =
          typeof raw === 'string'
            ? raw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        shown = list.length ? list.map(reminderLabel).join(', ') : t('defaultReminders');
      } else if (f.key === 'meeting_link' && isWebLink(raw)) {
        shown = (
          <a
            href={raw}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-tap items-center underline"
          >
            {raw}
          </a>
        );
      } else shown = valueText(f, raw, settings, labels);
      return (
        <Row key={f.key} label={f.label} note={computed ? t('calculated') : undefined}>
          {shown ?? <span className="text-muted">{t('notAdded')}</span>}
        </Row>
      );
    });

  const visible = meta.fields
    .filter(
      (f) => f.category_slug === meeting.category_slug && !f.archived && !HIDDEN_ROWS.has(f.key),
    )
    .filter((f) => f.show_in_form || f.key === 'sr_no' || f.key === 'meeting_status')
    .sort((a, b) => a.order - b.order);
  const core = visible.filter((f) => CORE.has(f.key));
  const specific = visible.filter((f) => !CORE.has(f.key));

  return (
    <div className="flex flex-col gap-8 pb-8">
      <div className="flex flex-col gap-3">
        <PageTitle>{meeting.title}</PageTitle>
        {date && start && (
          <p className="text-2xl font-semibold">
            {dateText(date, settings)} ·{' '}
            {end
              ? t('to', { start: timeText(start, settings), end: timeText(end, settings) })
              : timeText(start, settings)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <StatusChip status={status} />
          {category && <Chip color={category.color}>{category.name}</Chip>}
          {workspace && <Chip color={workspace.color}>{workspace.name}</Chip>}
          {rescheduledTimes > 0 && (
            <Chip>{t('rescheduledTimes', { count: rescheduledTimes })}</Chip>
          )}
          {meeting.incomplete.length > 0 && <Chip>{t('incomplete')}</Chip>}
          {meeting.awaiting_next && <Chip>{t('waitingNext')}</Chip>}
          {offCalendar && <Chip>{t('chipNoCalendar')}</Chip>}
          {deleted && <Chip>{t('inTrash')}</Chip>}
        </div>
      </div>

      {deleted && (
        <p
          role="status"
          className="rounded-2xl border-ui border-soft bg-surface shadow-sm p-4 font-semibold"
        >
          {t('trashNotice')}
        </p>
      )}
      {!deleted && meeting.incomplete.length > 0 && (
        <p role="status" className="rounded-2xl border-ui border-soft bg-surface shadow-sm p-4">
          {t('incompleteNotice')}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {deleted ? (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              act(
                () => api(`/meetings/${meeting.id}/restore`, { method: 'POST' }),
                t('toastRestored'),
              )
            }
          >
            {t('restore')}
          </Button>
        ) : (
          <>
            {open && (
              <Link
                href={`/meetings/${meeting.id}/reschedule`}
                className={buttonClasses(kind('reschedule'))}
              >
                {t('reschedule')}
              </Link>
            )}
            {open && (
              <Link href={`/meetings/${meeting.id}/done`} className={buttonClasses(kind('done'))}>
                {t('markDone')}
              </Link>
            )}
            <Link href={`/meetings/${meeting.id}/edit`} className={buttonClasses('outline')}>
              {t('edit')}
            </Link>
            {open && (
              <Button variant="outline" disabled={busy} onClick={() => setConfirm('cancel')}>
                {t('cancelMeeting')}
              </Button>
            )}
            {status === 'Completed' && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void setStatus('Scheduled', t('toastReopened'))}
              >
                {t('reopen')}
              </Button>
            )}
            {status === 'Cancelled' && (
              <Button
                variant={kind('restore')}
                disabled={busy}
                onClick={() => void setStatus('Scheduled', t('toastRestored'))}
              >
                {t('restore')}
              </Button>
            )}
          </>
        )}
        {link && !deleted && (
          <a href={link} target="_blank" rel="noreferrer" className={buttonClasses('outline')}>
            {t('join')}
          </a>
        )}
      </div>

      <Card>
        <CardTitle>{t('aboutThis')}</CardTitle>
        <dl>{rows(core)}</dl>
        {specific.length > 0 && (
          <>
            <h3 className="mt-6 text-xl font-semibold">
              {t('categoryDetails', { name: category?.name ?? '' })}
            </h3>
            <dl>{rows(specific)}</dl>
          </>
        )}
      </Card>

      <Card>
        <CardTitle>{t('files')}</CardTitle>
        <FilesField
          meetingId={meeting.id}
          category={meeting.category_slug}
          saved={meeting.files}
          onSavedChange={() => void client.invalidateQueries()}
          attachNow
        />
      </Card>

      <Card>
        <CardTitle>{t('calendar')}</CardTitle>
        {calendarState === 'ok' && date && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 font-semibold">{t('calendarOk')}</p>
            <a
              href={`https://calendar.google.com/calendar/u/0/r/day/${date.slice(0, 4)}/${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`}
              target="_blank"
              rel="noreferrer"
              className={buttonClasses('outline')}
            >
              {t('calendarOpen')}
            </a>
          </div>
        )}
        {calendarState === 'missing' && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 font-semibold">{t('calendarMissing')}</p>
            <Button variant="primary" disabled={busy} onClick={() => void retryCalendar()}>
              {t('calendarTryAgain')}
            </Button>
          </div>
        )}
        {calendarState === 'removed' && <p>{t('calendarRemoved')}</p>}
        {calendarState === 'past' && <p>{t('calendarPast')}</p>}
      </Card>

      <Card>
        <CardTitle>{t('previous')}</CardTitle>
        {previous ? (
          <p>
            <Link
              href={`/meetings/${previous.id}`}
              className="inline-flex min-h-tap items-center underline"
            >
              {previous.title}
              {previous.date ? ` · ${fullDate(previous.date)}` : ''}
            </Link>
          </p>
        ) : (
          <p className="text-muted">{t('noSeries')}</p>
        )}
        {next && (
          <>
            <h3 className="mt-4 text-xl font-semibold">{t('next')}</h3>
            <p>
              <Link
                href={`/meetings/${next.id}`}
                className="inline-flex min-h-tap items-center underline"
              >
                {next.title}
                {next.date ? ` · ${fullDate(next.date)}` : ''}
              </Link>
            </p>
          </>
        )}
      </Card>

      <Card>
        <CardTitle>{t('rescheduleHistory')}</CardTitle>
        {!history || history.reschedules.length === 0 ? (
          <p className="text-muted">{t('noReschedules')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.reschedules.map((r) => (
              <li key={String(r.id)} className="border-b-ui border-soft pb-3">
                <p className="font-semibold">
                  {t('movedFrom', {
                    from: `${fullDate(String(r.old_date))} ${timeText(String(r.old_start), settings)}`,
                    to: `${fullDate(String(r.new_date))} ${timeText(String(r.new_start), settings)}`,
                  })}
                </p>
                <p className="text-muted">
                  {t('changedOn', { when: stampText(String(r.changed_at), settings) })}
                </p>
                {r.reason ? <p>{t('reasonIs', { reason: String(r.reason) })}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <details className="rounded-2xl border-ui border-soft bg-surface shadow-sm p-5">
        <summary className="min-h-tap cursor-pointer text-2xl font-semibold">
          {t('changeHistory')}
        </summary>
        {!history || history.audit.length === 0 ? (
          <p className="mt-3 text-muted">{t('noChanges')}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {history.audit.map((a) => {
              const keys = (() => {
                try {
                  return Object.keys(JSON.parse(String(a.changes || '{}')) as object);
                } catch {
                  return [];
                }
              })();
              const labelOf = (k: string) =>
                meta.fields.find((f) => f.category_slug === meeting.category_slug && f.key === k)
                  ?.label ?? k;
              return (
                <li key={String(a.id)} className="border-b-ui border-soft pb-3">
                  <p className="font-semibold">
                    {t(`action_${String(a.action)}` as 'action_update')} ·{' '}
                    {stampText(String(a.ts), settings)}
                  </p>
                  <p className="text-muted">{t('by', { who: String(a.user_email) })}</p>
                  {keys.length > 0 && <p>{keys.map(labelOf).join(', ')}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </details>

      {!deleted && (
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/meetings/${meeting.id}/done?next=1`}
            className={buttonClasses(kind('scheduleNext'))}
          >
            {t('scheduleNext')}
          </Link>
          <Button variant="danger" disabled={busy} onClick={() => setConfirm('delete')}>
            {t('delete')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('cancelTitle')}
        description={t('cancelBody')}
        confirmLabel={t('cancelConfirm')}
        cancelLabel={t('keep')}
        destructive
        onConfirm={() => void setStatus('Cancelled', t('toastCancelled'))}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('keep')}
        destructive
        onConfirm={() =>
          void act(
            () => api(`/meetings/${meeting.id}?rev=${meeting.rev}`, { method: 'DELETE' }),
            t('toastDeleted'),
          )
        }
      />
    </div>
  );
}
