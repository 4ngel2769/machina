/** The audit log card with its pager. */

'use client';

import { Empty } from '@/app/ui/loaders';

import type { Aud } from '../types';

export function AuditCard({ aud, auditOffset, setAuditOffset, auditTotal }: {
  aud: Aud[]; auditOffset: number; setAuditOffset: (v: number) => void; auditTotal: number;
}) {
  return (
    <div className="card">
      <h3>audit ({aud.length ? `${Math.min(auditOffset + 50, auditTotal)} of ${auditTotal}` : auditTotal})</h3>
      <table>
        <thead><tr><th>when</th><th>actor</th><th>action</th><th>target</th><th>detail</th></tr></thead>
        <tbody>
          {aud.length === 0 && <tr><td colSpan={5}><Empty icon="file-text" text="no audit entries" /></td></tr>}
          {aud.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.ts).toLocaleString()}</td>
              <td>{entry.actorName ?? '—'}</td>
              <td>{entry.action}</td>
              <td className="mono">{entry.target ?? '—'}</td>
              <td className="copy">{entry.detail ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button disabled={auditOffset === 0} onClick={() => setAuditOffset(Math.max(0, auditOffset - 50))}>newer</button>
        <button disabled={auditOffset + 50 >= auditTotal} onClick={() => setAuditOffset(auditOffset + 50)}>older</button>
        <span className="muted" style={{ fontSize: 11 }}>page {Math.floor(auditOffset / 50) + 1}</span>
      </div>
    </div>
  );
}
