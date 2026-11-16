'use client';

import * as Toast from '@radix-ui/react-toast';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Button } from './button';

/** Undo notices stay for at least 10 seconds (Rule Zero). */
export const MIN_TOAST_MS = 10_000;

export interface ToastInput {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ show: (toast: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((toast: ToastInput) => {
    setItems((prev) => [...prev, { ...toast, id: Date.now() + Math.random() }]);
  }, []);
  const remove = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {/* Radix announces each notice through its own polite role="status" live region, and pauses the timer while the notice is hovered or focused, so it never vanishes under a finger. */}
      <Toast.Provider duration={MIN_TOAST_MS} label={t('notifications')}>
        {children}
        {items.map((item) => (
          <Toast.Root
            key={item.id}
            type="background"
            duration={Math.max(item.durationMs ?? MIN_TOAST_MS, MIN_TOAST_MS)}
            onOpenChange={(open) => !open && remove(item.id)}
            className="fade-in flex flex-wrap items-center gap-3 rounded-2xl border-ui border-line bg-surface p-4 shadow-lg"
          >
            <Toast.Description className="flex-1 text-base font-semibold">
              {item.message}
            </Toast.Description>
            {item.actionLabel && (
              <Toast.Action altText={item.actionLabel} asChild>
                <Button variant="primary" onClick={item.onAction}>
                  {item.actionLabel}
                </Button>
              </Toast.Action>
            )}
            <Toast.Close asChild>
              <Button>{t('close')}</Button>
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-24 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 flex-col gap-2 outline-none md:bottom-6" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
