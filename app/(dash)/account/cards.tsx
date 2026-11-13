/** The four cards of the account page. */

'use client';

import Link from 'next/link';
import type { AccountState } from './use';

export function ProfileCard({ a }: { a: AccountState }) {
  return (
    <div className="card">
      <h3>profile</h3>
      <div className="row" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 500 }}>{a.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{a.role} · balance ${(a.balance ?? 0) / 100}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/keys" className="primary" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>ssh keys</Link>
        <Link href="/billing" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>billing</Link>
        <button onClick={() => void a.exportData()} style={{ padding: '6px 12px', fontSize: 13 }}>export my data</button>
      </div>
    </div>
  );
}

export function PasswordCard({ a }: { a: AccountState }) {
  return (
    <div className="card">
      <h3>change password</h3>
      <form onSubmit={(e) => void a.changePw(e)}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="cp">current password</label>
            <input id="cp" type="password" value={a.cur} onChange={(e) => a.setCur(e.target.value)} autoComplete="current-password" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="np">new password (8-72)</label>
            <input id="np" type="password" value={a.nw} onChange={(e) => a.setNw(e.target.value)} autoComplete="new-password" />
          </div>
          <button type="submit" disabled={a.pwBusy || !a.cur || a.nw.length < 8}>update</button>
        </div>
      </form>
    </div>
  );
}

export function RequestsCard({ a }: { a: AccountState }) {
  return (
    <div className="card">
      <h3>my instance requests</h3>
      {a.reqs.length === 0 && <div className="muted">none</div>}
      {a.reqs.map((r) => (
        <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
          <span className="mono">{r.name}</span> · {r.planId} · <span className="muted">{r.status}</span>
          {r.reviewNote && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.reviewNote}</div>}
        </div>
      ))}
    </div>
  );
}

export function DeletionCard({ a }: { a: AccountState }) {
  const pendingDel = a.delReqs.find((d) => d.status === 'pending');
  return (
    <div className="card">
      <h3>data deletion (GDPR)</h3>
      <div className="sub" style={{ margin: '-6px 0 12px' }}>request permanent deletion of your account and all associated data. requires admin approval.</div>
      {pendingDel ? (
        <div className="muted">a deletion request is pending (submitted {new Date(pendingDel.requestedAt).toLocaleString()})</div>
      ) : (
        <button onClick={() => void a.requestDeletion()} disabled={a.delBusy} style={{ color: 'var(--danger, #f87171)' }}>
          {a.delBusy ? 'submitting…' : 'request account deletion'}
        </button>
      )}
    </div>
  );
}
