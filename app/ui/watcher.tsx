'use client';

import { useEffect, useRef } from 'react';
import { useToast } from './toast';

/**
 * Watches instance status in the background and toasts on transitions the user
 * would otherwise only notice by reloading the page: a VM falling into error,
 * a request that changed state. Cheap: one poll, only fires on a *change*.
 */
export function BackgroundWatcher() {
  const toast = useToast();
  const seen = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch('/api/instances', { cache: 'no-store' });
        if (!r.ok || !alive) return;
        const rows = (await r.json()) as { id: string; name: string; status: string; activeJob: { type: string } | null }[];
        const next: Record<string, string> = {};
        for (const i of rows) {
          next[i.id] = i.status;
          const prev = seen.current?.[i.id];
          if (prev && prev !== i.status) {
            if (i.status === 'error') toast.err(`${i.name} failed — open it to see why and retry`);
            else if (i.status === 'running') toast.ok(`${i.name} is running`);
            else if (i.status === 'stopped') toast.info(`${i.name} stopped`);
          }
        }
        seen.current = next;
      } catch {
        /* never throw into a render path */
      }
    };
    void poll();
    const t = setInterval(poll, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [toast]);

  return null;
}
