import { EditMeetingScreen } from '@/components/meeting/edit-meeting-screen';

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditMeetingScreen id={id} />;
}
