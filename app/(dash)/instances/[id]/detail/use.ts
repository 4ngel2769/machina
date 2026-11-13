/** Polling and lifecycle actions for the instance detail page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Inst, Job } from './types';

export function useInstance(id: string): {
  instance: Inst | null;
  jobs: Job[];
  msg: string;
  busy: boolean;
  reload: () => Promise<void>;
  act: (action: string) => Promise<void>;
  clone: () => Promise<void>;
  exportDisk: () => Promise<void>;
} {
  const [instance, setInstance] = useState<Inst | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (instanceId: string) => {
    const response = await fetch(`/api/instances/${instanceId}`, { cache: 'no-store' });
    if (response.ok) {
      const instanceBody = await response.json();
      setInstance(instanceBody);
      setJobs(instanceBody.jobs);
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
    const response = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => ({}));
    setMsg(response.ok ? `${action} queued` : body.error ?? 'failed');
    setBusy(false);
    void load(id);
  };

  const clone = async () => {
    const name = window.prompt('name for the clone (3-41 chars: letters, digits, dot, dash, underscore)');
    if (!name) return;
    setBusy(true);
    const response = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'clone', name }),
    });
    const body = await response.json().catch(() => ({}));
    setMsg(response.ok ? (body.note ?? 'clone queued') : body.error ?? 'clone failed');
    setBusy(false);
    void load(id);
  };

  const exportDisk = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/instances/${id}/export`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMsg(body.error ?? 'export failed'); return; }
      const link = document.createElement('a');
      link.href = body.url;
      link.download = body.filename ?? `${id}.qcow2`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMsg('export started — the link expires in 5 minutes');
    } finally {
      setBusy(false);
    }
  };

  return { instance, jobs, msg, busy, reload, act, clone, exportDisk };
}
