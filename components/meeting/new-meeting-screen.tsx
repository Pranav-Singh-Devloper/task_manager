'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui';
import { useMeta } from '@/lib/queries';
import { CategoryPicker } from './category-picker';
import { MeetingForm } from './meeting-form';

function readCarry(): Record<string, unknown> | undefined {
  try {
    const raw = sessionStorage.getItem('mm.carry');
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** /meetings/new: choose a category, then fill in its form. */
export function NewMeetingScreen({
  category,
  keep,
  changing,
}: {
  category?: string;
  keep?: boolean;
  /** Came from "Change category": the tiles pass the answers on. */
  changing?: boolean;
}) {
  const t = useTranslations('newMeeting');
  const common = useTranslations('common');
  const meta = useMeta();
  // This screen stays mounted while the address changes from the tiles to a form; `keep` flips then, so the answers are read again.
  const carried = useMemo(() => (keep ? readCarry() : undefined), [keep]);
  // Answers carried for a change of category are only good for that one change.
  useEffect(() => {
    if (!changing && !keep) {
      try {
        sessionStorage.removeItem('mm.carry');
      } catch {
        // ignore
      }
    }
  }, [changing, keep]);

  if (meta.isPending) return <p>{t('loading')}</p>;
  if (meta.isError || !meta.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-semibold">{meta.error?.message}</p>
        <Button variant="primary" onClick={() => void meta.refetch()}>
          {common('tryAgain')}
        </Button>
      </div>
    );
  }
  if (!category) return <CategoryPicker meta={meta.data} keep={changing} />;

  const found = meta.data.categories.find((c) => c.slug === category && c.active);
  if (!found) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="font-semibold">
          {t('categoryMissing')}
        </p>
        <CategoryPicker meta={meta.data} />
      </div>
    );
  }
  return (
    <MeetingForm
      key={category}
      mode="create"
      meta={meta.data}
      categorySlug={category}
      carried={carried}
    />
  );
}
