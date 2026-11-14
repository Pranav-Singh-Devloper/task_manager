'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Meeting } from '@/shared/meeting';
import type { CategoryDef, FieldDef, Settings, WorkspaceDef } from '@/shared/types';
import { api } from './api';

export interface Meta {
  categories: CategoryDef[];
  fields: FieldDef[];
  workspaces: WorkspaceDef[];
  settings: Settings;
  problems: string[];
  attention: { tab: string; row: number; message: string }[];
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

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta') });

export const useMeeting = (id: string) =>
  useQuery({ queryKey: ['meeting', id], queryFn: () => api<MeetingDetail>(`/meetings/${id}`) });

export const useHistory = (id: string) =>
  useQuery({ queryKey: ['history', id], queryFn: () => api<History>(`/meetings/${id}/history`) });
