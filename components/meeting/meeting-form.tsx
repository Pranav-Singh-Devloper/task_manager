'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  buttonClasses,
  CheckboxGroup,
  FormField,
  Input,
  RadioChips,
} from '@/components/ui';
import { ApiError, NetworkError, api } from '@/lib/api';
import type { Meta } from '@/lib/queries';
import { useUndoToast } from '@/lib/use-undo-toast';
import { addMinutesToTime, shiftDate, todayIn } from '@/shared/dates';
import { newId } from '@/shared/ids';
import type { Meeting } from '@/shared/meeting';
import type { FieldDef, ValidationIssue } from '@/shared/types';
import { validateValues } from '@/shared/validation';
import { FieldControl } from './field-control';
import { useDraft } from './use-draft';

/** Fields that have their own place in the form, so they are not repeated under "About this meeting". */
const OWN_PLACE = new Set([
  'sr_no',
  'date',
  'start_time',
  'end_time',
  'topic',
  'meeting_status',
  'meeting_link',
  'files',
  'remarks',
  'details',
  'workspace',
  'reminder_minutes',
]);
const STANDARD_REMINDERS = ['10080', '1440', '60', '15'];
const DURATIONS = ['30', '60', '120'] as const;

type Duration = (typeof DURATIONS)[number] | 'other';
type Banner = { kind: 'network' | 'conflict' | 'text'; text?: string } | null;

