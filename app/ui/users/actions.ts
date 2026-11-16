/** All fetches for the account console: admin ops plus quota suspension. */

'use client';

import { useState } from 'react';
import { useToast } from '../toast';

export function useUserAdmin(onChanged: () => void): {
  open: string | null;
  busy: boolean;
  msg: string;
  pw: string;
  setPw: (value: string) => void;
  topup: string;
  setTopup: (value: string) => void;
  topupFor: string | null;
  closeTopup: () => void;
  send: (body: Record<string, unknown>, label: string) => Promise<boolean>;
  startEdit: (id: string) => void;
  startTopup: (id: string) => void;
  suspend: (id: string, next: boolean) => Promise<void>;
} {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState('');
  const [topup, setTopup] = useState('10');
  // Which row the credit input belongs to: only the row a "fund" click opened
  // shows it, so the table stays a table instead of every row growing a form.
  const [topupFor, setTopupFor] = useState<string | null>(null);

  async function send(body: Record<string, unknown>, label: string): Promise<boolean> {
    setBusy(true);
    setMsg('');
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload.error ?? `${label} failed`;
        setMsg(message);
        toast.err(message);
        return false;
      }
      toast.ok(`${label} done`);
      onChanged();
      return true;
    } catch {
      setMsg('could not reach the server');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(id: string) {
    setOpen(open === id ? null : id);
    setPw('');
    setTopup('10');
    setTopupFor(null);
    setMsg('');
  }

  /** One-click funding: opens the manage row AND marks it as the credit target. */
  function startTopup(id: string) {
    setOpen(id);
    setTopupFor(id);
    setTopup('10');
    setPw('');
    setMsg('');
  }

  function closeTopup() {
    setTopupFor(null);
    setOpen(null);
    setMsg('');
  }

  async function suspend(id: string, next: boolean) {
    setBusy(true);
    setMsg('');
    try {
      const response = await fetch(`/api/quotas/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suspended: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMsg(payload.error ?? 'could not change suspension');
        return;
      }
      toast.ok(next ? 'account suspended' : 'account reinstated');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return { open, busy, msg, pw, setPw, topup, setTopup, topupFor, send, startEdit, startTopup, closeTopup, suspend };
}

export type UserAdminState = ReturnType<typeof useUserAdmin>;
