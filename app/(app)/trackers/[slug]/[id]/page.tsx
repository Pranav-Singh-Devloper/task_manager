import { TrackerFormScreen } from '@/components/trackers/tracker-form';

export default async function TrackerRowPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  return <TrackerFormScreen slug={slug} id={id} />;
}
