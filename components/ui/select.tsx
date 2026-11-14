import clsx from 'clsx';
import type { SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '../icons';
import { fieldClasses } from './input';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  /** Text for the empty choice. Omit when a value is always chosen. */
  placeholder?: string;
}

/** The browser's own select: the best picker on phones and fully keyboard accessible. */
export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select className={clsx(fieldClasses, 'appearance-none pr-12', className)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" />
    </div>
  );
}
