'use client';

import clsx from 'clsx';
import { CheckIcon } from '../icons';
import type { SelectOption } from './select';

interface CheckboxGroupProps {
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** Big labelled tick boxes for "choose any". Each row is a full-size tap target; a tick mark shows what is chosen. */
export function CheckboxGroup({ options, values, onChange, ...aria }: CheckboxGroupProps) {
  return (
    <div role="group" className="flex flex-col gap-2" {...aria}>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <label
            key={o.value}
            className={clsx(
              'lift flex min-h-tap cursor-pointer items-center gap-3 rounded-xl border-ui px-4 py-2 text-base font-semibold',
              on
                ? 'btn-primary border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-ink shadow-sm hover:bg-sunken',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() =>
                onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])
              }
            />
            <span
              aria-hidden="true"
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-ui',
                on
                  ? 'border-accent-ink bg-accent-ink text-accent'
                  : 'border-line bg-surface text-transparent',
              )}
            >
              <CheckIcon width={18} height={18} />
            </span>
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
