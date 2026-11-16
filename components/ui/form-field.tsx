'use client';

import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  labelId: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean;
}

interface FormFieldProps {
  label: string;
  /** Gives the field a stable address: the wrapper is `field-<name>` and the control `input-<name>`. */
  name?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Use for a group of controls such as radio chips: the label names the group instead of one input. */
  group?: boolean;
  /** Label and control side by side (wrapping when narrow), for short controls such as a row of chips. */
  inline?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label, "(Required)" in words, hint and error message, wired together for screen readers. */
export function FormField({
  label,
  name,
  required,
  hint,
  error,
  group,
  inline,
  children,
}: FormFieldProps) {
  const t = useTranslations('common');
  const auto = useId();
  const id = name ? `input-${name}` : auto;
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const labelContent = (
    <>
      {label}
      {required && <span className="ml-2 font-normal text-muted">{t('required')}</span>}
    </>
  );

  return (
    <div
      id={name ? `field-${name}` : undefined}
      className={inline ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : 'flex flex-col gap-2'}
    >
      {group ? (
        <span id={labelId} className="text-base font-semibold">
          {labelContent}
        </span>
      ) : (
        <label id={labelId} htmlFor={id} className="text-base font-semibold">
          {labelContent}
        </label>
      )}
      {hint && (
        <p id={hintId} className="text-muted">
          {hint}
        </p>
      )}
      {children({ id, labelId, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
      {error && (
        <p id={errorId} className="font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
