'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, buttonClasses, FormField, Input, Select, Textarea } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useMeta } from '@/lib/queries';
import { FIELD_TYPE_LABELS } from '@/shared/seed';
import type { FieldDef, FieldType } from '@/shared/types';
import { TypedConfirm } from './typed-confirm';

const CHOOSABLE: FieldType[] = [
  'text',
  'long_text',
  'number',
  'date',
  'time',
  'select',
  'multi_select',
  'checkbox',
  'url',
  'computed',
];

interface TypeCheck {
  allowed: boolean;
  invalid_count: number;
  message: string;
}

/** Add or edit one column (§7.9 b). A full page, with plain explanations of what a change would do. */
export function ColumnFormScreen({
  category,
  columnKey,
}: {
  category: string;
  columnKey?: string;
}) {
  const t = useTranslations('admin');
  const meta = useMeta();
  if (meta.isPending) return <p>{t('loading')}</p>;
  if (meta.isError || !meta.data) return <p className="font-semibold">{t('loadFailed')}</p>;
  // A meeting category or a tracker: their columns are managed the same way.
  const all = [...meta.data.fields, ...meta.data.trackerFields];
  const existing = columnKey
    ? all.find((f) => f.category_slug === category && f.key === columnKey)
    : undefined;
  if (columnKey && !existing) return <p className="font-semibold">{t('columnNotFound')}</p>;
  const cat = meta.data.categories.find((c) => c.slug === category);
  const tracker = meta.data.trackers.find((x) => x.slug === category);
  const stored = all
    .filter((f) => f.category_slug === category && f.type !== 'computed')
    .map((f) => f.key);
  return (
    <Form
      category={category}
      categoryName={cat?.name ?? tracker?.name ?? ''}
      isTracker={Boolean(tracker)}
      existing={existing}
      storedKeys={stored}
    />
  );
}

