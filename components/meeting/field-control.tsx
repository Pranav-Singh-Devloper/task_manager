'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  CheckboxGroup,
  Combobox,
  FormField,
  Input,
  RadioChips,
  Textarea,
} from '@/components/ui';
import type { FieldDef } from '@/shared/types';

/** Radio chips for short lists, a combobox for long ones (§7.4). */
const MAX_CHIPS = 5;

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  /** For calculated columns: the current value, shown read-only. */
  computed?: string | null;
  /** Today and Tomorrow quick buttons beside a date picker. */
  quickDates?: { today: string; tomorrow: string };
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function isWebLink(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** One control for one field, chosen by the field's type. Labels and rules come from the config. */
export function FieldControl({ field, value, onChange, error, computed, quickDates }: Props) {
  const t = useTranslations('form');
  const common = useTranslations('common');
  const str = text(value);
  const label = field.label;
  const base = {
    name: field.key,
    label,
    required: field.required,
    hint: field.help_text || undefined,
    error,
  };

  if (field.type === 'auto_number' || field.type === 'computed') {
    return (
      <FormField {...base} required={false}>
        {(c) => (
          <p
            id={c.id}
            className="min-h-tap rounded-lg border-ui border-soft bg-page px-4 py-3 text-muted"
          >
            {computed ? `${computed} · ` : ''}
            {t('calculated')}
          </p>
        )}
      </FormField>
    );
  }

  switch (field.type) {
    case 'long_text':
      return (
        <FormField {...base}>
          {(c) => (
            <Textarea
              id={c.id}
              value={str}
              placeholder={field.placeholder || undefined}
              onChange={(e) => onChange(e.target.value)}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
            />
          )}
        </FormField>
      );

    case 'number':
      return (
        <FormField {...base}>
          {(c) => (
            <div className="flex items-center gap-3">
              <Input
                id={c.id}
                type="text"
                inputMode="decimal"
                value={str}
                placeholder={field.placeholder || undefined}
                onChange={(e) => onChange(e.target.value)}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
              />
              {field.unit && <span className="shrink-0 font-semibold">{field.unit}</span>}
            </div>
          )}
        </FormField>
      );

    case 'date':
      return (
        <FormField {...base}>
          {(c) => (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={c.id}
                type="date"
                value={str}
                onChange={(e) => onChange(e.target.value)}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                className="w-auto min-w-[12rem] flex-1"
              />
              {quickDates && (
                <>
                  <Button onClick={() => onChange(quickDates.today)}>{t('today')}</Button>
                  <Button onClick={() => onChange(quickDates.tomorrow)}>{t('tomorrow')}</Button>
                </>
              )}
            </div>
          )}
        </FormField>
      );

    case 'time':
      return (
        <FormField {...base}>
          {(c) => (
            <Input
              id={c.id}
              type="time"
              value={str}
              onChange={(e) => onChange(e.target.value)}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              className="w-auto min-w-[10rem]"
            />
          )}
        </FormField>
      );

    case 'select': {
      if (field.options.length === 0 && !field.allow_new_options) {
        return (
          <FormField {...base}>
            {(c) => (
              <Input
                id={c.id}
                value={str}
                onChange={(e) => onChange(e.target.value)}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
              />
            )}
          </FormField>
        );
      }
      if (field.options.length <= MAX_CHIPS && !field.allow_new_options) {
        return (
          <FormField {...base} group>
            {(c) => (
              <div className="flex flex-col items-start gap-2">
                <RadioChips
                  aria-labelledby={c.labelId}
                  aria-describedby={c['aria-describedby']}
                  aria-invalid={c['aria-invalid']}
                  value={str}
                  onValueChange={onChange}
                  options={field.options.map((o) => ({ value: o, label: o }))}
                />
                {!field.required && str && (
                  <Button onClick={() => onChange('')}>{t('clear')}</Button>
                )}
              </div>
            )}
          </FormField>
        );
      }
      return (
        <FormField {...base}>
          {(c) => (
            <Combobox
              id={c.id}
              options={field.options}
              value={str}
              onChange={onChange}
              allowNew={field.allow_new_options}
              placeholder={field.placeholder || t('typePlaceholder')}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
            />
          )}
        </FormField>
      );
    }

    case 'multi_select': {
      if (field.options.length === 0) {
        return (
          <FormField {...base}>
            {(c) => (
              <Input
                id={c.id}
                value={Array.isArray(value) ? value.join(', ') : str}
                onChange={(e) => onChange(e.target.value)}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
              />
            )}
          </FormField>
        );
      }
      const chosen = Array.isArray(value)
        ? value.map(String)
        : str
          ? str.split(',').map((s) => s.trim())
          : [];
      return (
        <FormField {...base} group>
          {(c) => (
            <CheckboxGroup
              aria-labelledby={c.labelId}
              aria-describedby={c['aria-describedby']}
              options={field.options.map((o) => ({ value: o, label: o }))}
              values={chosen}
              onChange={onChange}
            />
          )}
        </FormField>
      );
    }

    case 'checkbox':
      return (
        <FormField {...base} group>
          {(c) => (
            <RadioChips
              aria-labelledby={c.labelId}
              value={value === true ? 'yes' : 'no'}
              onValueChange={(v) => onChange(v === 'yes')}
              options={[
                { value: 'yes', label: common('yes') },
                { value: 'no', label: common('no') },
              ]}
            />
          )}
        </FormField>
      );

    case 'url':
      return (
        <FormField {...base}>
          {(c) => (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={c.id}
                type="url"
                inputMode="url"
                value={str}
                placeholder={field.placeholder || 'https://'}
                onChange={(e) => onChange(e.target.value)}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                className="w-auto min-w-[12rem] flex-1"
              />
              <Button
                disabled={!isWebLink(str.trim())}
                onClick={() => window.open(str.trim(), '_blank', 'noopener,noreferrer')}
              >
                {t('testLink')}
              </Button>
            </div>
          )}
        </FormField>
      );

    case 'file':
      return null; // Adding files arrives with Drive (M5); it is not shown until it works.

    default:
      return (
        <FormField {...base}>
          {(c) => (
            <Input
              id={c.id}
              value={str}
              placeholder={field.placeholder || undefined}
              onChange={(e) => onChange(e.target.value)}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
            />
          )}
        </FormField>
      );
  }
}
