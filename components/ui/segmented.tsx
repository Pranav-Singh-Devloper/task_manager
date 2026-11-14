'use client';

import clsx from 'clsx';

interface SegmentedProps<T extends string> {
  /** Names the group for screen readers, e.g. "Which meetings". */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Two or three labelled buttons side by side, one of them chosen (such as Upcoming | Past). Every choice is a visible word. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-lg border-ui border-line"
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'min-h-tap min-w-tap px-5 py-2 text-base font-semibold',
            i > 0 && 'border-l-ui border-line',
            value === o.value ? 'bg-accent text-accent-ink' : 'bg-surface text-ink hover:bg-page',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
