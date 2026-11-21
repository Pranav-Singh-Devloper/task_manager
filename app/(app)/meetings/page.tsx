import { Suspense } from 'react';
import { DashboardScreen } from '@/components/dashboard/dashboard-screen';

export default function MeetingsPage() {
  // The screen reads the address bar for its search and filters, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <DashboardScreen />
    </Suspense>
  );
}
