'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, FormField, Input } from '@/components/ui';

interface Props {
  /** What the person must type, exactly as shown. */
  word: string;
  /** Plain words about what will happen. */
  warning: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
}

/** A typed confirmation for something that cannot be undone (§9 rule 9, 12). Inline, never a pop-up form. */
export function TypedConfirm({
  word,
  warning,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTranslations('admin');
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === word.trim().toLowerCase();
  return (
    <div
      role="group"
      aria-label={confirmLabel}
      className="flex flex-col gap-3 rounded-xl border-ui border-danger bg-surface p-4"
    >
      <p className="font-semibold">{warning}</p>
      <FormField label={t('typeToConfirm', { word })} error={error}>
        {(c) => (
          <Input
            id={c.id}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
          />
        )}
      </FormField>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" disabled={!matches || busy} onClick={() => onConfirm(typed)}>
          {confirmLabel}
        </Button>
        <Button onClick={onCancel}>{t('keepIt')}</Button>
      </div>
    </div>
  );
}
