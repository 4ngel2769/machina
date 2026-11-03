'use client';

import { Fragment, useState } from 'react';
import { useToast } from './toast';
import { Ring } from './loaders';

/**
 * Account lifecycle for the admin panel.
 *
 * The premise: registration is not open. Every account is minted by an admin,
 * starts with nothing (no credit, zero quota) and gets access deliberately.
 * So this is the only place a human can: create, rename-by-recreate, set a
 * password, promote/demote, suspend, top up, and delete.
 *
 * Delete deliberately refuses while the account still owns instances: those
 * own qcow2 overlays, IP leases and VNC sockets, and they must be destroyed
 * through the normal handler rather than orphaned.
 */

export type AdminUser = {
  id: string;
  name: string;
  role: string;
  balanceCents: number;
  createdAt: number;
  imagePickable: number;
  assignedImageId: string | null;
  instanceCount: number;
  keyCount: number;
};

type Allocation = {
  userId: string;
  quota: {
    maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null;
    maxDiskGb: number | null; maxRunning: number | null; suspended: boolean;
  };
  usage: { vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number };
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const bound = (v: number | null) => (v === null ? '∞' : String(v));

export function UserAdmin({
  users,
  allocations,
  onChanged,
}: {
  users: AdminUser[];
  allocations: Allocation[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // create form
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [credit, setCredit] = useState('0');

  // per-row draft
  const [pw, setPw] = useState('');
  const [topup, setTopup] = useState('10');

  const allocOf = (id: string) => allocations.find((a) => a.userId === id);

  async function send(body: Record<string, unknown>, label: string): Promise<boolean> {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const m = j.error ?? `${label} failed`;
        setMsg(m);
        toast.err(m);
        return false;
      }
      toast.ok(`${label} done`);
      onChanged();
      return true;
    } catch {
      setMsg('could not reach the server');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(credit || '0') * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setMsg('opening credit must be $0 or more');
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

  function startEdit(id: string) {
    setOpen(open === id ? null : id);
    setPw('');
    setTopup('10');
    setMsg('');
  }

  async function suspend(id: string, next: boolean) {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch(`/api/quotas/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suspended: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error ?? 'could not change suspension');
        return;
      }
      toast.ok(next ? 'account suspended' : 'account reinstated');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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

      <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
        New accounts start with the credit above (default $0.00) and a zero allocation,
        so they cannot provision anything until you set their quota in the panel above.
      </div>

      <table className="quotatable">
        <thead>
          <tr><th>account</th><th>credit</th><th>allocation</th><th>OS mode</th><th>state</th><th /></tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const a = allocOf(u.id);
            const q = a?.quota;
            const suspended = !!q?.suspended;
            return (
              <Fragment key={u.id}>
                <tr key={u.id}>
                  <td>
                    <div>
                      {u.name} {u.role === 'admin' && <span className="badge">admin</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {u.instanceCount} VM{u.instanceCount === 1 ? '' : 's'} · {u.keyCount} key{u.keyCount === 1 ? '' : 's'} · since {new Date(u.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="mono">{money(u.balanceCents)}</td>
                  <td className="muted" style={{ fontSize: 11 }}>
                    {q ? (
                      <>
                        VMs {a?.usage.vms}/{bound(q.maxVms)} · vCPU {a?.usage.vcpus}/{bound(q.maxVcpus)} · RAM{' '}
                        {Math.round((a?.usage.memoryMb ?? 0) / 1024)}/{q.maxMemoryMb === null ? '∞' : Math.round(q.maxMemoryMb / 1024)}GB
                      </>
                    ) : 'not set (unlimited)'}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {u.role === 'admin' ? '—' : (u.imagePickable ? 'pickable' : `assigned: ${u.assignedImageId ?? 'none'}`)}
                  </td>
                  <td>
                    {suspended
                      ? <span className="badge error">suspended</span>
                      : <span className="badge ready">active</span>}
                  </td>
                  <td className="snapacts">
                    <button onClick={() => startEdit(u.id)}>{open === u.id ? 'cancel' : 'manage'}</button>
                  </td>
                </tr>
                {open === u.id && (
                  <tr key={`${u.id}-manage`}>
                    <td colSpan={6} className="quotaedit">
                      <div className="row" style={{ marginBottom: 10 }}>
                        <div className="qfield">
                          <span>set password</span>
                          <input style={{ width: 170 }} value={pw} onChange={(e) => setPw(e.target.value)}
                            type="text" placeholder="min 8 chars" autoComplete="new-password" className="mono" />
                        </div>
                        <button
                          disabled={busy || pw.length < 8}
                          onClick={async () => {
                            if (await send({ op: 'setPassword', userId: u.id, password: pw }, 'password reset')) setPw('');
                          }}
                        >set password</button>

                        <div className="qfield">
                          <span>adjust credit ($, negative allowed)</span>
                          <input style={{ width: 110 }} value={topup} onChange={(e) => setTopup(e.target.value)}
                            inputMode="decimal" className="mono" />
                        </div>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const cents = Math.round(Number(topup || '0') * 100);
                            if (!Number.isFinite(cents) || cents === 0) { setMsg('enter a non-zero amount'); return; }
                            void send({ op: 'topup', userId: u.id, deltaCents: cents }, 'credit adjustment');
                          }}
                        >add credit</button>
                      </div>

                      <div className="row">
                        <div className="qfield">
                          <span>role</span>
                          <select
                            defaultValue={u.role}
                            disabled={busy}
                            onChange={(e) => void send({ op: 'setRole', userId: u.id, role: e.target.value }, 'role change')}
                            style={{ width: 100 }}
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                          </select>
                        </div>

                        <button disabled={busy} onClick={() => void suspend(u.id, !suspended)}>
                          {suspended ? 'reinstate' : 'suspend'}
                        </button>

                        <button
                          disabled={busy || u.instanceCount > 0}
                          title={u.instanceCount > 0 ? 'delete their instances first' : 'delete the account'}
                          onClick={() => {
                            if (!confirm(`delete ${u.name}? this cannot be undone (ledger history is kept)`)) return;
                            void send({ op: 'deleteUser', userId: u.id }, 'delete user');
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
                      {msg && <div className="notice err" style={{ marginTop: 8 }}>{msg}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
