import { Suspense } from 'react';
import { TrackerScreen } from '@/components/trackers/tracker-screen';

export default async function TrackerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // The screen reads its filters from the address bar, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <TrackerScreen slug={slug} />
    </Suspense>
  );
}
