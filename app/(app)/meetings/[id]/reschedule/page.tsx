import { RescheduleScreen } from '@/components/meeting/reschedule-screen';

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { id } = await params;
  const { return: returnTo } = await searchParams;
  return <RescheduleScreen id={id} returnTo={returnTo} />;
}
