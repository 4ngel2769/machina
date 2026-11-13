/** Accounts and audit-log tabs of the host console. */

'use client';

import { Empty } from '@/app/ui/loaders';
import type { InstRow, LogPayload } from './types';

type Account = { id: string; name: string; role: string; balance_cents: number };

export function UsersCard({ users, instances, onView }: {
  users: Account[]; instances: InstRow[]; onView: (id: string) => void;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>accounts and their machines</h3>
      <div className="muted" style={{ marginBottom: 12 }}>
        machines owned by a non-admin account stay off the machines tab unless you pick that owner.
      </div>
      <table>
        <thead><tr><th>account</th><th>role</th><th>machines</th><th>balance</th><th /></tr></thead>
        <tbody>
          {users.map((u) => {
            const mine = instances.filter((i) => i.uid === u.id);
            return (
              <tr key={u.id}>
                <td className="mono">{u.name}</td>
                <td>{u.role}</td>
                <td className="mono">{mine.length}</td>
                <td className="mono">${(u.balance_cents / 100).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>
                  {mine.length > 0 && <button onClick={() => onView(u.id)}>view {mine.length}</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LogCard({ log }: { log: LogPayload | null }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>host actions</h3>
      {!log && <Empty text="loading…" />}
      <table>
        <thead><tr><th>when</th><th>admin</th><th>action</th><th>target</th><th>detail</th></tr></thead>
        <tbody>
          {(log?.rows ?? []).map((r) => (
            <tr key={r.id}>
              <td className="muted mono">{new Date(r.ts).toLocaleString()}</td>
              <td>{r.actor_name}</td>
              <td className="mono">{r.action}</td>
              <td className="mono">{r.target}</td>
              <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }} className="muted">
                {r.detail ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
