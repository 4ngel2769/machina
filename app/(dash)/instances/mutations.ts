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
    const response = await fetch('/api/instances', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, planId, imageId }),
    });
    const body = await response.json().catch(() => ({}));
    loadEnd(); setBusy(false);
    if (response.ok) { toast.ok(`provisioning ${body.name} — boots in ~60s`); void load(); return null; }
    const err = body.error ?? 'create failed';
    toast.err(err);
    return err;
  }

  async function requestInstance(name: string, planId: string, imageId: string, note: string): Promise<boolean> {
    setBusy(true); loadStart();
    const response = await fetch('/api/requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, planId, imageId, note }),
    });
    const body = await response.json().catch(() => ({}));
    const succeeded = response.ok;
    if (succeeded) toast.ok('request submitted — admin will review');
    else toast.err(body.error ?? 'request failed');
    loadEnd(); setBusy(false);
    return succeeded;
  }

  async function act(id: string, action: string) {
    setBusy(true); loadStart();
    const response = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) toast.ok(`${action}: ${body.status ?? 'ok'}`);
    else toast.err(body.error ?? `${action} failed`);
    loadEnd(); setBusy(false); void load();
  }

  return { busy, create, requestInstance, act };
}
