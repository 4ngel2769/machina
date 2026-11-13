/** Accounts and audit-log tabs of the host console. */

'use client';

import { Empty, Skeleton } from '@/app/ui/loaders';
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
          {users.map((user) => {
            const mine = instances.filter((instance) => instance.uid === user.id);
            return (
              <tr key={user.id}>
                <td className="mono">{user.name}</td>
                <td>{user.role}</td>
                <td className="mono">{mine.length}</td>
                <td className="mono">${(user.balance_cents / 100).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>
                  {mine.length > 0 && <button onClick={() => onView(user.id)}>view {mine.length}</button>}
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
      {!log && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}><Skeleton h={14} /><Skeleton h={14} /><Skeleton h={14} /></div>}
      <table>
        <thead><tr><th>when</th><th>admin</th><th>action</th><th>target</th><th>detail</th></tr></thead>
        <tbody>
          {(log?.rows ?? []).map((row) => (
            <tr key={row.id}>
              <td className="muted mono">{new Date(row.ts).toLocaleString()}</td>
              <td>{row.actor_name}</td>
              <td className="mono">{row.action}</td>
              <td className="mono">{row.target}</td>
              <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }} className="muted">
                {row.detail ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
