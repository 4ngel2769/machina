/** POST plumbing for the single-VM page: host actions and ISO upload. */

'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { IsoList, Op } from './types';

/** Wraps a POST to /api/host/vm with the domain name already folded in. */
export function useVmOp(name: string, reload: () => void): { busy: string; op: Op } {
  const toast = useToast();
  const [busy, setBusy] = useState('');

  const op = useCallback(async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const r = await fetch('/api/host/vm', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, ...body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.err(j.error ?? `${label} failed`);
        return false;
      }
      toast.ok(j.result ? `${label}: ${j.result}` : `${label} done`);
      reload();
      return true;
    } catch {
      toast.err(`${label}: could not reach the server`);
      return false;
    } finally { setBusy(''); }
  }, [name, toast, reload]);

  return { busy, op };
}

/** Raw body, filename in the query: the server caps while streaming. */
export function useIsoUpload(onDone: () => void, onIsoList: () => void): {
  busy: string; uploadIso: (file: File) => Promise<void>;
} {
  const toast = useToast();
  const [busy, setBusy] = useState('');

  const uploadIso = useCallback(async (file: File) => {
    setBusy('upload iso');
    try {
      const r = await fetch(`/api/isos?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.err(j.error ?? 'upload failed');
        return;
      }
      toast.ok(`uploaded ${j.iso?.name ?? file.name}`);
      onIsoList();
      onDone();
    } catch {
      toast.err('upload failed: could not reach the server');
    } finally { setBusy(''); }
  }, [toast, onDone, onIsoList]);

  return { busy, uploadIso };
}

/** ISO list with the empty shape applied while the first poll is in flight. */
export function isosOf(list: IsoList | null): IsoList['isos'] {
  return list ? list.isos : [];
}

export function maxIsoGb(list: IsoList | null): number {
  return list ? list.maxIsoGb : 16;
}
