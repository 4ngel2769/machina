'use client';

import { useCallback, useEffect, useState } from 'react';
import { relTime } from '@/app/ui/time';
import { useToast } from '@/app/ui/toast';

type Ledger = {
  id: string; deltaCents: number; reason: string; note: string | null;
  refType: string | null; refId: string | null; createdAt: number;
};

export default function BillingPage() {
  const toast = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [cap, setCap] = useState<{ running: number; max: number } | null>(null);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nwpwBus, setPwBus] = useState(false);
  const [running, setRunning] = useState<{ id: string; name: string; rateHourlyCents: number }[]>([]);
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
    setPwBus(true);
    const r = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current: cur, next: nw }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { toast.ok('password changed — persists across restarts'); setCur(''); setNw(''); }
    else toast.err(j.error ?? 'change failed');
    setPwBus(false);
  }

  return (
    <>
      <h1>billing</h1>
      <div className="sub">internal credits; admin tops up; hourly settle from your balance</div>
      <div className="card">
        <div className="grid3" style={{ alignItems: 'center' }}>
          <div>
            <div className="muted">balance</div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 600 }}>
              {balance === null ? '…' : `$${(balance / 100).toFixed(2)}`}
            </div>
            {balance !== null && balance < 100
              ? <span className="badge suspended" title="auto-suspends when it hits zero">low balance</span>
              : null}
          </div>
          <div>
            <div className="muted">host capacity</div>
            <div>{cap ? <span className="mono">{cap.running}/{cap.max}</span> : '…'} <span className="copy">running</span></div>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>forecast</h3>
        {(() => {
          const burn = running.reduce((a, i) => a + (i.rateHourlyCents ?? 0), 0);
          const bal = balance ?? 0;
          const days = burn > 0 ? Math.floor(bal / burn / 24) : null;
          return (
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>hourly burn</div>
                <div className="mono" style={{ fontSize: 20, marginTop: 4 }}>${(burn / 100).toFixed(2)}<span className="muted" style={{ fontSize: 12 }}>/h</span></div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>monthly at this rate</div>
                <div className="mono" style={{ fontSize: 20, marginTop: 4 }}>${((burn * 24 * 30) / 100).toFixed(2)}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>balance lasts</div>
                <div className="mono" style={{ fontSize: 20, marginTop: 4, color: days !== null && days < 3 ? 'var(--warn)' : undefined }}>
                  {running.length === 0 ? '—' : days !== null ? (days > 365 ? '>1y' : `${days}d`) : '<1d'}
                </div>
              </div>
            </div>
          );
        })()}
        <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
          based on your {running.length} running VM{running.length === 1 ? '' : 's'} right now. VMs suspend automatically at zero.
        </div>
      </div>
      <div className="card">
        <h3>change password</h3>
        <div className="sub" style={{ margin: '-6px 0 12px' }}>persists across restarts; the seed never rewrites it unless ADMIN_FORCE_RESET=1</div>
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
            <button type="submit" disabled={nwpwBus || !cur || nw.length < 8}>update</button>
          </div>
        </form>
      </div>
      <div className="card">
        <h3>ledger (last 50)</h3>
        <table>
          <thead><tr><th>when</th><th>reason</th><th>delta</th><th>note</th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td title={new Date(l.createdAt).toLocaleString()}>{relTime(l.createdAt)}</td>
                <td>{l.reason}</td>
                <td className="mono" style={{ color: l.deltaCents >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  {l.deltaCents >= 0 ? '+' : ''}{(l.deltaCents / 100).toFixed(2)}
                </td>
                <td className="copy">{l.note ?? '—'}</td>
              </tr>
            ))}
            {ledger.length === 0 && <tr><td colSpan={4} className="empty">no movements yet</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
