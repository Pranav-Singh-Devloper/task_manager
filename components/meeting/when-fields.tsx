'use client';

import { useState } from 'react';
import { FormField, Input, RadioChips } from '@/components/ui';
import { addMinutesToTime } from '@/shared/dates';

const STANDARD = [30, 60, 120];
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** How long a meeting runs, from its start and end times. Falls back to 60 minutes. */
export function lengthOf(start: unknown, end: unknown): number {
  if (typeof start !== 'string' || typeof end !== 'string' || !start || !end) return 60;
  const n = minutesOf(end) - minutesOf(start);
  return n > 0 ? n : 60;
}

export interface When {
  date: string;
  start: string;
  /** Minutes. The end time is always start plus this, so moving the start keeps the length. */
  length: number;
}

interface Props {
  value: When;
  onChange: (next: When) => void;
  dateLabel: string;
  startLabel: string;
  errors?: { date?: string; start?: string; end?: string };
  /** Namespace for the "How long?" strings: both pages use the same words. */
  lengthLabel: string;
  endLabel: string;
  otherLabel: string;
  labels: { d30: string; d60: string; d120: string };
}

/** Date, start time and length: the three things a reschedule and a next meeting both ask for. */
export function WhenFields({
  value,
  onChange,
  dateLabel,
  startLabel,
  errors,
  lengthLabel,
  endLabel,
  otherLabel,
  labels,
}: Props) {
  // "Other" stays open once chosen, even if the typed length happens to match a standard one.
  const [otherOpen, setOtherOpen] = useState(!STANDARD.includes(value.length));
  const end = value.start ? addMinutesToTime(value.start, value.length) : null;
  const chosen = otherOpen ? 'other' : String(value.length);

  return (
    <>
      <FormField name="when_date" label={dateLabel} required error={errors?.date}>
        {(c) => (
          <Input
            id={c.id}
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            className="w-auto min-w-[12rem]"
          />
        )}
      </FormField>
      <FormField name="when_start" label={startLabel} required error={errors?.start}>
        {(c) => (
          <Input
            id={c.id}
            type="time"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            className="w-auto min-w-[10rem]"
          />
        )}
      </FormField>
      <FormField name="when_length" label={lengthLabel} group>
        {(c) => (
          <RadioChips
            aria-labelledby={c.labelId}
            value={chosen}
            onValueChange={(v) => {
              if (v === 'other') {
                setOtherOpen(true);
              } else {
                setOtherOpen(false);
                onChange({ ...value, length: Number(v) });
              }
            }}
            options={[
              { value: '30', label: labels.d30 },
              { value: '60', label: labels.d60 },
              { value: '120', label: labels.d120 },
              { value: 'other', label: otherLabel },
            ]}
          />
        )}
      </FormField>
      {otherOpen && (
        <FormField name="when_end" label={endLabel} error={errors?.end}>
          {(c) => (
            <Input
              id={c.id}
              type="time"
              value={end ?? ''}
              onChange={(e) => {
                const n =
                  e.target.value && value.start
                    ? minutesOf(e.target.value) - minutesOf(value.start)
                    : 0;
                if (n > 0) onChange({ ...value, length: n });
              }}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              className="w-auto min-w-[10rem]"
            />
          )}
        </FormField>
      )}
    </>
  );
}
