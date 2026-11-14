'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

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
 * Keeps a half-filled form in this browser, so a lost connection, a closed tab or a dead battery never costs typing (§7.4).
 * If a draft is already there when the form opens, it is offered (Restore / Discard) and nothing is overwritten until the
 * person decides.
 */
export function useDraft<T>(key: string) {
  // Read through useSyncExternalStore: the server renders "no draft", and the browser then shows the real one.
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const [decided, setDecided] = useState(false);

  let draft: T | null = null;
  if (raw) {
    try {
      draft = JSON.parse(raw) as T;
    } catch {
      draft = null;
    }
  }

  const save = useCallback(
    (value: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        notify();
      } catch {
        // Storage can be full or blocked. The form still works; it just cannot keep a draft.
      }
    },
    [key],
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
      notify();
    } catch {
      // ignore
    }
  }, [key]);

  return {
    /** A saved draft that has not been dealt with yet. */
    pending: draft && !decided ? draft : null,
    /** Autosave only runs once any old draft has been restored or discarded. */
    canSave: !draft || decided,
    decide: () => setDecided(true),
    save,
    clear,
  };
}
