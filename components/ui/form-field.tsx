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
  required?: boolean;
  hint?: string;
  error?: string;
  /** Use for a group of controls such as radio chips: the label names the group instead of one input. */
  group?: boolean;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label, "(Required)" in words, hint and error message, wired together for screen readers. */
export function FormField({ label, required, hint, error, group, children }: FormFieldProps) {
  const t = useTranslations('common');
  const id = useId();
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
    <div className="flex flex-col gap-2">
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
