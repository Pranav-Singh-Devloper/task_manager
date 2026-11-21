import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False on the server and while the page is first being attached in the browser, true from then on. Data that may
 * already be in the browser's cache (but was not on the server) waits for this, so the first browser render matches
 * the server's HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
