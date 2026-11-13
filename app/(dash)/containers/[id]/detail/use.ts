/**
 * Data hook for the container detail page: inspect once, stats on a slow
 * poll, plus the lifecycle actions the header exposes.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { ContainerDetail, ContainerStats } from './types';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `request failed (${response.status})`);
  return body as T;
}

/** Poll stats while the tab is visible; docker stats --no-stream is ~300ms
 *  of daemon work, so 4s is plenty for a detail page. */
function useStats(id: string, enabled: boolean) {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [statsErr, setStatsErr] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const body = await getJson<{ stats: ContainerStats }>(`/api/containers/${encodeURIComponent(id)}?tab=stats`);
        if (!cancelled) { setStats(body.stats); setStatsErr(''); }
      } catch (error) {
        if (!cancelled) setStatsErr((error as Error).message);
      }
      if (!cancelled) timer = setTimeout(tick, 4000);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, enabled]);
  return { stats, statsErr };
}

export function useContainerDetail(id: string) {
  const toast = useToast();
  const [detail, setDetail] = useState<ContainerDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<'logs' | 'console' | 'stats' | 'inspect'>('logs');
  const { stats, statsErr } = useStats(id, tab === 'stats');
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const body = await getJson<{ detail: ContainerDetail }>(
        `/api/containers/${encodeURIComponent(id)}?tab=inspect`,
      );
      if (aliveRef.current) { setDetail(body.detail); setErr(''); }
    } catch (error) {
      if (aliveRef.current) setErr((error as Error).message);
    }
  }, [id]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => { aliveRef.current = false; };
  }, [load]);

  const act = useCallback(async (action: string) => {
    setBusy(action);
    try {
      const response = await fetch(`/api/containers/${encodeURIComponent(id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `action failed (${response.status})`);
      toast.ok(`${action} ok`);
      await load();
    } catch (error) {
      toast.err((error as Error).message);
    } finally {
      setBusy('');
    }
  }, [id, load, toast]);

  return { detail, err, busy, act, tab, setTab, stats, statsErr, reload: load };
}
