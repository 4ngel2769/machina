/**
 * Background job watcher: keeps long-running work moving while a page is open.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useToast } from './toast';

/**
 * Watches instance status in the background and toasts on transitions the user
 * would otherwise only notice by reloading the page: a VM falling into error,
 * a request that changed state. Cheap: one poll, only fires on a *change*.
 */
type Row = { id: string; name: string; status: string; activeJob: { type: string } | null };

function announce(rows: Row[], seen: Record<string, string> | null, toast: ReturnType<typeof useToast>) {
  const next: Record<string, string> = {};
  for (const instance of rows) {
    next[instance.id] = instance.status;
    const prev = seen?.[instance.id];
    if (prev && prev !== instance.status) {
      if (instance.status === 'error') toast.err(`${instance.name} failed — open it to see why and retry`);
      else if (instance.status === 'running') toast.ok(`${instance.name} is running`);
      else if (instance.status === 'stopped') toast.info(`${instance.name} stopped`);
    }
  }
  return next;
}

export function BackgroundWatcher() {
  const toast = useToast();
  const seen = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch('/api/instances', { cache: 'no-store' });
        if (!response.ok || !alive) return;
        const rows = (await response.json()) as Row[];
        seen.current = announce(rows, seen.current, toast);
      } catch {
        /* never throw into a render path */
      }
    };
    void poll();
    const timer = setInterval(poll, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [toast]);

  return null;
}
