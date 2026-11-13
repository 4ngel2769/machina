/** Data and mutations for the snapshot panel. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConfirmState, DiskInfo, Snap } from './types';

export function useSnapshots(instanceId: string): {
  snaps: Snap[];
  loaded: boolean;
  disk: DiskInfo | null;
  planDiskGb: number;
  name: string;
  setName: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  busy: string;
  msg: string;
  confirm: ConfirmState | null;
  setConfirm: (v: ConfirmState | null) => void;
  post: (body: Record<string, unknown>) => Promise<void>;
} {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [planDiskGb, setPlanDiskGb] = useState(0);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/instances/${instanceId}/snapshots`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setSnaps(j.snapshots ?? []);
      setDisk(j.disk ?? null);
      setPlanDiskGb(j.planDiskGb ?? 0);
      setLoaded(true);
    } catch {
      /* transient; the interval will retry */
    }
  }, [instanceId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(String(body.name));
    setMsg('');
    try {
      const r = await fetch(`/api/instances/${instanceId}/snapshots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error ?? 'that did not work');
        // A refusal here is almost always quota, so say what to do about it.
        if (/limit|free space|grown/i.test(j.error ?? '')) setMsg(`${j.error}. Delete a snapshot, or ask an admin to resize the disk.`);
      } else {
        setName('');
        setDesc('');
        setConfirm(null);
      }
    } catch {
      setMsg('could not reach the server');
    } finally {
      setBusy('');
      // let the worker get a moment before asking again
      setTimeout(() => void load(), 1500);
    }
  };

  return {
    snaps, loaded, disk, planDiskGb,
    name, setName, desc, setDesc,
    busy, msg, confirm, setConfirm, post,
  };
}

export type SnapshotsState = ReturnType<typeof useSnapshots>;
