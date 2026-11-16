'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  /** The button that backs out. Defaults to Cancel; use a clearer word when the action itself is a cancel. */
  cancelLabel?: string;
}

/** For short confirmations only. Forms are always full pages, never popups. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
  cancelLabel,
}: ConfirmDialogProps) {
  const t = useTranslations('common');
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in fixed inset-0 z-40 bg-[#2a1f16]/45 backdrop-blur-sm" />
        <Dialog.Content className="pop-in fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border-ui border-soft bg-surface p-6 shadow-lg">
          <Dialog.Title className="mb-2 font-display text-2xl font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mb-6 text-base">{description}</Dialog.Description>
          <div className="flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button>{cancelLabel ?? t('cancel')}</Button>
            </Dialog.Close>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
