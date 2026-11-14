'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A choice remembered on this device (such as Upcoming or Past, Table or Calendar). The server renders the default and the
 * browser then shows what was chosen, so nothing mismatches. If storage is blocked it simply is not remembered.
 */
export function usePersistentChoice<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        // not remembered
      }
      notify();
    },
    [key],
  );
  return [value, set];
}

/** A JSON value remembered on this device, such as which table columns are shown. */
export function usePersistentJson<T>(key: string, fallback: T): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  let value = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // not remembered
      }
      notify();
    },
    [key],
  );
  return [value, set];
}

/** True on a phone-sized screen. The server says false, so the first paint is the desktop layout until the browser answers. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia('(max-width: 767px)');
      q.addEventListener('change', cb);
      return () => q.removeEventListener('change', cb);
    },
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false,
  );
}
