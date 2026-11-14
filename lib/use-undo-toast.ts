'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useToast } from '@/components/ui';
import { ApiError, api } from './api';

/**
 * Shows a notice that stays for at least 10 seconds, with an Undo button when the change can be undone (§3).
 * Undo asks the server to apply the reverse change, then refreshes whatever is on screen.
 */
export function useUndoToast() {
  const toast = useToast();
  const client = useQueryClient();
  const t = useTranslations('detail');
  const common = useTranslations('common');

  return useCallback(
    (message: string, token: string | null | undefined, after?: () => void) => {
      toast.show({
        message,
        ...(token
          ? {
              actionLabel: common('undo'),
              onAction: async () => {
                try {
                  await api(`/undo/${token}`, { method: 'POST' });
                  await client.invalidateQueries();
                  toast.show({ message: t('undone') });
                  after?.();
                } catch (e) {
                  toast.show({ message: e instanceof ApiError ? e.message : t('actionFailed') });
                }
              },
            }
          : {}),
      });
    },
    [toast, client, t, common],
  );
}
