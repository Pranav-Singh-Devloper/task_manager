'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Meeting } from '@/shared/meeting';
import type { TrackerKpis, TrackerRow } from '@/shared/trackerKpis';
import type { CategoryDef, FieldDef, Settings, TrackerDef, WorkspaceDef } from '@/shared/types';
import { api } from './api';
import { useHydrated } from './use-hydrated';

export interface Meta {
  categories: CategoryDef[];
  fields: FieldDef[];
  workspaces: WorkspaceDef[];
  settings: Settings;
  problems: string[];
  attention: { tab: string; row: number; message: string }[];
  trackers: TrackerDef[];
  trackerFields: FieldDef[];
}

export interface TrackerData {
  tracker: TrackerDef;
  fields: FieldDef[];
  rows: TrackerRow[];
}

export interface TrackerSummary {
  tracker: TrackerDef;
  kpis: TrackerKpis;
}

export interface MeetingSummary {
  id: string;
  title: string;
  date: string | null;
  start_time: string | null;
  status: string | null;
}

export interface MeetingDetail {
  meeting: Meeting;
  previous: MeetingSummary | null;
  next: MeetingSummary | null;
}

export interface History {
  audit: Record<string, string | number | boolean | null>[];
  reschedules: Record<string, string | number | boolean | null>[];
}

/** Data is reused for 30 seconds (the same as the server cache), so moving between screens is quick. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * The config every screen needs. The sidebar asks for it as soon as the page starts, so it can arrive before a part of
 * the page wrapped in Suspense has been attached; that part would then draw something different from the server's
 * HTML. Until the page is attached, the answer is reported as still loading, exactly as the server drew it.
 */
export function useMeta() {
  const hydrated = useHydrated();
  const query = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta') });
  if (hydrated) return query;
  return {
    ...query,
    data: undefined,
    isPending: true,
    isError: false,
    isSuccess: false,
  } as typeof query;
}

export const useMeeting = (id: string) =>
  useQuery({ queryKey: ['meeting', id], queryFn: () => api<MeetingDetail>(`/meetings/${id}`) });

export const useHistory = (id: string) =>
  useQuery({ queryKey: ['history', id], queryFn: () => api<History>(`/meetings/${id}/history`) });

export const useTrackerRows = (slug: string, deleted = false) =>
  useQuery({
    queryKey: ['tracker', slug, deleted ? 'deleted' : 'rows'],
    queryFn: () => api<TrackerData>(`/trackers/${slug}/rows${deleted ? '?deleted=1' : ''}`),
  });

export const useTrackerSummaries = () =>
  useQuery({
    queryKey: ['tracker', 'summary'],
    queryFn: () => api<{ trackers: TrackerSummary[] }>('/trackers/summary'),
  });
