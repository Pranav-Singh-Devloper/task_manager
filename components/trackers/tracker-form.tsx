'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FieldControl } from '@/components/meeting/field-control';
import { stampText } from '@/components/meeting/format';
import { PageTitle } from '@/components/motion';
import { Button, ConfirmDialog, buttonClasses, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useMeta, type Meta } from '@/lib/queries';
import { shiftDate, todayIn } from '@/shared/dates';
import { newId } from '@/shared/ids';
import { rowName, type TrackerRow } from '@/shared/trackerKpis';
import type { FieldDef, TrackerDef } from '@/shared/types';
import { NOT_EDITABLE } from '@/shared/validation';

/** /trackers/[slug]/new and /trackers/[slug]/[id]: one form for adding and changing a row. */
export function TrackerFormScreen({ slug, id }: { slug: string; id?: string }) {
  const t = useTranslations('trackers');
  const meta = useMeta();
  const row = useQuery({
    queryKey: ['tracker', slug, 'row', id],
    queryFn: () => api<{ row: TrackerRow }>(`/trackers/${slug}/rows/${id}`),
    enabled: Boolean(id),
  });
  if (meta.isPending || (id && row.isPending)) return <p>{t('loading')}</p>;
  const tracker = meta.data?.trackers.find((x) => x.slug === slug);
  if (!meta.data || !tracker || (id && (row.isError || !row.data))) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-semibold">{t('notFound')}</p>
        <Link href="/" className={buttonClasses('outline')}>
          {t('backToList', { name: tracker?.name ?? '' })}
        </Link>
      </div>
    );
  }
  const fields = meta.data.trackerFields
    .filter((f) => f.category_slug === slug && !f.archived)
    .sort((a, b) => a.order - b.order);
  return (
    <Form
      key={row.data?.row.id ?? 'new'}
      meta={meta.data}
      tracker={tracker}
      fields={fields}
      existing={row.data?.row ?? null}
    />
  );
}

function Form({
  meta,
  tracker,
  fields,
  existing,
}: {
  meta: Meta;
  tracker: TrackerDef;
  fields: FieldDef[];
  existing: TrackerRow | null;
}) {
  const t = useTranslations('trackers');
  const common = useTranslations('common');
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const [newRowId] = useState(() => newId());
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (existing) return { ...existing.values };
    const start: Record<string, unknown> = {};
    for (const f of fields) if (f.default_value) start[f.key] = f.default_value;
    return start;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const listHref = `/trackers/${tracker.slug}`;
  const today = todayIn(meta.settings.timezone);
  const roles = tracker.settings.roles;
  const title = existing
    ? rowName(existing.values, roles) || t('untitled')
    : t('newTitle', { item: tracker.item_name });
  const fullName = existing ? String(existing.values[roles.title_key] ?? '').trim() : '';

  async function save() {
    setSaving(true);
    setErrors({});
    setFailure('');
    const body: Record<string, unknown> = {};
    for (const f of fields) if (!NOT_EDITABLE.has(f.type)) body[f.key] = values[f.key] ?? null;
    try {
      if (existing) {
        await api(`/trackers/${tracker.slug}/rows/${existing.id}`, {
          method: 'PATCH',
          body: { rev: existing.rev, values: body },
        });
      } else {
        await api(`/trackers/${tracker.slug}/rows`, {
          method: 'POST',
          body: { id: newRowId, values: body },
        });
      }
      await client.invalidateQueries();
      toast.show({ message: existing ? t('saved') : t('added') });
      router.push(listHref);
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0) {
        setErrors(Object.fromEntries(e.issues.map((i) => [i.field, i.message])));
        setFailure(t('fixErrors'));
      } else setFailure(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    try {
      await api(`/trackers/${tracker.slug}/rows/${existing.id}?rev=${existing.rev}`, {
        method: 'DELETE',
      });
      await client.invalidateQueries();
      router.push(listHref);
      toast.show({
        message: t('deleted'),
        actionLabel: common('undo'),
        onAction: async () => {
          try {
            await api(`/trackers/${tracker.slug}/rows/${existing.id}/restore`, { method: 'POST' });
            await client.invalidateQueries();
            toast.show({ message: t('restored') });
          } catch (e) {
            toast.show({ message: e instanceof ApiError ? e.message : t('saveFailed') });
          }
        },
      });
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : t('saveFailed'));
    }
  }

  // The number is given when the row is saved, so it is shown only on an existing row.
  const editable = fields.filter(
    (f) => (f.show_in_form || f.type === 'auto_number') && (existing || f.type !== 'auto_number'),
  );
  // Long answers and Track's states take the full width; everything else sits two to a row on a computer.
  const wide = (f: FieldDef) => f.type === 'long_text' || f.type === 'stages';

  return (
    <form
      noValidate
      className="flex flex-col gap-4 pb-28 md:pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{title}</PageTitle>
        <Link href={listHref} className={buttonClasses('outline')}>
          {t('backToList', { name: tracker.name })}
        </Link>
      </div>
      {existing && fullName && fullName !== title && (
        // The list shows the short name; the full name is read here in whole.
        <p className="text-lg font-semibold">{fullName}</p>
      )}
      {existing && (
        <p className="text-muted">
          {t('lastChanged', { when: stampText(existing.updated_at, meta.settings) })}
        </p>
      )}

      <div className="grid gap-x-6 gap-y-4 rounded-2xl border-ui border-soft bg-surface p-4 shadow-sm md:p-5 lg:grid-cols-2">
        {editable.map((f) => (
          <div key={f.key} className={wide(f) ? 'lg:col-span-2' : undefined}>
            <FieldControl
              field={f}
              value={values[f.key]}
              onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))}
              error={errors[f.key]}
              computed={f.type === 'auto_number' ? String(values[f.key] ?? '') || null : undefined}
              quickDates={
                f.type === 'date' || f.type === 'stages'
                  ? { today, tomorrow: shiftDate(today, 1) }
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {failure && (
        <p role="alert" className="font-semibold text-danger">
          {failure}
        </p>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap gap-3 border-t-ui border-soft bg-page/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        <Link href={listHref} className={buttonClasses('outline', 'lg')}>
          {common('cancel')}
        </Link>
        {existing && (
          <Button variant="danger" size="lg" onClick={() => setConfirming(true)}>
            {t('delete')}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('keep')}
        destructive
        onConfirm={() => void remove()}
      />
    </form>
  );
}
