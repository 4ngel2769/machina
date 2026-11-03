'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/app/ui/toast';

type Req = { id: string; name: string; planId: string; status: string; createdAt: number; reviewNote: string | null };
type DelReq = { id: string; status: string; requestedAt: number };

export default function AccountPage() {
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
    const r = await fetch('/api/requests', { cache: 'no-store' });
    if (r.ok) setReqs(await r.json());
    const d = await fetch('/api/deletion', { cache: 'no-store' });
    if (d.ok) setDelReqs(await d.json());
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

  const pendingDel = delReqs.find((d) => d.status === 'pending');

  return (
    <>
      <h1>account</h1>
      <div className="sub">profile, credentials, data</div>

      <div className="card">
        <h3>profile</h3>
        <div className="row" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 500 }}>{name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{role} · balance ${(balance ?? 0) / 100}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/keys" className="primary" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>ssh keys</Link>
          <Link href="/billing" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>billing</Link>
          <button onClick={exportData} style={{ padding: '6px 12px', fontSize: 13 }}>export my data</button>
        </div>
      </div>

      <div className="card">
        <h3>change password</h3>
        <form onSubmit={changePw}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="cp">current password</label>
              <input id="cp" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor="np">new password (8-72)</label>
              <input id="np" type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
            </div>
            <button type="submit" disabled={pwBusy || !cur || nw.length < 8}>update</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>my instance requests</h3>
        {reqs.length === 0 && <div className="muted">none</div>}
        {reqs.map((r) => (
          <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span className="mono">{r.name}</span> · {r.planId} · <span className="muted">{r.status}</span>
            {r.reviewNote && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.reviewNote}</div>}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>data deletion (GDPR)</h3>
        <div className="sub" style={{ margin: '-6px 0 12px' }}>request permanent deletion of your account and all associated data. requires admin approval.</div>
        {pendingDel ? (
          <div className="muted">a deletion request is pending (submitted {new Date(pendingDel.requestedAt).toLocaleString()})</div>
        ) : (
          <button onClick={requestDeletion} disabled={delBusy} style={{ color: 'var(--danger, #f87171)' }}>
            {delBusy ? 'submitting…' : 'request account deletion'}
          </button>
        )}
      </div>
    </>
  );
}
