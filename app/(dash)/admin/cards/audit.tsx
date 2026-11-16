/** The audit log card with its pager. */

'use client';

import { useEffect, useState } from 'react';
import type { AdminState } from '../use';
import type { DelReq, Img, InstReq, Plan } from '../types';


export function AuditCard({ admin }: { admin: AdminState }) {
  return (
    <div className="card">
      <h3>audit ({admin.aud.length ? `${Math.min(admin.auditOffset + 50, admin.auditTotal)} of ${admin.auditTotal}` : admin.auditTotal})</h3>
      <table>
        <thead><tr><th>when</th><th>actor</th><th>action</th><th>target</th><th>detail</th></tr></thead>
        <tbody>
          {admin.aud.map((entry) => (
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
        <button disabled={admin.auditOffset === 0} onClick={() => admin.setAuditOffset(Math.max(0, admin.auditOffset - 50))}>newer</button>
        <button disabled={admin.auditOffset + 50 >= admin.auditTotal} onClick={() => admin.setAuditOffset(admin.auditOffset + 50)}>older</button>
        <span className="muted" style={{ fontSize: 11 }}>page {Math.floor(admin.auditOffset / 50) + 1}</span>
      </div>
    </div>
  );
}
