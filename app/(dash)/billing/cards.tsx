/** The four cards of the billing page. */

'use client';

import { relTime } from '@/app/ui/time';
import type { BillingState } from './use';

export function BalanceCard({ b }: { b: BillingState }) {
  return (
    <div className="card">
      <div className="grid3" style={{ alignItems: 'center' }}>
        <div>
          <div className="muted">balance</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 600 }}>
            {b.balance === null ? '…' : `$${(b.balance / 100).toFixed(2)}`}
          </div>
          {b.balance !== null && b.balance < 100
            ? <span className="badge suspended" title="auto-suspends when it hits zero">low balance</span>
            : null}
        </div>
        <div>
          <div className="muted">host capacity</div>
          <div>{b.cap ? <span className="mono">{b.cap.running}/{b.cap.max}</span> : '…'} <span className="copy">running</span></div>
        </div>
      </div>
    </div>
  );
}

export function ForecastCard({ b }: { b: BillingState }) {
  const burn = b.running.reduce((a, i) => a + (i.rateHourlyCents ?? 0), 0);
  const bal = b.balance ?? 0;
  const days = burn > 0 ? Math.floor(bal / burn / 24) : null;
  const lasts = b.running.length === 0 ? '—' : days !== null ? (days > 365 ? '>1y' : `${days}d`) : '<1d';
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
        based on your {b.running.length} running VM{b.running.length === 1 ? '' : 's'} right now. VMs suspend automatically at zero.
      </div>
    </div>
  );
}

export function PasswordCard({ b }: { b: BillingState }) {
  return (
    <div className="card">
      <h3>change password</h3>
      <div className="sub" style={{ margin: '-6px 0 12px' }}>persists across restarts; the seed never rewrites it unless ADMIN_FORCE_RESET=1</div>
      <form onSubmit={(e) => void b.changePw(e)}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="cp">current password</label>
            <input id="cp" type="password" value={b.cur} onChange={(e) => b.setCur(e.target.value)} autoComplete="current-password" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="np">new password (8-72)</label>
            <input id="np" type="password" value={b.nw} onChange={(e) => b.setNw(e.target.value)} autoComplete="new-password" />
          </div>
          <button type="submit" disabled={b.pwBusy || !b.cur || b.nw.length < 8}>update</button>
        </div>
      </form>
    </div>
  );
}

export function LedgerCard({ b }: { b: BillingState }) {
  return (
    <div className="card">
      <h3>ledger (last 50)</h3>
      <table>
        <thead><tr><th>when</th><th>reason</th><th>delta</th><th>note</th></tr></thead>
        <tbody>
          {b.ledger.map((l) => (
            <tr key={l.id}>
              <td title={new Date(l.createdAt).toLocaleString()}>{relTime(l.createdAt)}</td>
              <td>{l.reason}</td>
              <td className="mono" style={{ color: l.deltaCents >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                {l.deltaCents >= 0 ? '+' : ''}{(l.deltaCents / 100).toFixed(2)}
              </td>
              <td className="copy">{l.note ?? '—'}</td>
            </tr>
          ))}
          {b.ledger.length === 0 && <tr><td colSpan={4} className="empty">no movements yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
