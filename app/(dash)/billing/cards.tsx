/** The four cards of the billing page. */

'use client';

import { relTime } from '@/app/ui/time';
import { Skeleton } from '@/app/ui/loaders';
import type { BillingState } from './use';

export function BalanceCard({ billing }: { billing: BillingState }) {
  return (
    <div className="card">
      <div className="grid3" style={{ alignItems: 'center' }}>
        <div>
          <div className="muted">balance</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 600 }}>
            {!billing.loaded ? <Skeleton w={110} h={30} r={6} /> : billing.balance === null ? '—' : `$${(billing.balance / 100).toFixed(2)}`}
          </div>
          {billing.balance !== null && billing.balance < 100
            ? <span className="badge suspended" title="auto-suspends when it hits zero">low balance</span>
            : null}
        </div>
        <div>
          <div className="muted">host capacity</div>
          <div>{billing.cap ? <span className="mono">{billing.cap.running}/{billing.cap.max}</span> : '…'} <span className="copy">running</span></div>
        </div>
      </div>
    </div>
  );
}

export function ForecastCard({ billing }: { billing: BillingState }) {
  const burn = billing.running.reduce((totalCents, instance) => totalCents + (instance.rateHourlyCents ?? 0), 0);
  const bal = billing.balance ?? 0;
  const days = burn > 0 ? Math.floor(bal / burn / 24) : null;
  const lasts = billing.running.length === 0 ? '—' : days !== null ? (days > 365 ? '>1y' : `${days}d`) : '<1d';
  return (
    <div className="card">
      <h3>forecast</h3>
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
            {lasts}
          </div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        based on your {billing.running.length} running VM{billing.running.length === 1 ? '' : 's'} right now. VMs suspend automatically at zero.
      </div>
    </div>
  );
}

export function PasswordCard({ billing }: { billing: BillingState }) {
  return (
    <div className="card">
      <h3>change password</h3>
      <div className="sub" style={{ margin: '-6px 0 12px' }}>persists across restarts; the seed never rewrites it unless ADMIN_FORCE_RESET=1</div>
      <form onSubmit={(event) => void billing.changePw(event)}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="cp">current password</label>
            <input id="cp" type="password" value={billing.currentPw} onChange={(event) => billing.setCurrentPw(event.target.value)} autoComplete="current-password" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="np">new password (8-72)</label>
            <input id="np" type="password" value={billing.newPw} onChange={(event) => billing.setNewPw(event.target.value)} autoComplete="new-password" />
          </div>
          <button type="submit" disabled={billing.pwBusy || !billing.currentPw || billing.newPw.length < 8}>update</button>
        </div>
      </form>
    </div>
  );
}

export function LedgerCard({ billing }: { billing: BillingState }) {
  return (
    <div className="card">
      <h3>ledger (last 50)</h3>
      <table>
        <thead><tr><th>when</th><th>reason</th><th>delta</th><th>note</th></tr></thead>
        <tbody>
          {!billing.loaded && Array.from({ length: 4 }).map((_, n) => (
            <tr key={n}>{Array.from({ length: 4 }).map((__, cell) => (
              <td key={cell} style={{ padding: '10px' }}><Skeleton w={cell === 3 ? '50%' : '75%'} h={10} /></td>
            ))}</tr>
          ))}
          {billing.loaded && billing.ledger.map((entry) => (
            <tr key={entry.id}>
              <td title={new Date(entry.createdAt).toLocaleString()}>{relTime(entry.createdAt)}</td>
              <td>{entry.reason}</td>
              <td className="mono" style={{ color: entry.deltaCents >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                {entry.deltaCents >= 0 ? '+' : ''}{(entry.deltaCents / 100).toFixed(2)}
              </td>
              <td className="copy">{entry.note ?? '—'}</td>
            </tr>
          ))}
          {billing.loaded && billing.ledger.length === 0 && <tr><td colSpan={4} className="empty">no movements yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
