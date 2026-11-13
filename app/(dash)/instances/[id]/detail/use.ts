/** Polling and lifecycle actions for the instance detail page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Inst, Job } from './types';

export function useInstance(id: string): {
  inst: Inst | null;
  jobs: Job[];
  msg: string;
  busy: boolean;
  reload: () => Promise<void>;
  act: (action: string) => Promise<void>;
  clone: () => Promise<void>;
  exportDisk: () => Promise<void>;
} {
  const [inst, setInst] = useState<Inst | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (instanceId: string) => {
    const r = await fetch(`/api/instances/${instanceId}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setInst(j);
      setJobs(j.jobs);
    } else {
      setMsg('instance gone');
    }
  }, []);

  const reload = useCallback(() => load(id), [load, id]);

  useEffect(() => {
    void load(id);
    const t = setInterval(() => void load(id), 5000);
    return () => clearInterval(t);
  }, [load, id]);

  const act = async (action: string) => {
    setBusy(true);
    const r = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${action} queued` : j.error ?? 'failed');
    setBusy(false);
    void load(id);
  };

  const clone = async () => {
    const name = window.prompt('name for the clone (3-41 chars: letters, digits, dot, dash, underscore)');
    if (!name) return;
    setBusy(true);
    const r = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'clone', name }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.note ?? 'clone queued') : j.error ?? 'clone failed');
    setBusy(false);
    void load(id);
  };

  const exportDisk = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/instances/${id}/export`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'export failed'); return; }
      const a = document.createElement('a');
      a.href = j.url;
      a.download = j.filename ?? `${id}.qcow2`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMsg('export started — the link expires in 5 minutes');
    } finally {
      setBusy(false);
    }
  };

  return { inst, jobs, msg, busy, reload, act, clone, exportDisk };
}
