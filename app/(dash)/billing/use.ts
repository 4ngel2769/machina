/** Data and the password mutation for the billing page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { useMinVisible } from '@/app/ui/loaders';
import { ignore } from '@/lib/core/ignore';

export type Ledger = {
  id: string; deltaCents: number; reason: string; note: string | null;
  refType: string | null; refId: string | null; createdAt: number;
};
type Running = { id: string; name: string; rateHourlyCents: number };

export function useBilling(): {
  balance: number | null;
  accruedCents: number;
  accruedHours: number;
  ledger: Ledger[];
  nextCursor: string | null;
  ledgerBusy: boolean;
  loaded: boolean;
  cap: { running: number; max: number } | null;
  running: Running[];
  currentPw: string; setCurrentPw: (v: string) => void;
  newPw: string; setNewPw: (v: string) => void;
  pwBusy: boolean;
  changePw: (event: React.FormEvent) => Promise<void>;
  loadOlder: () => Promise<void>;
} {
  const toast = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [accruedCents, setAccruedCents] = useState(0);
  const [accruedHours, setAccruedHours] = useState(0);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [cap, setCap] = useState<{ running: number; max: number } | null>(null);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [running, setRunning] = useState<Running[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ready = useMinVisible(400);
  const settled = loaded && ready;

  const load = useCallback(async () => {
    const billingResponse = await fetch('/api/billing', { cache: 'no-store' });
    if (billingResponse.ok) {
      const billing = await billingResponse.json();
      setBalance(billing.balanceCents);
      setLedger(billing.ledger);
      setNextCursor(billing.nextCursor);
      setAccruedCents(billing.accruedCents ?? 0);
      setAccruedHours(billing.accruedHours ?? 0);
      setCap(billing.capacity);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/instances', { cache: 'no-store' })
      .then((instancesResponse) => (instancesResponse.ok ? instancesResponse.json() : []))
      .then((rows) => setRunning(rows.filter((instance: { status: string }) => instance.status === 'running')))
      .catch(ignore('billing fetch failure leaves the card empty'));
  }, []);

  async function loadOlder() {
    if (!nextCursor || ledgerBusy) return;
    setLedgerBusy(true);
    const response = await fetch(`/api/billing?before=${encodeURIComponent(nextCursor)}`, { cache: 'no-store' });
    if (response.ok) {
      const billing = await response.json();
      setLedger((previous) => [...previous, ...billing.ledger]);
      setNextCursor(billing.nextCursor);
    }
    setLedgerBusy(false);
  }

  async function changePw(event: React.FormEvent) {
    event.preventDefault();
    setPwBusy(true);
    const response = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: currentPw, next: newPw }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { toast.ok('password changed — persists across restarts'); setCurrentPw(''); setNewPw(''); }
    else toast.err(body.error ?? 'change failed');
    setPwBusy(false);
  }

  return {
    balance, accruedCents, accruedHours, ledger, nextCursor, ledgerBusy, loaded: settled,
    cap, running, currentPw, setCurrentPw, newPw, setNewPw, pwBusy, changePw, loadOlder,
  };
}

export type BillingState = ReturnType<typeof useBilling>;
