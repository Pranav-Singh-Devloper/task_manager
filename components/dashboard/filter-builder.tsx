'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button, Chip, FormField, Input, Select } from '@/components/ui';
import { dateText, timeText } from '@/components/meeting/format';
import type { Meta } from '@/lib/queries';
import {
  filterIsComplete,
  kindOf,
  needsSecondValue,
  needsValue,
  opsFor,
  type FilterKind,
  type FilterOp,
  type FilterSpec,
} from '@/shared/filters';
import type { FieldType } from '@/shared/types';

export interface ColumnOption {
  key: string;
  label: string;
  type: FieldType | 'title';
  options: string[];
}

/** The columns a filter can use: the chosen category's, or every category's merged by key. Always plus the title. */
export function columnOptions(meta: Meta, category: string, titleLabel: string): ColumnOption[] {
  const skip = new Set(['sr_no', 'meeting_status', 'workspace', 'files']);
  const seen = new Map<string, ColumnOption>();
  const fields = meta.fields
    .filter(
      (f) =>
        !f.archived &&
        f.type !== 'file' &&
        !skip.has(f.key) &&
        (!category || f.category_slug === category),
    )
    .sort((a, b) => a.order - b.order);
  for (const f of fields) {
    if (!seen.has(f.key))
      seen.set(f.key, { key: f.key, label: f.label, type: f.type, options: f.options });
  }
  return [{ key: 'title', label: titleLabel, type: 'title', options: [] }, ...seen.values()];
}

/** "State is Kerala": the words shown on a filter chip. Dates and times read the way the rest of the app shows them. */
export function filterText(
  spec: FilterSpec,
  columns: ColumnOption[],
  meta: Meta,
  t: ReturnType<typeof useTranslations<'dashboard'>>,
): string {
  const col = columns.find((c) => c.key === spec.field);
  const kind = kindOf(col?.type ?? 'text');
  const show = (v?: string) => {
    if (!v) return '';
    if (kind === 'date') {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
      return iso ? dateText(iso, meta.settings) : v;
    }
    if (kind === 'time' && /^\d{2}:\d{2}$/.test(v)) return timeText(v, meta.settings);
    if (kind === 'checkbox') return v === 'yes' ? t('yes') : t('no');
    return v;
  };
  const column = col?.label ?? spec.field;
  const op = t(`op_${spec.op}` as 'op_is');
  if (!needsValue(spec.op)) return t('chipNoValue', { column, op });
  if (needsSecondValue(spec.op))
    return t('chipBetween', { column, op, from: show(spec.value), to: show(spec.value2) });
  return t('chipValue', { column, op, value: show(spec.value) });
}

interface Props {
  meta: Meta;
  category: string;
  onAdd: (spec: FilterSpec) => void;
}

/** "Add a filter": pick a column, pick how, enter a value. It sits on the page, not in a popup. */
export function FilterBuilder({ meta, category, onAdd }: Props) {
  const t = useTranslations('dashboard');
  const columns = useMemo(
    () => columnOptions(meta, category, t('meetingTitle')),
    [meta, category, t],
  );
  const [field, setField] = useState('');
  const [op, setOp] = useState<FilterOp>('contains');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');

  const column = columns.find((c) => c.key === field);
  const kind: FilterKind = kindOf(column?.type ?? 'text');
  const ops = opsFor(kind);
  const spec: FilterSpec = { field, op, value, value2 };
  const ready = Boolean(column) && filterIsComplete(spec, kind);
  const choices =
    column && (op === 'is' || op === 'is_not') && column.options.length > 0 ? column.options : null;

  const pick = (key: string) => {
    const next = columns.find((c) => c.key === key);
    setField(key);
    setOp(opsFor(kindOf(next?.type ?? 'text'))[0] as FilterOp);
    setValue('');
    setValue2('');
  };

  const input = (v: string, set: (s: string) => void, id: string) => {
    if (kind === 'checkbox') {
      return (
        <Select
          id={id}
          value={v}
          onChange={(e) => set(e.target.value)}
          placeholder={t('chooseValue')}
          options={[
            { value: 'yes', label: t('yes') },
            { value: 'no', label: t('no') },
          ]}
        />
      );
    }
    if (choices) {
      return (
        <Select
          id={id}
          value={v}
          onChange={(e) => set(e.target.value)}
          placeholder={t('chooseValue')}
          options={choices.map((o) => ({ value: o, label: o }))}
        />
      );
    }
    return (
      <Input
        id={id}
        type={kind === 'date' ? 'date' : kind === 'time' ? 'time' : 'text'}
        inputMode={kind === 'number' ? 'decimal' : undefined}
        value={v}
        onChange={(e) => set(e.target.value)}
      />
    );
  };

  return (
    <section
      aria-labelledby="builder-title"
      className="flex flex-col gap-4 rounded-xl border-ui border-line bg-surface p-5"
    >
      <h2 id="builder-title" className="text-xl">
        {t('builderTitle')}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField name="filter_column" label={t('column')}>
          {(c) => (
            <Select
              id={c.id}
              value={field}
              onChange={(e) => pick(e.target.value)}
              placeholder={t('chooseColumn')}
              options={columns.map((o) => ({ value: o.key, label: o.label }))}
            />
          )}
        </FormField>
        {column && (
          <FormField name="filter_op" label={t('operator')}>
            {(c) => (
              <Select
                id={c.id}
                value={op}
                onChange={(e) => {
                  setOp(e.target.value as FilterOp);
                  setValue2('');
                }}
                options={ops.map((o) => ({ value: o, label: t(`op_${o}` as 'op_is') }))}
              />
            )}
          </FormField>
        )}
        {column && needsValue(op) && (
          <FormField name="filter_value" label={t('value')}>
            {(c) => input(value, setValue, c.id)}
          </FormField>
        )}
        {column && needsSecondValue(op) && (
          <FormField name="filter_value2" label={t('valueTo')}>
            {(c) => input(value2, setValue2, c.id)}
          </FormField>
        )}
      </div>
      <div>
        <Button
          variant="primary"
          disabled={!ready}
          onClick={() => {
            onAdd({
              field,
              op,
              ...(needsValue(op) ? { value: value.trim() } : {}),
              ...(needsSecondValue(op) ? { value2: value2.trim() } : {}),
            });
            setField('');
            setValue('');
            setValue2('');
          }}
        >
          {t('addFilter')}
        </Button>
      </div>
    </section>
  );
}

interface ActiveProps {
  filters: FilterSpec[];
  meta: Meta;
  onRemove: (index: number) => void;
  onClearAll: () => void;
}

/** The filters in use, each removable, with Clear all. */
export function ActiveFilters({ filters, meta, onRemove, onClearAll }: ActiveProps) {
  const t = useTranslations('dashboard');
  const columns = useMemo(() => columnOptions(meta, '', t('meetingTitle')), [meta, t]);
  if (filters.length === 0) return null;
  return (
    <div role="group" aria-label={t('filtersInUse')} className="flex flex-wrap items-center gap-2">
      {filters.map((f, i) => {
        const text = filterText(f, columns, meta, t);
        return (
          <span key={`${f.field}-${i}`} className="inline-flex items-center gap-2">
            <Chip>{text}</Chip>
            <Button aria-label={t('removeFilter', { filter: text })} onClick={() => onRemove(i)}>
              {t('remove')}
            </Button>
          </span>
        );
      })}
      <Button onClick={onClearAll}>{t('clearAll')}</Button>
    </div>
  );
}
