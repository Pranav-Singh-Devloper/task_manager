import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-2xl border-ui border-soft bg-surface p-5 shadow-sm md:p-6',
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ children, as: Tag = 'h2' }: { children: ReactNode; as?: 'h2' | 'h3' }) {
  return <Tag className="mb-3 font-display text-2xl font-semibold">{children}</Tag>;
}
