'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { useMeeting, useMeta } from '@/lib/queries';
import { MeetingForm } from './meeting-form';

/** /meetings/[id]/edit: the same form, filled in. */
export function EditMeetingScreen({ id }: { id: string }) {
  const t = useTranslations('detail');
  const common = useTranslations('common');
  const meta = useMeta();
  const detail = useMeeting(id);

  if (meta.isPending || detail.isPending) return <p>{t('loading')}</p>;
  if (detail.isError) return <p className="font-semibold">{t('notFound')}</p>;
  if (meta.isError || !meta.data || !detail.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-semibold">{meta.error?.message}</p>
        <Button variant="primary" onClick={() => void meta.refetch()}>
          {common('tryAgain')}
        </Button>
      </div>
    );
  }
  const { meeting } = detail.data;
  return (
    <MeetingForm
      key={meeting.id}
      mode="edit"
      meta={meta.data}
      categorySlug={meeting.category_slug}
      meeting={meeting}
    />
  );
}
