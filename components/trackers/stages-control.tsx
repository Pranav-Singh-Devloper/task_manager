'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { formatStage, parseStage, type Stage } from '@/shared/stages';

interface Props {
  /** The states as stored: one "Name (YYYY-MM-DD)" per entry. */
  value: unknown;
  onChange: (lines: string[]) => void;
  /** The group's label, so each input can say which state it is. */
  labelId: string;
  describedBy: string | undefined;
  today: string;
}

/**
 * Track's states: a name and, once it is reached, a date. The person writes their own states for each event, in
 * order; the latest one with a date is where the event is now.
 */
export function StagesControl({ value, onChange, labelId, describedBy, today }: Props) {
  const t = useTranslations('trackers');
  const [stages, setStages] = useState<Stage[]>(() => {
    const lines = Array.isArray(value) ? value.map(String) : [];
    const parsed = lines.map(parseStage);
    return parsed.length > 0 ? parsed : [{ name: '', date: null }];
  });

  const update = (next: Stage[]) => {
    setStages(next);
    onChange(next.map(formatStage));
  };
  const set = (i: number, change: Partial<Stage>) =>
    update(stages.map((s, j) => (j === i ? { ...s, ...change } : s)));

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-col gap-3"
    >
      <ol className="flex flex-col gap-3">
        {stages.map((s, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center gap-2 rounded-xl border-ui border-soft bg-page p-2"
          >
            <span aria-hidden="true" className="w-6 shrink-0 text-center font-semibold text-muted">
              {i + 1}
            </span>
            <Input
              aria-label={t('stageName', { n: i + 1 })}
              value={s.name}
              maxLength={200}
              onChange={(e) => set(i, { name: e.target.value })}
              className="min-w-[10rem] flex-1"
            />
            <Input
              type="date"
              aria-label={`${t('stageDate')} — ${t('stageName', { n: i + 1 })}`}
              value={s.date ?? ''}
              onChange={(e) => set(i, { date: e.target.value || null })}
              className="w-auto"
            />
            {!s.date && <Button onClick={() => set(i, { date: today })}>{t('stageToday')}</Button>}
            <Button
              variant="outline"
              onClick={() => update(stages.filter((_, j) => j !== i))}
              disabled={stages.length === 1}
            >
              {t('stageRemove', { n: i + 1 })}
            </Button>
          </li>
        ))}
      </ol>
      <div>
        <Button onClick={() => update([...stages, { name: '', date: null }])}>
          {t('stagesAdd')}
        </Button>
      </div>
    </div>
  );
}
