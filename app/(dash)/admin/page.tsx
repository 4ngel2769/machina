'use client';

import { useCallback, useEffect, useState } from 'react';
import { QuotaEditor } from '@/app/ui/quota';
import { ThinkingOrb } from 'thinking-orbs';
import { BorderBeam } from 'border-beam';
import { useToast } from '@/app/ui/toast';

type User = { id: string; name: string; role: string; balanceCents: number; createdAt: number; imagePickable: number; assignedImageId: string | null };
type Plan = { id: string; name: string; vcpu: number; ramMb: number; diskGb: number; hourlyRateCents: number; monthlyCapMin: number; bandwidthGb: number };
type Img = { id: string; name: string; status: string; failure: string | null; sha256: string; sizeBytes: number; updatedAt: number };
type Aud = { id: string; ts: number; actorName: string | null; action: string; target: string | null; detail: string | null };
type InstReq = { id: string; userId: string; name: string; planId: string; imageId: string | null; status: string; note: string | null; createdAt: number; reviewNote: string | null };
type DelReq = { id: string; userId: string; status: string; requestedAt: number };

export default function AdminPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [aud, setAud] = useState<Aud[]>([]);
  const [reqs, setReqs] = useState<InstReq[]>([]);
  const [delReqs, setDelReqs] = useState<DelReq[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [topupUser, setTopupUser] = useState('');
  const [topupAmt, setTopupAmt] = useState('25');
  const [imgPickUser, setImgPickUser] = useState('');
  const [imgPickable, setImgPickable] = useState(true);
  const [imgAssigned, setImgAssigned] = useState('');
  const [instUser, setInstUser] = useState('');
  const [instName, setInstName] = useState('');
  const [instPlan, setInstPlan] = useState('');
  const [instImage, setInstImage] = useState('');
  const [quotas, setQuotas] = useState<{
    rows: {
      userId: string; name: string; role: string;
      quota: { maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null; maxDiskGb: number | null; maxRunning: number | null; suspended: boolean; note: string | null };
      usage: { vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number };
      balanceCents: number;
    }[];
    host: { committed: { vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number }; capacity: { memoryMb: number; vcpus: number; ramOvercommit: number } };
  } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin?limit=50&offset=${auditOffset}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setUsers(j.users); setPlans(j.plans); setImgs(j.images); setAud(j.audit);
      setAuditTotal(j.auditTotal ?? j.audit.length);
      setTopupUser((u) => u || (j.users[0]?.id ?? ''));
    }
    const rq = await fetch('/api/requests', { cache: 'no-store' });
    if (rq.ok) setReqs(await rq.json());
    const dq = await fetch('/api/deletion', { cache: 'no-store' });
    if (dq.ok) setDelReqs(await dq.json());
    const qq = await fetch('/api/quotas', { cache: 'no-store' });
    if (qq.ok) setQuotas(await qq.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: object, label = 'op') => {
    const r = await fetch('/api/admin', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast.ok(`${label} done`);
    else toast.err(j.error ?? `${label} failed`);
    void load();
  };

  return (
    <>
      <h1>admin</h1>
      <div className="sub">users, credits, images, plans, audit trail</div>

      <div className="card">
        <h3>quotas</h3>
        <div className="sub" style={{ marginTop: -6, marginBottom: 12 }}>
          What each account is allowed to provision. Blank means unlimited, 0 means none.
          Requests over quota are refused at request time, and re-checked when you approve.
        </div>
        {quotas?.host && (
          <div className="hostcap">
            <span>
              <strong>{quotas.host.committed.running}</strong> running of 20 max
            </span>
            <span>
              <strong>{Math.round(quotas.host.committed.memoryMb / 1024)}</strong> GB RAM committed
              {quotas.host.capacity.memoryMb > 0 && <> of {Math.round((quotas.host.capacity.memoryMb * quotas.host.capacity.ramOvercommit) / 1024)} GB ceiling</>}
            </span>
            <span>
              <strong>{quotas.host.committed.diskGb}</strong> GB disk committed
            </span>
          </div>
        )}
        {quotas ? <QuotaEditor data={quotas} onSaved={() => void load()} />
          : <div className="muted">loading quotas…</div>}
      </div>

      <div className="card">
        <h3>credits</h3>
        <div className="row">
          <select value={topupUser} onChange={(e) => setTopupUser(e.target.value)} style={{ maxWidth: 190 }}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} (${(u.balanceCents / 100).toFixed(2)})</option>)}
          </select>
          <input style={{ width: 110 }} className="mono" value={topupAmt} onChange={(e) => setTopupAmt(e.target.value)} />
          <button className="primary" onClick={() => post({ op: 'topup', userId: topupUser, deltaCents: Math.round(parseFloat(topupAmt) * 100) }, 'top up')}>top up $</button>
        </div>
        <table style={{ marginTop: 14 }}>
          <thead><tr><th>name</th><th>role</th><th>balance</th><th>OS mode</th><th>since</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.role}</td>
                <td className="mono">${(u.balanceCents / 100).toFixed(2)}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {u.role === 'admin' ? '—' : (u.imagePickable ? 'pickable' : `assigned: ${u.assignedImageId ?? 'none'}`)}
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <input style={{ width: 160 }} placeholder="username" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input style={{ width: 160 }} placeholder="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <button onClick={() => post({ op: 'createUser', name: newName, password: newPass }, 'create user')}>create user</button>
        </div>
      </div>

      <BorderBeam size="line" colorVariant="ice" active={imgs.some((i) => i.status === 'downloading')} strength={0.9} theme="dark">
        <div className="card">
          <h3>images</h3>
          <table>
            <thead><tr><th>id</th><th>status</th><th>size</th><th>sha</th><th>updated</th><th /></tr></thead>
            <tbody>
              {imgs.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>
                    <span className={`badge ${i.status}`}>
                      {i.status === 'downloading' ? (
                        <>
                          <ThinkingOrb state="working" size={20} theme="dark" aria-label="downloading" />
                        </>
                      ) : null}
                      {i.status}
                    </span>
                    {i.failure ? <div className="copy">{i.failure}</div> : null}
                  </td>
                  <td className="mono">{(i.sizeBytes / 1024 / 1024).toFixed(0)}MB</td>
                  <td className="mono">{i.sha256 ? `${i.sha256.slice(0, 12)}…` : '—'}</td>
                  <td>{i.updatedAt ? new Date(i.updatedAt).toLocaleString() : '—'}</td>
                  <td><button onClick={() => post({ op: 'syncImage', imageId: i.id }, `sync ${i.name}`)}>sync</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BorderBeam>

      <div className="card">
        <h3>plans</h3>
        <table>
          <thead><tr><th>name</th><th>vcpu</th><th>ram</th><th>disk</th><th>$/h</th><th>cap/h</th><th>bw GB/mo</th><th /></tr></thead>
          <tbody>
            {plans.map((p) => (
              <PlanRow key={p.id} plan={p} post={post} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>OS assignment per user</h3>
        <div className="row">
          <select value={imgPickUser} onChange={(e) => {
            setImgPickUser(e.target.value);
            const u = users.find((x) => x.id === e.target.value);
            if (u) { setImgPickable(!!u.imagePickable); setImgAssigned(u.assignedImageId ?? ''); }
          }} style={{ maxWidth: 190 }}>
            <option value="">select user…</option>
            {users.filter((u) => u.role === 'user').map((u) => (
              <option key={u.id} value={u.id}>{u.name} {u.imagePickable ? '(pickable)' : '(assigned)'}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={imgPickable} onChange={(e) => setImgPickable(e.target.checked)} />
            user can pick OS
          </label>
          <select value={imgAssigned} onChange={(e) => setImgAssigned(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">no assigned OS</option>
            {imgs.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.status})</option>)}
          </select>
          <button className="primary" disabled={!imgPickUser} onClick={() => {
            void post({ op: 'setUserImage', userId: imgPickUser, imagePickable: imgPickable, assignedImageId: imgAssigned || null }, 'OS assignment');
          }}>save</button>
        </div>
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          When "user can pick OS" is off and an OS is assigned, the user cannot choose — the assigned OS is used automatically.
        </div>
      </div>

      <div className="card">
        <h3>assign a box to a user</h3>
        <div className="row">
          <select value={instUser} onChange={(e) => setInstUser(e.target.value)} style={{ maxWidth: 190 }}>
            <option value="">select user…</option>
            {users.filter((u) => u.role === 'user').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input style={{ width: 160 }} placeholder="instance name" value={instName} onChange={(e) => setInstName(e.target.value)} />
          <select value={instPlan} onChange={(e) => setInstPlan(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={instImage} onChange={(e) => setInstImage(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">OS (optional)…</option>
            {imgs.filter((i) => i.status === 'ready').map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button className="primary" disabled={!instUser || !instName || !instPlan} onClick={() => {
            void post({ op: 'createInstance', targetUserId: instUser, name: instName, planId: instPlan, imageId: instImage || undefined }, 'box assigned');
            setInstName('');
          }}>create</button>
        </div>
      </div>

      <div className="card">
        <h3>instance requests ({reqs.filter((r) => r.status === 'pending').length} pending)</h3>
        <table>
          <thead><tr><th>user</th><th>name</th><th>plan</th><th>status</th><th>note</th><th>actions</th></tr></thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id}>
                <td>{r.userId.slice(0, 8)}</td>
                <td className="mono">{r.name}</td>
                <td>{r.planId}</td>
                <td>{r.status}</td>
                <td className="muted" style={{ fontSize: 11 }}>{r.note ?? '—'}</td>
                <td>
                  {r.status === 'pending' && (
                    <>
                      <button onClick={async () => {
                        const res = await fetch(`/api/requests/${r.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'approve' }) });
                        const j = await res.json().catch(() => ({}));
                        if (res.ok) toast.ok(`approved (${j.instanceId ?? ''})`); else toast.err(j.error ?? 'fail');
                        void load();
                      }} style={{ padding: '2px 8px', fontSize: 11 }}>approve</button>
                      <button onClick={async () => {
                        const res = await fetch(`/api/requests/${r.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'reject' }) });
                        const j = await res.json().catch(() => ({}));
                        if (res.ok) toast.ok('rejected'); else toast.err(j.error ?? 'fail');
                        void load();
                      }} style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>approve/reject via the request id: use the buttons (wired to /api/requests/[id])</div>
      </div>

      <div className="card">
        <h3>deletion requests ({delReqs.filter((r) => r.status === 'pending').length} pending)</h3>
        <table>
          <thead><tr><th>user</th><th>status</th><th>requested</th><th>actions</th></tr></thead>
          <tbody>
            {delReqs.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.userId.slice(0, 12)}</td>
                <td>{r.status}</td>
                <td>{new Date(r.requestedAt).toLocaleString()}</td>
                <td>
                  {r.status === 'pending' && (
                    <>
                      <button onClick={async () => {
                        const res = await fetch(`/api/deletion/${r.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'fulfill' }) });
                        const j = await res.json().catch(() => ({}));
                        if (res.ok) toast.ok(`fulfilled (${j.destroyed ?? 0} VMs)`); else toast.err(j.error ?? 'fail');
                        void load();
                      }} style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger, #f87171)' }}>fulfill (delete)</button>
                      <button onClick={async () => {
                        const res = await fetch(`/api/deletion/${r.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'reject' }) });
                        const j = await res.json().catch(() => ({}));
                        if (res.ok) toast.ok('rejected'); else toast.err(j.error ?? 'fail');
                        void load();
                      }} style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>audit ({aud.length ? `${Math.min(auditOffset + 50, auditTotal)} of ${auditTotal}` : auditTotal})</h3>
        <table>
          <thead><tr><th>when</th><th>actor</th><th>action</th><th>target</th><th>detail</th></tr></thead>
          <tbody>
            {aud.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.ts).toLocaleString()}</td>
                <td>{a.actorName ?? '—'}</td>
                <td>{a.action}</td>
                <td className="mono">{a.target ?? '—'}</td>
                <td className="copy">{a.detail ?? '—'}</td>
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
    </>
  );
}

function PlanRow({ plan: p, post }: { plan: Plan; post: (b: object, label?: string) => Promise<void> }) {
  const [bw, setBw] = useState(String(p.bandwidthGb ?? 0));
  useEffect(() => { setBw(String(p.bandwidthGb ?? 0)); }, [p.bandwidthGb]);
  return (
    <tr>
      <td>{p.name}</td><td>{p.vcpu}</td><td>{p.ramMb / 1024}GB</td><td>{p.diskGb}GB</td>
      <td className="mono">{(p.hourlyRateCents / 100).toFixed(2)}</td>
      <td className="mono">{Math.round(p.monthlyCapMin / 60)}h</td>
      <td>
        <input className="mono" style={{ width: 70 }} value={bw} onChange={(e) => setBw(e.target.value)} />
      </td>
      <td>
        <button onClick={() => {
          const v = parseFloat(bw);
          if (Number.isFinite(v) && v >= 0) void post({ op: 'setPlan', planId: p.id, bandwidthGb: v }, `plan ${p.name} quota`);
        }}>save</button>
      </td>
    </tr>
  );
}
