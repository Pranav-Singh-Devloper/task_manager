import { Chip } from '@/components/ui';
import { CATEGORY_PALETTE } from '@/shared/seed';

/** Status colours come from the accessible palette. The word is always shown too, so colour is never the only signal. */
export const STATUS_COLORS: Record<string, string> = {
  Scheduled: CATEGORY_PALETTE[0],
  Rescheduled: CATEGORY_PALETTE[2],
  Completed: CATEGORY_PALETTE[1],
  Cancelled: CATEGORY_PALETTE[3],
};

export function StatusChip({ status }: { status: string }) {
  return <Chip color={STATUS_COLORS[status] ?? CATEGORY_PALETTE[9]}>{status}</Chip>;
}
