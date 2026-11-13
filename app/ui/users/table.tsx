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

  async function create(event: React.FormEvent) {
    event.preventDefault();
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
        <input style={{ width: 150 }} value={name} onChange={(event) => setName(event.target.value)}
          placeholder="a-z 0-9 -" autoComplete="off" />
      </div>
      <div className="qfield">
        <span>password</span>
        <input style={{ width: 170 }} value={pass} onChange={(event) => setPass(event.target.value)}
          type="text" placeholder="min 8 chars" autoComplete="new-password" className="mono" />
      </div>
      <div className="qfield">
        <span>role</span>
        <select value={role} onChange={(event) => setRole(event.target.value as 'user' | 'admin')} style={{ width: 100 }}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <div className="qfield">
        <span>opening credit ($)</span>
        <input style={{ width: 110 }} value={credit} onChange={(event) => setCredit(event.target.value)}
          inputMode="decimal" className="mono" />
      </div>
      <button className="primary" type="submit" disabled={busy || !name || pass.length < 8}>
        {busy ? <Ring size={12} /> : null} create account
      </button>
    </form>
  );
}

function AllocCell({ user, allocation }: { user: AdminUser; allocation: Allocation | undefined }) {
  const quota = allocation?.quota;
  if (!quota) return <td className="muted" style={{ fontSize: 11 }}>not set (unlimited)</td>;
  return (
    <td className="muted" style={{ fontSize: 11 }}>
      VMs {allocation?.usage.vms}/{bound(quota.maxVms)} · vCPU {allocation?.usage.vcpus}/{bound(quota.maxVcpus)} · RAM{' '}
      {Math.round((allocation?.usage.memoryMb ?? 0) / 1024)}/{quota.maxMemoryMb === null ? '∞' : Math.round(quota.maxMemoryMb / 1024)}GB
    </td>
  );
}

function OsCell({ user }: { user: AdminUser }) {
  if (user.role === 'admin') return <td className="muted" style={{ fontSize: 12 }}>—</td>;
  const text = user.imagePickable ? 'pickable' : `assigned: ${user.assignedImageId ?? 'none'}`;
  return <td className="muted" style={{ fontSize: 12 }}>{text}</td>;
}

function ManageRow({ user, state, suspended }: { user: AdminUser; state: UserAdminState; suspended: boolean }) {
  async function addCredit() {
    const cents = Math.round(Number(state.topup || '0') * 100);
    if (!Number.isFinite(cents) || cents === 0) return;
    void state.send({ op: 'topup', userId: user.id, deltaCents: cents }, 'credit adjustment');
  }
  return (
    <tr>
      <td colSpan={6} className="quotaedit">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="qfield">
            <span>set password</span>
            <input style={{ width: 170 }} value={state.pw} onChange={(event) => state.setPw(event.target.value)}
              type="text" placeholder="min 8 chars" autoComplete="new-password" className="mono" />
          </div>
          <button
            disabled={state.busy || state.pw.length < 8}
            onClick={async () => {
              if (await state.send({ op: 'setPassword', userId: user.id, password: state.pw }, 'password reset')) state.setPw('');
            }}
          >set password</button>

          <div className="qfield">
            <span>adjust credit ($, negative allowed)</span>
            <input style={{ width: 110 }} value={state.topup} onChange={(event) => state.setTopup(event.target.value)}
              inputMode="decimal" className="mono" />
          </div>
          <button disabled={state.busy} onClick={() => void addCredit()}>add credit</button>
        </div>

        <div className="row">
          <div className="qfield">
            <span>role</span>
            <select
              defaultValue={user.role}
              disabled={state.busy}
              onChange={(event) => void state.send({ op: 'setRole', userId: user.id, role: event.target.value }, 'role change')}
              style={{ width: 100 }}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <button disabled={state.busy} onClick={() => void state.suspend(user.id, !suspended)}>
            {suspended ? 'reinstate' : 'suspend'}
          </button>

          <button
            disabled={state.busy || user.instanceCount > 0}
            title={user.instanceCount > 0 ? 'delete their instances first' : 'delete the account'}
            onClick={() => {
              if (!confirm(`delete ${user.name}? this cannot be undone (ledger history is kept)`)) return;
              void state.send({ op: 'deleteUser', userId: user.id }, 'delete user');
            }}
            style={{ color: 'var(--danger, #f87171)', marginLeft: 'auto' }}
          >delete account</button>
        </div>

        {user.instanceCount > 0 && (
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Account still owns {user.instanceCount} instance{user.instanceCount === 1 ? '' : 's'} — destroy
            {user.instanceCount === 1 ? ' it' : ' them'} from the instances list before deleting.
          </div>
        )}
        {state.msg && <div className="notice err" style={{ marginTop: 8 }}>{state.msg}</div>}
      </td>
    </tr>
  );
}

function UserRow({ user, allocation, state }: { user: AdminUser; allocation: Allocation | undefined; state: UserAdminState }) {
  const suspended = !!allocation?.quota.suspended;
  const open = state.open === user.id;
  return (
    <>
      <tr>
        <td>
          <div>
            {user.name} {user.role === 'admin' && <span className="badge">admin</span>}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {user.instanceCount} VM{user.instanceCount === 1 ? '' : 's'} · {user.keyCount} key{user.keyCount === 1 ? '' : 's'} · since {new Date(user.createdAt).toLocaleDateString()}
          </div>
        </td>
        <td className="mono">{money(user.balanceCents)}</td>
        <AllocCell user={user} allocation={allocation} />
        <OsCell user={user} />
        <td>
          {suspended
            ? <span className="badge error">suspended</span>
            : <span className="badge ready">active</span>}
        </td>
        <td className="snapacts">
          <button onClick={() => state.startEdit(user.id)}>{open ? 'cancel' : 'manage'}</button>
        </td>
      </tr>
      {open && <ManageRow user={user} state={state} suspended={suspended} />}
    </>
  );
}

export function UserTable({ users, allocations, state }: {
  users: AdminUser[]; allocations: Allocation[]; state: UserAdminState;
}) {
  const allocOf = (id: string) => allocations.find((allocation) => allocation.userId === id);
  return (
    <table className="quotatable">
      <thead>
        <tr><th>account</th><th>credit</th><th>allocation</th><th>OS mode</th><th>state</th><th /></tr>
      </thead>
      <tbody>
        {users.map((user) => <UserRow key={user.id} user={user} allocation={allocOf(user.id)} state={state} />)}
      </tbody>
    </table>
  );
}
