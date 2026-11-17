import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

/**
 * A short label such as a category or status. The colour is decoration only: the text always says what it is.
 * `color` must come from the accessible palette (at least 4.5:1 on white).
 */
export function Chip({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        // A fixed 1rem radius (not fully round) so a long label that has to wrap still looks like a tidy tag.
        'chip inline-flex min-h-8 items-center rounded-2xl border-ui bg-surface px-3 py-1 text-base font-semibold leading-snug',
        className,
      )}
      style={color ? ({ '--chip': color } as CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}
