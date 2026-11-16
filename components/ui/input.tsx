'use client';

import clsx from 'clsx';
import {
  useCallback,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export const fieldClasses = clsx(
  'block w-full min-h-tap rounded-xl border-ui border-line bg-surface px-4 py-2 text-base text-ink shadow-sm',
  'transition-[border-color,box-shadow] hover:border-accent focus-visible:border-accent',
  'placeholder:text-muted aria-[invalid=true]:border-danger disabled:opacity-60',
);

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(fieldClasses, className)} {...rest} />;
}

/** A textarea that grows with its content, so people are never scrolling inside a tiny box. */
export function Textarea({
  className,
  onInput,
  value,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(grow, [grow, value]);
  return (
    <textarea
      ref={ref}
      rows={3}
      value={value}
      className={clsx(fieldClasses, 'resize-none overflow-hidden', className)}
      onInput={(e) => {
        grow();
        onInput?.(e);
      }}
      {...rest}
    />
  );
}
