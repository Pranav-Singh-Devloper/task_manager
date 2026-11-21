import { TrackerFormScreen } from '@/components/trackers/tracker-form';

export default async function NewTrackerRowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TrackerFormScreen slug={slug} />;
}
