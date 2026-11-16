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
      className="inline-flex gap-1 rounded-xl border-ui border-line bg-sunken p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'min-h-tap min-w-tap rounded-lg px-5 py-2 text-base font-semibold transition-colors',
            value === o.value
              ? 'btn-primary bg-accent text-accent-ink'
              : 'bg-transparent text-ink hover:bg-surface',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
