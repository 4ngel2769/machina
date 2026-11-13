/** Data and mutations for the account page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { useMinVisible } from '@/app/ui/loaders';
import type { DelReq, Req } from './types';

/** Requests + deletion requests, fetched together. */
async function loadLists(
  setReqs: (v: Req[]) => void,
  setDelReqs: (v: DelReq[]) => void,
) {
  const [requestsResponse, deletionResponse] = await Promise.all([
    fetch('/api/requests', { cache: 'no-store' }),
    fetch('/api/deletion', { cache: 'no-store' }),
  ]);
  if (requestsResponse.ok) setReqs(await requestsResponse.json());
  if (deletionResponse.ok) setDelReqs(await deletionResponse.json());
}

export function useAccount(): {
  name: string; role: string; balance: number | null;
  reqs: Req[]; delReqs: DelReq[]; loaded: boolean;
  currentPw: string; setCurrentPw: (v: string) => void;
  newPw: string; setNewPw: (v: string) => void;
  pwBusy: boolean;
  delBusy: boolean;
  changePw: (event: React.FormEvent) => Promise<void>;
  requestDeletion: () => Promise<void>;
  exportData: () => Promise<void>;
  load: () => Promise<void>;
} {
  const toast = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [delReqs, setDelReqs] = useState<DelReq[]>([]);
  const [delBusy, setDelBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ready = useMinVisible(400);

  const load = useCallback(async () => {
    const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
    if (sessionResponse.ok) {
      const session = await sessionResponse.json();
      setName(session?.user?.name ?? '');
      setRole(session?.user?.role ?? '');
    }
    const billingResponse = await fetch('/api/billing', { cache: 'no-store' });
    if (billingResponse.ok) { const billing = await billingResponse.json(); setBalance(billing.balanceCents); }
    await loadLists(setReqs, setDelReqs);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function changePw(event: React.FormEvent) {
    event.preventDefault();
    setPwBusy(true);
    const response = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: currentPw, next: newPw }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { toast.ok('password changed'); setCurrentPw(''); setNewPw(''); }
    else toast.err(body.error ?? 'change failed');
    setPwBusy(false);
  }

  async function requestDeletion() {
    if (!confirm('Request permanent deletion of your account and all data? An admin must approve.')) return;
    setDelBusy(true);
    const response = await fetch('/api/deletion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { toast.ok('deletion request submitted'); void load(); }
    else toast.err(body.error ?? 'request failed');
    setDelBusy(false);
  }

  async function exportData() {
    const response = await fetch('/api/account/export', { cache: 'no-store' });
    if (!response.ok) { toast.err('export failed'); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `machina-export-${name}.json`;
    link.click(); URL.revokeObjectURL(url);
    toast.ok('data exported');
  }

  return {
    name, role, balance, reqs, delReqs, loaded: loaded && ready,
    currentPw, setCurrentPw, newPw, setNewPw, pwBusy, delBusy,
    changePw, requestDeletion, exportData, load,
  };
}

export type AccountState = ReturnType<typeof useAccount>;
