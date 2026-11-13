/**
 * Client-side session guard: any API 401 redirects to sign-in carrying the current path.
 */
'use client';

import { useEffect } from 'react';

/**
 * Session-expiry guard. The JWT lapses after its maxAge; server components
 * bounce to /signin with a callbackUrl, but client-side fetches (polling,
 * actions, the ws-token mint) would otherwise fail silently with 401s and
 * leave the UI half-dead. One wrapper: any API 401 on a non-auth route
 * redirects to sign-in carrying the current path, once per page load.
 */
export function SessionGuard() {
  useEffect(() => {
    const original = window.fetch;
    let redirecting = false;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      if (res.status === 401 && !redirecting) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
        const path = url.startsWith('/') ? url : '';
        if (path && !path.startsWith('/api/auth') && !path.startsWith('/signin')) {
          redirecting = true;
          const dest = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/signin?callbackUrl=${dest}`;
        }
      }
      return res;
    };
    return () => { window.fetch = original; };
  }, []);
  return null;
}
