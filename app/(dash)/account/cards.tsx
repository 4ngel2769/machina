/** The four cards of the account page. */

'use client';

import Link from 'next/link';
import { Skeleton } from '@/app/ui/loaders';
import type { AccountState } from './use';

export function ProfileCard({ account }: { account: AccountState }) {
  return (
    <div className="card">
      <h3>profile</h3>
      <div className="row" style={{ alignItems: 'center' }}>
        <div>
          {!account.loaded
            ? <><Skeleton w={120} h={15} style={{ marginBottom: 6 }} /><Skeleton w={160} h={11} /></>
            : <>
                <div style={{ fontWeight: 500 }}>{account.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{account.role} · balance ${(account.balance ?? 0) / 100}</div>
              </>}
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/keys" className="primary" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>ssh keys</Link>
        <Link href="/billing" style={{ padding: '6px 12px', fontSize: 13, textDecoration: 'none' }}>billing</Link>
        <button onClick={() => void account.exportData()} style={{ padding: '6px 12px', fontSize: 13 }}>export my data</button>
      </div>
    </div>
  );
}

export function PasswordCard({ account }: { account: AccountState }) {
  return (
    <div className="card">
      <h3>change password</h3>
      <form onSubmit={(event) => void account.changePw(event)}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="cp">current password</label>
            <input id="cp" type="password" value={account.currentPw} onChange={(event) => account.setCurrentPw(event.target.value)} autoComplete="current-password" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="np">new password (8-72)</label>
            <input id="np" type="password" value={account.newPw} onChange={(event) => account.setNewPw(event.target.value)} autoComplete="new-password" />
          </div>
          <button type="submit" disabled={account.pwBusy || !account.currentPw || account.newPw.length < 8}>update</button>
        </div>
      </form>
    </div>
  );
}

export function RequestsCard({ account }: { account: AccountState }) {
  return (
    <div className="card">
      <h3>my instance requests</h3>
      {!account.loaded && <Skeleton h={60} />}
      {account.loaded && account.reqs.length === 0 && <div className="muted">none</div>}
      {account.reqs.map((request) => (
        <div key={request.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
          <span className="mono">{request.name}</span> · {request.planId} · <span className="muted">{request.status}</span>
          {request.reviewNote && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{request.reviewNote}</div>}
        </div>
      ))}
    </div>
  );
}

export function DeletionCard({ account }: { account: AccountState }) {
  const pendingDel = account.delReqs.find((delReq) => delReq.status === 'pending');
  return (
    <div className="card">
      <h3>data deletion (GDPR)</h3>
      <div className="sub" style={{ margin: '-6px 0 12px' }}>request permanent deletion of your account and all associated data. requires admin approval.</div>
      {pendingDel ? (
        <div className="muted">a deletion request is pending (submitted {new Date(pendingDel.requestedAt).toLocaleString()})</div>
      ) : (
        <button onClick={() => void account.requestDeletion()} disabled={account.delBusy} style={{ color: 'var(--danger, #f87171)' }}>
          {account.delBusy ? 'submitting…' : 'request account deletion'}
        </button>
      )}
    </div>
  );
}
