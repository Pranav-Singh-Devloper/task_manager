import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'outline' | 'danger';
export type ButtonSize = 'md' | 'lg';

/** One primary button per screen (filled). Everything else is outlined. */
export function buttonClasses(
  variant: ButtonVariant = 'outline',
  size: ButtonSize = 'md',
  className?: string,
) {
  return clsx(
    'lift inline-flex min-h-tap min-w-tap items-center justify-center gap-2 rounded-xl border-ui px-5 py-2',
    'text-center font-semibold disabled:cursor-not-allowed disabled:opacity-60',
    size === 'lg' ? 'min-h-14 px-6 text-lg' : 'text-base',
    variant === 'primary' &&
      'btn-primary border-accent bg-accent text-accent-ink hover:border-accent-hover hover:bg-accent-hover',
    variant === 'outline' && 'border-line bg-surface text-ink shadow-sm hover:bg-sunken',
    variant === 'danger' && 'border-danger bg-surface text-danger shadow-sm hover:bg-sunken',
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}
