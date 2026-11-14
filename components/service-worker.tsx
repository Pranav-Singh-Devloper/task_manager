'use client';

import { useEffect } from 'react';

/** Registers the app-shell service worker in the real app only. In development it would serve stale files. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
