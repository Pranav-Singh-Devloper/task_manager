'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { EMPTY, parseParams, toSearch, type DashboardParams } from '@/lib/dashboard-params';

/**
 * The dashboard's search, filters and sort live in the address bar, so a link, a reload and the browser's back button all keep them.
 * Changing one replaces the address instead of adding a history step for every keystroke.
 */
export function useDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const params = useMemo(() => parseParams(new URLSearchParams(search.toString())), [search]);

  const update = useCallback(
    (patch: Partial<DashboardParams>) => {
      const next = { ...params, ...patch };
      const qs = toSearch(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);
  /** Where this screen is right now, so a page opened from here can come back to it. */
  const here = useMemo(() => {
    const qs = toSearch(params);
    return qs ? `${pathname}?${qs}` : pathname;
  }, [params, pathname]);

  return { params, update, clear, here, empty: EMPTY };
}
