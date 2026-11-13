/** Mutations for the instances list page: create, request, act. */

'use client';

import { useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { loadStart, loadEnd } from '@/app/ui/loadbar';

export function useInstanceMutations(load: () => Promise<void>): {
  busy: boolean;
  create: (name: string, planId: string, imageId: string) => Promise<string | null>;
  requestInstance: (name: string, planId: string, imageId: string, note: string) => Promise<boolean>;
  act: (id: string, action: string) => Promise<void>;
} {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function create(name: string, planId: string, imageId: string): Promise<string | null> {
    setBusy(true); loadStart();
    const r = await fetch('/api/instances', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, planId, imageId }),
    });
    const j = await r.json().catch(() => ({}));
    loadEnd(); setBusy(false);
    if (r.ok) { toast.ok(`provisioning ${j.name} — boots in ~60s`); void load(); return null; }
    const err = j.error ?? 'create failed';
    toast.err(err);
    return err;
  }

  async function requestInstance(name: string, planId: string, imageId: string, note: string): Promise<boolean> {
    setBusy(true); loadStart();
    const r = await fetch('/api/requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, planId, imageId, note }),
    });
    const j = await r.json().catch(() => ({}));
    const ok = r.ok;
    if (ok) toast.ok('request submitted — admin will review');
    else toast.err(j.error ?? 'request failed');
    loadEnd(); setBusy(false);
    return ok;
  }

  async function act(id: string, action: string) {
    setBusy(true); loadStart();
    const r = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast.ok(`${action}: ${j.status ?? 'ok'}`);
    else toast.err(j.error ?? `${action} failed`);
    loadEnd(); setBusy(false); void load();
  }

  return { busy, create, requestInstance, act };
}
