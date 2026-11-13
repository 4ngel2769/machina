/** POST plumbing shared by every host console tab. */

'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { NetPost, Post, VmPost } from './types';

/** Sends a host action, toasts the outcome, refreshes the poll on success. */
export function useHostActions(reload: () => void): {
  busy: string; post: Post; vmPost: VmPost; netPost: NetPost;
} {
  const toast = useToast();
  const [busy, setBusy] = useState('');

  const post = useCallback(async (url: string, body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.err(payload.error ?? `${label} failed`);
        return false;
      }
      toast.ok(payload.result ? `${label}: ${payload.result}` : `${label} done`);
      reload();
      return true;
    } catch {
      toast.err(`${label}: could not reach the server`);
      return false;
    } finally {
      setBusy('');
    }
  }, [toast, reload]);

  const vmPost = useCallback(
    (name: string, body: Record<string, unknown>, label: string) =>
      post('/api/host/vm', { name, ...body }, label),
    [post],
  );
  const netPost = useCallback(
    (body: Record<string, unknown>, label: string) => post('/api/host/net', body, label),
    [post],
  );

  return { busy, post, vmPost, netPost };
}
