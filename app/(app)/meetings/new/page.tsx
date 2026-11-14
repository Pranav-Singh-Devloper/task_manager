import { NewMeetingScreen } from '@/components/meeting/new-meeting-screen';

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; keep?: string; from?: string }>;
}) {
  const { category, keep, from } = await searchParams;
  return <NewMeetingScreen category={category} keep={keep === '1'} changing={Boolean(from)} />;
}
