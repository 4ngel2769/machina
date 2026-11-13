/** Create-account form and the account table for the admin console. */

'use client';

import { useState } from 'react';
import { Ring } from '../loaders';
import type { UserAdminState } from './actions';
import type { AdminUser, Allocation } from './types';
import { bound, money } from './types';

type CreateProps = {
  send: UserAdminState['send'];
  busy: boolean;
};

export function CreateForm({ send, busy }: CreateProps) {
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [credit, setCredit] = useState('0');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(credit || '0') * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      return;
    }
    const ok = await send({ op: 'createUser', name, password: pass, role, creditCents: cents }, 'create user');
    if (ok) {
      setName('');
      setPass('');
      setCredit('0');
      setRole('user');
    }
  }

  return (
    <form onSubmit={create} className="row" style={{ marginBottom: 14 }}>
      <div className="qfield">
        <span>username</span>
        <input style={{ width: 150 }} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="a-z 0-9 -" autoComplete="off" />
      </div>
      <div className="qfield">
        <span>password</span>
        <input style={{ width: 170 }} value={pass} onChange={(e) => setPass(e.target.value)}
          type="text" placeholder="min 8 chars" autoComplete="new-password" className="mono" />
      </div>
      <div className="qfield">
        <span>role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')} style={{ width: 100 }}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <div className="qfield">
        <span>opening credit ($)</span>
        <input style={{ width: 110 }} value={credit} onChange={(e) => setCredit(e.target.value)}
          inputMode="decimal" className="mono" />
      </div>
      <button className="primary" type="submit" disabled={busy || !name || pass.length < 8}>
        {busy ? <Ring size={12} /> : null} create account
      </button>
    </form>
  );
}

function AllocCell({ u, a }: { u: AdminUser; a: Allocation | undefined }) {
  const q = a?.quota;
  if (!q) return <td className="muted" style={{ fontSize: 11 }}>not set (unlimited)</td>;
  return (
    <td className="muted" style={{ fontSize: 11 }}>
      VMs {a?.usage.vms}/{bound(q.maxVms)} · vCPU {a?.usage.vcpus}/{bound(q.maxVcpus)} · RAM{' '}
      {Math.round((a?.usage.memoryMb ?? 0) / 1024)}/{q.maxMemoryMb === null ? '∞' : Math.round(q.maxMemoryMb / 1024)}GB
    </td>
  );
}

function OsCell({ u }: { u: AdminUser }) {
  if (u.role === 'admin') return <td className="muted" style={{ fontSize: 12 }}>—</td>;
  const text = u.imagePickable ? 'pickable' : `assigned: ${u.assignedImageId ?? 'none'}`;
  return <td className="muted" style={{ fontSize: 12 }}>{text}</td>;
}

function ManageRow({ u, s, suspended }: { u: AdminUser; s: UserAdminState; suspended: boolean }) {
  async function addCredit() {
    const cents = Math.round(Number(s.topup || '0') * 100);
    if (!Number.isFinite(cents) || cents === 0) return;
    void s.send({ op: 'topup', userId: u.id, deltaCents: cents }, 'credit adjustment');
  }
  return (
    <tr>
      <td colSpan={6} className="quotaedit">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="qfield">
            <span>set password</span>
            <input style={{ width: 170 }} value={s.pw} onChange={(e) => s.setPw(e.target.value)}
              type="text" placeholder="min 8 chars" autoComplete="new-password" className="mono" />
          </div>
          <button
            disabled={s.busy || s.pw.length < 8}
            onClick={async () => {
              if (await s.send({ op: 'setPassword', userId: u.id, password: s.pw }, 'password reset')) s.setPw('');
            }}
          >set password</button>

          <div className="qfield">
            <span>adjust credit ($, negative allowed)</span>
            <input style={{ width: 110 }} value={s.topup} onChange={(e) => s.setTopup(e.target.value)}
              inputMode="decimal" className="mono" />
          </div>
          <button disabled={s.busy} onClick={() => void addCredit()}>add credit</button>
        </div>

        <div className="row">
          <div className="qfield">
            <span>role</span>
            <select
              defaultValue={u.role}
              disabled={s.busy}
              onChange={(e) => void s.send({ op: 'setRole', userId: u.id, role: e.target.value }, 'role change')}
              style={{ width: 100 }}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <button disabled={s.busy} onClick={() => void s.suspend(u.id, !suspended)}>
            {suspended ? 'reinstate' : 'suspend'}
          </button>

          <button
            disabled={s.busy || u.instanceCount > 0}
            title={u.instanceCount > 0 ? 'delete their instances first' : 'delete the account'}
            onClick={() => {
              if (!confirm(`delete ${u.name}? this cannot be undone (ledger history is kept)`)) return;
              void s.send({ op: 'deleteUser', userId: u.id }, 'delete user');
            }}
            style={{ color: 'var(--danger, #f87171)', marginLeft: 'auto' }}
          >delete account</button>
        </div>

        {u.instanceCount > 0 && (
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Account still owns {u.instanceCount} instance{u.instanceCount === 1 ? '' : 's'} — destroy
            {u.instanceCount === 1 ? ' it' : ' them'} from the instances list before deleting.
          </div>
        )}
        {s.msg && <div className="notice err" style={{ marginTop: 8 }}>{s.msg}</div>}
      </td>
    </tr>
  );
}

function UserRow({ u, a, s }: { u: AdminUser; a: Allocation | undefined; s: UserAdminState }) {
  const suspended = !!a?.quota.suspended;
  const open = s.open === u.id;
  return (
    <>
      <tr>
        <td>
          <div>
            {u.name} {u.role === 'admin' && <span className="badge">admin</span>}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {u.instanceCount} VM{u.instanceCount === 1 ? '' : 's'} · {u.keyCount} key{u.keyCount === 1 ? '' : 's'} · since {new Date(u.createdAt).toLocaleDateString()}
          </div>
        </td>
        <td className="mono">{money(u.balanceCents)}</td>
        <AllocCell u={u} a={a} />
        <OsCell u={u} />
        <td>
          {suspended
            ? <span className="badge error">suspended</span>
            : <span className="badge ready">active</span>}
        </td>
        <td className="snapacts">
          <button onClick={() => s.startEdit(u.id)}>{open ? 'cancel' : 'manage'}</button>
        </td>
      </tr>
      {open && <ManageRow u={u} s={s} suspended={suspended} />}
    </>
  );
}

export function UserTable({ users, allocations, s }: {
  users: AdminUser[]; allocations: Allocation[]; s: UserAdminState;
}) {
  const allocOf = (id: string) => allocations.find((a) => a.userId === id);
  return (
    <table className="quotatable">
      <thead>
        <tr><th>account</th><th>credit</th><th>allocation</th><th>OS mode</th><th>state</th><th /></tr>
      </thead>
      <tbody>
        {users.map((u) => <UserRow key={u.id} u={u} a={allocOf(u.id)} s={s} />)}
      </tbody>
    </table>
  );
}
