/** Data and the password mutation for the billing page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';

export type Ledger = {
  id: string; deltaCents: number; reason: string; note: string | null;
  refType: string | null; refId: string | null; createdAt: number;
};
type Running = { id: string; name: string; rateHourlyCents: number };

export function useBilling(): {
  balance: number | null;
  ledger: Ledger[];
  cap: { running: number; max: number } | null;
  running: Running[];
  cur: string; setCur: (v: string) => void;
  nw: string; setNw: (v: string) => void;
  pwBusy: boolean;
  changePw: (e: React.FormEvent) => Promise<void>;
} {
  const toast = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [cap, setCap] = useState<{ running: number; max: number } | null>(null);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [running, setRunning] = useState<Running[]>([]);

  const load = useCallback(async () => {
    const r = await fetch('/api/billing', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setBalance(j.balanceCents);
      setLedger(j.ledger);
      setCap(j.capacity);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/instances', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setRunning(rows.filter((i: { status: string }) => i.status === 'running')))
      .catch(() => {});
  }, []);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    const r = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: cur, next: nw }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { toast.ok('password changed — persists across restarts'); setCur(''); setNw(''); }
    else toast.err(j.error ?? 'change failed');
    setPwBusy(false);
  }

  return { balance, ledger, cap, running, cur, setCur, nw, setNw, pwBusy, changePw };
}

export type BillingState = ReturnType<typeof useBilling>;