function Form({
  category,
  categoryName,
  isTracker,
  existing,
  storedKeys,
}: {
  category: string;
  categoryName: string;
  /** Trackers can have a States column (Track) and have no case numbers. */
  isTracker: boolean;
  existing: FieldDef | undefined;
  storedKeys: string[];
}) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const router = useRouter();
  const client = useQueryClient();
  const editing = Boolean(existing);
  const choosable: FieldType[] = isTracker ? [...CHOOSABLE, 'stages'] : CHOOSABLE;

  const [label, setLabel] = useState(existing?.label ?? '');
  const [type, setType] = useState<FieldType>(existing?.type ?? 'text');
  const [options, setOptions] = useState((existing?.options ?? []).join('\n'));
  const [allowNew, setAllowNew] = useState(existing?.allow_new_options ?? false);
  const [required, setRequired] = useState(existing?.required ?? false);
  const [inForm, setInForm] = useState(existing?.show_in_form ?? true);
  const [inTable, setInTable] = useState(existing?.show_in_table ?? false);
  const [defaultValue, setDefaultValue] = useState(existing?.default_value ?? '');
  const [help, setHelp] = useState(existing?.help_text ?? '');
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [caseKey, setCaseKey] = useState(existing?.case_key ?? false);
  const [formula, setFormula] = useState(existing?.computed_expr ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<TypeCheck | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const locked = Boolean(existing?.locked);
  const listy = type === 'select' || type === 'multi_select';

  // When the type changes on an existing column, ask what it would do before anything is saved (§9 rule 13).
  useEffect(() => {
    if (!existing || type === existing.type) return;
    let live = true;
    const q = new URLSearchParams({ type });
    if (type === 'select') q.set('options', options);
    api<TypeCheck>(`/admin/fields/${existing.category_slug}/${existing.key}/type-check?${q}`)
      .then((r) => live && setCheck(r))
      .catch(() => live && setCheck(null));
    return () => {
      live = false;
    };
  }, [existing, type, options]);
  const shownCheck = existing && type !== existing.type ? check : null;

  async function save() {
    setErrors({});
    setFailure('');
    setSaving(true);
    const body = {
      label,
      type,
      required,
      options: options.split('\n'),
      allow_new_options: allowNew,
      default_value: defaultValue,
      help_text: help,
      unit,
      show_in_form: inForm,
      show_in_table: inTable,
      case_key: caseKey,
      computed_expr: formula,
    };
    try {
      if (existing) {
        await api(`/admin/fields/${existing.category_slug}/${existing.key}`, {
          method: 'PATCH',
          body,
        });
      } else {
        await api('/admin/fields', { method: 'POST', body: { category, ...body } });
      }
      await client.invalidateQueries();
      router.push(`/admin/columns?category=${category}`);
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0) {
        setErrors(Object.fromEntries(e.issues.map((i) => [i.field, i.message])));
      } else setFailure(e instanceof ApiError ? e.message : t('cellFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(confirm: string) {
    if (!existing) return;
    setRemoveError('');
    try {
      await api(`/admin/fields/${existing.category_slug}/${existing.key}/remove`, {
        method: 'POST',
        body: { confirm },
      });
      await client.invalidateQueries();
      router.push(`/admin/columns?category=${category}`);
    } catch (e) {
      setRemoveError(e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : t('cellFailed'));
    }
  }

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-6 pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <h2 className="mb-2">
          {editing ? t('editColumn', { name: existing?.label ?? '' }) : t('newColumn')}
        </h2>
        <p>{t('inCategory', { name: categoryName })}</p>
        {locked && <p className="mt-2 font-semibold">{t('lockedNote')}</p>}
      </div>

      <FormField name="label" label={t('columnName')} required error={errors.label}>
        {(c) => (
          <Input
            id={c.id}
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
          />
        )}
      </FormField>

      <FormField
        name="type"
        label={t('columnType')}
        error={errors.type}
        hint={editing ? t('typeHintEditing') : t('typeHint')}
      >
        {(c) => (
          <Select
            id={c.id}
            value={type}
            disabled={locked}
            onChange={(e) => setType(e.target.value as FieldType)}
            aria-describedby={c['aria-describedby']}
            options={(existing && !choosable.includes(existing.type)
              ? [existing.type, ...choosable]
              : choosable
            ).map((v) => ({ value: v, label: FIELD_TYPE_LABELS[v] }))}
          />
        )}
      </FormField>
      {shownCheck && (
        <p
          role="status"
          className={`rounded-xl border-ui p-3 font-semibold ${shownCheck.allowed ? 'border-line' : 'border-danger'}`}
        >
          {shownCheck.message}
        </p>
      )}

      {listy && (
        <>
          <FormField name="options" label={t('choices')} hint={t('choicesHint')}>
            {(c) => (
              <Textarea
                id={c.id}
                rows={6}
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="h-6 w-6"
              checked={allowNew}
              onChange={(e) => setAllowNew(e.target.checked)}
            />
            {t('allowNew')}
          </label>
        </>
      )}

      {type === 'computed' && (
        <FormField
          name="computed_expr"
          label={t('formula')}
          error={errors.computed_expr}
          hint={t('formulaHint', { keys: storedKeys.join(', ') })}
        >
          {(c) => (
            <Input
              id={c.id}
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
            />
          )}
        </FormField>
      )}

      {type === 'number' && (
        <FormField name="unit" label={t('unit')} hint={t('unitHint')}>
          {(c) => (
            <Input
              id={c.id}
              value={unit}
              maxLength={20}
              onChange={(e) => setUnit(e.target.value)}
              aria-describedby={c['aria-describedby']}
            />
          )}
        </FormField>
      )}

      {type !== 'computed' && (
        <>
          <FormField name="help_text" label={t('helpText')} hint={t('helpTextHint')}>
            {(c) => (
              <Input
                id={c.id}
                value={help}
                onChange={(e) => setHelp(e.target.value)}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          <FormField name="default_value" label={t('defaultValue')}>
            {(c) => (
              <Input
                id={c.id}
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
              />
            )}
          </FormField>
        </>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="text-base font-semibold">{t('howItBehaves')}</legend>
        {type !== 'computed' && !locked && (
          <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="h-6 w-6"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            {t('mustBeFilled')}
          </label>
        )}
        {type !== 'computed' && !locked && (
          <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="h-6 w-6"
              checked={inForm}
              onChange={(e) => setInForm(e.target.checked)}
            />
            {t('showInForm')}
          </label>
        )}
        <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={inTable}
            onChange={(e) => setInTable(e.target.checked)}
          />
          {t('showInTable')}
        </label>
        {type !== 'computed' && !isTracker && (
          <label className="inline-flex min-h-tap items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="h-6 w-6"
              checked={caseKey}
              onChange={(e) => setCaseKey(e.target.checked)}
            />
            {t('caseKey')}
          </label>
        )}
      </fieldset>
      {type !== 'computed' && !isTracker && <p className="text-muted">{t('caseKeyHint')}</p>}

      {failure && (
        <p role="alert" className="font-semibold text-danger">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={saving || (shownCheck !== null && !shownCheck.allowed)}
        >
          {saving ? t('saving') : editing ? t('saveColumn') : t('createColumn')}
        </Button>
        <Link
          href={`/admin/columns?category=${category}`}
          className={buttonClasses('outline', 'lg')}
        >
          {common('cancel')}
        </Link>
      </div>

      {editing && !locked && (
        <div className="mt-6 flex flex-col gap-3 border-t-ui border-soft pt-6">
          <h3 className="text-2xl font-semibold">{t('removeColumnHeading')}</h3>
          <p>{t('removeColumnBody')}</p>
          {!removing && (
            <div>
              <Button variant="danger" onClick={() => setRemoving(true)}>
                {t('removeColumn')}
              </Button>
            </div>
          )}
          {removing && (
            <TypedConfirm
              word={existing?.label ?? ''}
              warning={t('removeColumnWarning')}
              confirmLabel={t('removeForGood')}
              error={removeError}
              onConfirm={(typed) => void remove(typed)}
              onCancel={() => setRemoving(false)}
            />
          )}
        </div>
      )}
    </form>
  );
}
