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
        'chip inline-flex min-h-8 items-center rounded-full border-ui bg-surface px-3 py-0.5 text-base font-semibold',
        className,
      )}
      style={color ? ({ '--chip': color } as CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}
