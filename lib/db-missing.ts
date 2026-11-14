'use client';

import { useSyncExternalStore } from 'react';

let missing = false;
const listeners = new Set<() => void>();

/** Called when the server says the database cannot be found. Any screen then shows the recovery page (§11). */
export function reportDatabaseMissing(): void {
  if (missing) return;
  missing = true;
  listeners.forEach((l) => l());
}

export function useDatabaseMissing(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => missing,
    () => false,
  );
}