interface Draft {
  id: string;
  values: Record<string, unknown>;
  duration: Duration;
  reminders: string[];
  savedAt: string;
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

function durationOf(start: unknown, end: unknown): Duration {
  if (typeof start !== 'string' || typeof end !== 'string' || !start || !end) return '60';
  const d = String(minutes(end) - minutes(start));
  return (DURATIONS as readonly string[]).includes(d) ? (d as Duration) : 'other';
}

function parseReminders(value: unknown, fallback: string): string[] {
  const source = typeof value === 'string' && value.trim() ? value : fallback;
  return source
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Props {
  mode: 'create' | 'edit';
  meta: Meta;
  categorySlug: string;
  meeting?: Meeting;
  /** Values carried over when the person changed category. */
  carried?: Record<string, unknown>;
}

/** The long form (§7.4): one page, sections in a fixed order, built from the category's field config. */
export function MeetingForm({ mode, meta, categorySlug, meeting, carried }: Props) {
  const t = useTranslations('form');
  const common = useTranslations('common');
  const nav = useTranslations('newMeeting');
  const router = useRouter();
  const client = useQueryClient();
  const announce = useUndoToast();

  const category = meta.categories.find((c) => c.slug === categorySlug)!;
  const fields = useMemo(
    () =>
      meta.fields
        .filter((f) => f.category_slug === categorySlug && !f.archived && f.show_in_form)
        .sort((a, b) => a.order - b.order),
    [meta.fields, categorySlug],
  );
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const about = fields.filter((f) => !OWN_PLACE.has(f.key));

  const defaultReminders = meta.settings.default_reminders;
  const [id, setId] = useState(() => meeting?.id ?? newId());
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const start: Record<string, unknown> = {};
    for (const f of fields) {
      const existing = meeting?.values[f.key];
      start[f.key] = existing ?? (f.default_value || (f.type === 'checkbox' ? false : ''));
    }
    if (!meeting) {
      start.workspace = category.default_workspace;
      for (const [k, v] of Object.entries(carried ?? {}))
        if (byKey.has(k) && v !== undefined) start[k] = v;
    }
    return start;
  });
  const [duration, setDuration] = useState<Duration>(() =>
    durationOf(values.start_time, values.end_time),
  );
  const [reminders, setReminders] = useState<string[]>(() =>
    parseReminders(values.reminder_minutes, defaultReminders),
  );
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);

  const today = todayIn(meta.settings.timezone);
  const set = (key: string, v: unknown) => {
    setDirty(true);
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  // ---- draft safety ----
  const draftKey = mode === 'edit' ? `mm.draft.${meeting?.id}` : `mm.draft.new.${categorySlug}`;
  const draft = useDraft<Draft>(draftKey);
  useEffect(() => {
    if (!dirty || !draft.canSave) return;
    const timer = setTimeout(
      () => draft.save({ id, values, duration, reminders, savedAt: new Date().toISOString() }),
      400,
    );
    return () => clearTimeout(timer);
  }, [dirty, id, values, duration, reminders, draft]);

  const restore = (d: Draft) => {
    setDirty(true);
    if (mode === 'create') setId(d.id);
    setValues(d.values);
    setDuration(d.duration);
    setReminders(d.reminders);
    draft.decide();
  };

  // ---- the "when" part ----
  const setStart = (v: string) => {
    setDirty(true);
    setValues((prev) => {
      const next: Record<string, unknown> = { ...prev, start_time: v };
      if (duration !== 'other' && v) next.end_time = addMinutesToTime(v, Number(duration)) ?? '';
      return next;
    });
  };
  const chooseDuration = (d: string) => {
    setDirty(true);
    setDuration(d as Duration);
    if (d !== 'other') {
      const start = values.start_time;
      setValues((prev) => ({
        ...prev,
        end_time:
          typeof start === 'string' && start ? (addMinutesToTime(start, Number(d)) ?? '') : '',
      }));
    }
  };

  const reminderOptions = useMemo(() => {
    const labels: Record<string, string> = {
      '10080': t('r10080'),
      '1440': t('r1440'),
      '60': t('r60'),
      '15': t('r15'),
    };
    const all = [...new Set([...STANDARD_REMINDERS, ...reminders])].sort(
      (a, b) => Number(b) - Number(a),
    );
    return all.map((m) => ({ value: m, label: labels[m] ?? t('rCustom', { minutes: m }) }));
  }, [reminders, t]);

  // ---- save ----
  const errorFor = (key: string) => issues.find((i) => i.field === key)?.message;

  function payload(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of fields)
      if (f.type !== 'auto_number' && f.type !== 'computed' && f.type !== 'file')
        out[f.key] = values[f.key];
    const chosen = [...reminders].sort((a, b) => Number(b) - Number(a)).join(',');
    const standard = parseReminders('', defaultReminders)
      .sort((a, b) => Number(b) - Number(a))
      .join(',');
    if (byKey.has('reminder_minutes')) out.reminder_minutes = chosen === standard ? '' : chosen;
    return out;
  }

  function showIssues(list: ValidationIssue[]) {
    setIssues(list);
    const first = list.find((i) => i.field !== 'form');
    if (first) {
      const el =
        document.getElementById(`input-${first.field}`) ??
        document.querySelector<HTMLElement>(
          `#field-${first.field} button, #field-${first.field} input`,
        );
      el?.focus();
      el?.scrollIntoView({ block: 'center' });
    } else {
      summaryRef.current?.focus();
    }
  }

  async function save() {
    setBanner(null);
    const body = payload();
    const checked = validateValues(
      meta.fields.filter((f) => f.category_slug === categorySlug),
      body,
      {
        workspaces: meta.workspaces.map((w) => w.slug),
        existing: meeting?.values,
        hasTitleTemplate: Boolean(category.title_template),
      },
    );
    if (!checked.ok) {
      showIssues(checked.issues);
      return;
    }
    setIssues([]);
    setSaving(true);
    try {
      const res =
        mode === 'create'
          ? await api<{ meeting: Meeting; undo_token: string | null }>('/meetings', {
              method: 'POST',
              body: { id, category: categorySlug, values: body },
            })
          : await api<{ meeting: Meeting; undo_token: string | null }>(`/meetings/${meeting!.id}`, {
              method: 'PATCH',
              body: { rev: meeting!.rev, values: body },
            });
      draft.clear();
      await client.invalidateQueries();
      announce(mode === 'create' ? t('saved') : t('changed'), res.undo_token, () =>
        router.push('/'),
      );
      router.push(`/meetings/${res.meeting.id}`);
    } catch (e) {
      if (e instanceof NetworkError) setBanner({ kind: 'network' });
      else if (e instanceof ApiError && e.status === 400 && e.issues.length > 0)
        showIssues(e.issues);
      else if (e instanceof ApiError && e.code === 'conflict') setBanner({ kind: 'conflict' });
      else setBanner({ kind: 'text', text: e instanceof ApiError ? e.message : t('saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  const fieldIssues = issues.filter((i) => i.field !== 'form');
  const formIssues = issues.filter((i) => i.field === 'form');
  const labelOf = (key: string) => byKey.get(key)?.label ?? key;
  const control = (f: FieldDef) => (
    <FieldControl
      key={f.key}
      field={f}
      value={values[f.key]}
      onChange={(v) => set(f.key, v)}
      error={errorFor(f.key)}
      computed={null}
    />
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
      className="mx-auto flex max-w-2xl flex-col gap-8 pb-32"
    >
      <div>
        <h1 className="mb-2">{mode === 'edit' ? nav('editTitle') : nav('title')}</h1>
        <p className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{nav('kind', { name: category.name })}</span>
          {mode === 'create' && (
            <Link
              href={`/meetings/new?from=${categorySlug}`}
              className={buttonClasses('outline')}
              onClick={() => carryOver(values)}
            >
              {nav('changeCategory')}
            </Link>
          )}
        </p>
      </div>

      {draft.pending && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border-ui border-line bg-surface p-4"
        >
          <p className="flex-1 font-semibold">{t('draftFound')}</p>
          <Button variant="primary" onClick={() => restore(draft.pending as Draft)}>
            {t('restore')}
          </Button>
          <Button
            onClick={() => {
              draft.clear();
              draft.decide();
            }}
          >
            {t('discard')}
          </Button>
        </div>
      )}

      {(issues.length > 0 || banner) && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="flex flex-col gap-3 rounded-xl border-ui border-danger bg-surface p-4"
        >
          {fieldIssues.length > 0 && (
            <>
              <p className="font-semibold">{t('summary', { count: fieldIssues.length })}</p>
              <ul className="list-disc pl-6">
                {fieldIssues.map((i) => (
                  <li key={`${i.field}-${i.message}`}>
                    <a
                      href={`#field-${i.field}`}
                      className="inline-flex min-h-tap items-center underline"
                      onClick={(e) => {
                        e.preventDefault();
                        const el =
                          document.getElementById(`input-${i.field}`) ??
                          document.querySelector<HTMLElement>(
                            `#field-${i.field} button, #field-${i.field} input`,
                          );
                        el?.focus();
                        el?.scrollIntoView({ block: 'center' });
                      }}
                    >
                      {i.message || labelOf(i.field)}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          {formIssues.map((i) => (
            <p key={i.message} className="font-semibold">
              {i.message}
            </p>
          ))}
          {banner?.kind === 'network' && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 font-semibold">{t('saveFailed')}</p>
              <Button variant="primary" onClick={() => void save()}>
                {common('tryAgain')}
              </Button>
            </div>
          )}
          {banner?.kind === 'conflict' && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 font-semibold">{t('conflict')}</p>
              <Button variant="primary" onClick={() => window.location.reload()}>
                {common('reload')}
              </Button>
            </div>
          )}
          {banner?.kind === 'text' && <p className="font-semibold">{banner.text}</p>}
        </div>
      )}

      <section aria-labelledby="sec-when" className="flex flex-col gap-5">
        <h2 id="sec-when">{t('sectionWhen')}</h2>
        {byKey.get('date') && (
          <FieldControl
            field={byKey.get('date') as FieldDef}
            value={values.date}
            onChange={(v) => set('date', v)}
            error={errorFor('date')}
            quickDates={{ today, tomorrow: shiftDate(today, 1) }}
          />
        )}
        {byKey.get('start_time') && (
          <FieldControl
            field={byKey.get('start_time') as FieldDef}
            value={values.start_time}
            onChange={(v) => setStart(String(v))}
            error={errorFor('start_time')}
          />
        )}
        {byKey.get('end_time') && (
          <>
            <FormField name="duration" label={t('duration')} group>
              {(c) => (
                <RadioChips
                  aria-labelledby={c.labelId}
                  value={duration}
                  onValueChange={chooseDuration}
                  options={[
                    { value: '30', label: t('d30') },
                    { value: '60', label: t('d60') },
                    { value: '120', label: t('d120') },
                    { value: 'other', label: t('dOther') },
                  ]}
                />
              )}
            </FormField>
            {duration === 'other' && (
              <FormField name="end_time" label={t('endTime')} error={errorFor('end_time')}>
                {(c) => (
                  <Input
                    id={c.id}
                    type="time"
                    value={String(values.end_time ?? '')}
                    onChange={(e) => set('end_time', e.target.value)}
                    aria-describedby={c['aria-describedby']}
                    aria-invalid={c['aria-invalid']}
                    className="w-auto min-w-[10rem]"
                  />
                )}
              </FormField>
            )}
            {duration !== 'other' && errorFor('end_time') && (
              <p className="font-semibold text-danger">{errorFor('end_time')}</p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="sec-about" className="flex flex-col gap-5">
        <h2 id="sec-about">{t('sectionAbout')}</h2>
        {byKey.get('topic') && control(byKey.get('topic') as FieldDef)}
        {about.map(control)}
      </section>

      {byKey.get('meeting_link') && (
        <section aria-labelledby="sec-link" className="flex flex-col gap-5">
          <h2 id="sec-link">{t('sectionLink')}</h2>
          {control(byKey.get('meeting_link') as FieldDef)}
        </section>
      )}

      {(byKey.has('remarks') || byKey.has('details')) && (
        <section aria-labelledby="sec-notes" className="flex flex-col gap-5">
          <h2 id="sec-notes">{t('sectionNotes')}</h2>
          {byKey.get('remarks') && control(byKey.get('remarks') as FieldDef)}
          {byKey.get('details') && control(byKey.get('details') as FieldDef)}
        </section>
      )}

      {byKey.has('reminder_minutes') && (
        <section aria-labelledby="sec-reminders" className="flex flex-col gap-5">
          <h2 id="sec-reminders">{t('sectionReminders')}</h2>
          <FormField
            name="reminder_minutes"
            label={t('sectionReminders')}
            hint={t('reminderHint')}
            error={errorFor('reminder_minutes')}
            group
          >
            {(c) => (
              <CheckboxGroup
                aria-labelledby={c.labelId}
                aria-describedby={c['aria-describedby']}
                options={reminderOptions}
                values={reminders}
                onChange={(v) => {
                  setDirty(true);
                  setReminders(v);
                }}
              />
            )}
          </FormField>
        </section>
      )}

      {byKey.has('workspace') && (
        <section aria-labelledby="sec-workspace" className="flex flex-col gap-5">
          <h2 id="sec-workspace">{t('sectionWorkspace')}</h2>
          <FormField name="workspace" label={t('workspace')} error={errorFor('workspace')} group>
            {(c) => (
              <RadioChips
                aria-labelledby={c.labelId}
                value={String(values.workspace ?? '')}
                onValueChange={(v) => set('workspace', v)}
                options={meta.workspaces.map((w) => ({ value: w.slug, label: w.name }))}
              />
            )}
          </FormField>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t-ui border-line bg-surface md:left-[240px]">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 px-4 py-3 md:px-0">
          <Button type="submit" variant="primary" size="lg" disabled={saving}>
            {saving ? t('saving') : mode === 'edit' ? t('saveChanges') : t('save')}
          </Button>
          <Link
            href={mode === 'edit' && meeting ? `/meetings/${meeting.id}` : '/'}
            className={buttonClasses('outline', 'lg')}
          >
            {common('cancel')}
          </Link>
        </div>
      </div>
    </form>
  );
}

/** Hands the core answers to the next category's form when the person changes category. */
function carryOver(values: Record<string, unknown>) {
  const keep = [
    'date',
    'start_time',
    'end_time',
    'topic',
    'meeting_link',
    'remarks',
    'details',
    'workspace',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (values[k] !== undefined && values[k] !== '') out[k] = values[k];
  try {
    sessionStorage.setItem('mm.carry', JSON.stringify(out));
  } catch {
    // ignore
  }
}
