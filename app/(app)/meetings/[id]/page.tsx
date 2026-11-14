import { DetailScreen } from '@/components/meeting/detail-screen';

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen id={id} />;
}
