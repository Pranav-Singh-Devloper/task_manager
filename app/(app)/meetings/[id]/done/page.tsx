import { DoneScreen } from '@/components/meeting/done-screen';

export default async function DonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { id } = await params;
  const { next } = await searchParams;
  return <DoneScreen id={id} scheduleNext={next === '1'} />;
}
