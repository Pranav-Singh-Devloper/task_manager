'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';
import clsx from 'clsx';
import { CheckIcon } from '../icons';
import type { SelectOption } from './select';

interface RadioChipsProps {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** Big, labelled choices for short lists. The tick means "chosen", so colour is never the only signal. */
export function RadioChips({ options, value, onValueChange, ...rest }: RadioChipsProps) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      className="flex flex-wrap gap-2"
      {...rest}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={clsx(
            'lift inline-flex min-h-tap min-w-tap items-center justify-center gap-2 rounded-xl border-ui border-line px-5 py-2',
            'bg-surface text-base font-semibold text-ink shadow-sm hover:bg-sunken',
            'data-[state=checked]:btn-primary data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-ink',
          )}
        >
          <RadioGroup.Indicator>
            <CheckIcon width={20} height={20} />
          </RadioGroup.Indicator>
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
