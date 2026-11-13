/** Data and mutations for the account page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { DelReq, Req } from './types';

/** Requests + deletion requests, fetched together. */
async function loadLists(
  setReqs: (v: Req[]) => void,
  setDelReqs: (v: DelReq[]) => void,
) {
  const [r, d] = await Promise.all([
    fetch('/api/requests', { cache: 'no-store' }),
    fetch('/api/deletion', { cache: 'no-store' }),
  ]);
  if (r.ok) setReqs(await r.json());
  if (d.ok) setDelReqs(await d.json());
}

export function useAccount(): {
  name: string; role: string; balance: number | null;
  reqs: Req[]; delReqs: DelReq[];
  cur: string; setCur: (v: string) => void;
  nw: string; setNw: (v: string) => void;
  pwBusy: boolean;
  delBusy: boolean;
  changePw: (e: React.FormEvent) => Promise<void>;
  requestDeletion: () => Promise<void>;
  exportData: () => Promise<void>;
  load: () => Promise<void>;
} {
  const toast = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [delReqs, setDelReqs] = useState<DelReq[]>([]);
  const [delBusy, setDelBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await fetch('/api/auth/session', { cache: 'no-store' });
    if (s.ok) {
      const j = await s.json();
      setName(j?.user?.name ?? '');
      setRole(j?.user?.role ?? '');
    }
    const b = await fetch('/api/billing', { cache: 'no-store' });
    if (b.ok) { const j = await b.json(); setBalance(j.balanceCents); }
    await loadLists(setReqs, setDelReqs);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    const r = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: cur, next: nw }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { toast.ok('password changed'); setCur(''); setNw(''); }
    else toast.err(j.error ?? 'change failed');
    setPwBusy(false);
  }

  async function requestDeletion() {
    if (!confirm('Request permanent deletion of your account and all data? An admin must approve.')) return;
    setDelBusy(true);
    const r = await fetch('/api/deletion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { toast.ok('deletion request submitted'); void load(); }
    else toast.err(j.error ?? 'request failed');
    setDelBusy(false);
  }

  async function exportData() {
    const r = await fetch('/api/account/export', { cache: 'no-store' });
    if (!r.ok) { toast.err('export failed'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `machina-export-${name}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast.ok('data exported');
  }

  return {
    name, role, balance, reqs, delReqs,
    cur, setCur, nw, setNw, pwBusy, delBusy,
    changePw, requestDeletion, exportData, load,
  };
}

export type AccountState = ReturnType<typeof useAccount>;
