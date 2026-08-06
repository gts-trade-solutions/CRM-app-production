'use client';

// Registers the service worker in production builds only — Next dev's
// hot-reload and a SW cache don't mix.

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure is non-fatal — the app works without it.
    });
  }, []);
  return null;
}
