/** The cards of the admin console: quotas through audit. */

'use client';

import { useEffect, useState } from 'react';
import { QuotaEditor } from '@/app/ui/quota';
import { UserAdmin } from '@/app/ui/users';
import { CustomBox } from '@/app/ui/custombox';
import { ThinkingOrb } from 'thinking-orbs';
import { BorderBeam } from 'border-beam';
import { useToast } from '@/app/ui/toast';
import type { AdminState } from './use';
import type { DelReq, Img, InstReq, Plan } from './types';

export function QuotasCard({ admin }: { admin: AdminState }) {
  const host = admin.quotas?.host;
  return (
    <div className="card">
      <h3>quotas</h3>
      <div className="sub" style={{ marginTop: -6, marginBottom: 12 }}>
        What each account is allowed to provision. Blank means unlimited, 0 means none.
        Requests over quota are refused at request time, and re-checked when you approve.
      </div>
      {host && (
        <div className="hostcap">
          <span>
            <strong>{host.committed.running}</strong> running of 20 max
          </span>
          <span>
            <strong>{Math.round(host.committed.memoryMb / 1024)}</strong> GB RAM committed
            {host.capacity.memoryMb > 0 && <> of {Math.round((host.capacity.memoryMb * host.capacity.ramOvercommit) / 1024)} GB ceiling</>}
          </span>
          <span>
            <strong>{host.committed.diskGb}</strong> GB disk committed
          </span>
        </div>
      )}
      {admin.quotas ? <QuotaEditor data={admin.quotas} onSaved={() => void admin.load()} />
        : <div className="muted">loading quotas…</div>}
    </div>
  );
}

export function UsersCard({ admin }: { admin: AdminState }) {
  return (
    <div className="card">
      <h3>users</h3>
      <div className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
        Registration is closed — accounts exist only because an admin made one. Create, fund,
        re-role, re-password, suspend and delete here. Allocation (what they may provision) is
        set in the quotas panel above.
      </div>
      <UserAdmin users={admin.users} allocations={admin.quotas?.rows ?? []} onChanged={() => void admin.load()} />
    </div>
  );
}

/** One image row plus its sync button. */
function ImageRow({ i, post }: { i: Img; post: AdminState['post'] }) {
  return (
    <tr>
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
      <td><button onClick={() => void post({ op: 'syncImage', imageId: i.id }, `sync ${i.name}`)}>sync</button></td>
    </tr>
  );
}

export function ImagesCard({ admin }: { admin: AdminState }) {
  const [open, setOpen] = useState(false);
  const [imgId, setImgId] = useState('');
  const [imgName, setImgName] = useState('');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const importImage = async () => {
    setBusy(true);
    try {
      await admin.importImage(imgId, imgName, imgFile, () => {
        setOpen(false); setImgId(''); setImgName(''); setImgFile(null);
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BorderBeam size="line" colorVariant="ice" active={admin.imgs.some((i) => i.status === 'downloading')} strength={0.9} theme="dark">
      <div className="card">
        <h3>images</h3>
        <table>
          <thead><tr><th>id</th><th>status</th><th>size</th><th>sha</th><th>updated</th><th /></tr></thead>
          <tbody>
            {admin.imgs.map((i) => <ImageRow key={i.id} i={i} post={admin.post} />)}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setOpen((v) => !v)}>{open ? 'cancel' : 'import image'}</button>
          {open && (
            <div className="row" style={{ marginTop: 10, alignItems: 'flex-end', gap: 10 }}>
              <label>id<input style={{ width: 160 }} value={imgId} onChange={(e) => setImgId(e.target.value)} placeholder="my-distro-1" className="mono" /></label>
              <label>display name<input style={{ width: 200 }} value={imgName} onChange={(e) => setImgName(e.target.value)} placeholder="optional" /></label>
              <label>qcow2 file<input type="file" accept=".qcow2" onChange={(e) => setImgFile(e.target.files?.[0] ?? null)} /></label>
              <button disabled={busy || !imgId || !imgFile} onClick={() => void importImage()}>{busy ? 'uploading…' : 'upload'}</button>
            </div>
          )}
        </div>
      </div>
    </BorderBeam>
  );
}

export function PlanRow({ plan: p, post, usedBy }: { plan: Plan; post: AdminState['post']; usedBy: number }) {
  const [bw, setBw] = useState(String(p.bandwidthGb ?? 0));
  useEffect(() => { setBw(String(p.bandwidthGb ?? 0)); }, [p.bandwidthGb]);
  return (
    <tr>
      <td>
        {p.name}
        {p.custom ? <span className="badge" title="one-off spec — not offered in the catalog">custom</span> : null}
      </td>
      <td>{p.vcpu}</td><td>{p.ramMb / 1024}GB</td><td>{p.diskGb}GB</td>
      <td className="mono">{(p.hourlyRateCents / 100).toFixed(2)}</td>
      <td className="mono">{Math.round(p.monthlyCapMin / 60)}h</td>
      <td>
        <input className="mono" style={{ width: 70 }} value={bw} onChange={(e) => setBw(e.target.value)} />
      </td>
      <td>
        <div className="snapacts">
          <button onClick={() => {
            const v = parseFloat(bw);
            if (Number.isFinite(v) && v >= 0) void post({ op: 'setPlan', planId: p.id, bandwidthGb: v }, `plan ${p.name} quota`);
          }}>save</button>
          {p.custom && (
            <button
              disabled={usedBy > 0}
              title={usedBy > 0 ? `${usedBy} instance(s) use it` : 'delete this custom plan'}
              onClick={() => { if (confirm(`delete plan ${p.name}?`)) void post({ op: 'deletePlan', planId: p.id }, 'delete plan'); }}
              style={{ color: 'var(--danger, #f87171)' }}
            >drop</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PlansCard({ admin }: { admin: AdminState }) {
  return (
    <div className="card">
      <h3>plans</h3>
      <table>
        <thead><tr><th>name</th><th>vcpu</th><th>ram</th><th>disk</th><th>$/h</th><th>cap/h</th><th>bw GB/mo</th><th /></tr></thead>
        <tbody>
          {admin.plans.map((p) => (
            <PlanRow key={p.id} plan={p} post={admin.post} usedBy={admin.planUsage[p.id] ?? 0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** OS assignment per user. */
export function OsAssignCard({ admin }: { admin: AdminState }) {
  const [imgPickUser, setImgPickUser] = useState('');
  const [imgPickable, setImgPickable] = useState(true);
  const [imgAssigned, setImgAssigned] = useState('');

  return (
    <div className="card">
      <h3>OS assignment per user</h3>
      <div className="row">
        <select value={imgPickUser} onChange={(e) => {
          setImgPickUser(e.target.value);
          const u = admin.users.find((x) => x.id === e.target.value);
          if (u) { setImgPickable(!!u.imagePickable); setImgAssigned(u.assignedImageId ?? ''); }
        }} style={{ maxWidth: 190 }}>
          <option value="">select user…</option>
          {admin.users.filter((u) => u.role === 'user').map((u) => (
            <option key={u.id} value={u.id}>{u.name} {u.imagePickable ? '(pickable)' : '(assigned)'}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={imgPickable} onChange={(e) => setImgPickable(e.target.checked)} />
          user can pick OS
        </label>
        <select value={imgAssigned} onChange={(e) => setImgAssigned(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">no assigned OS</option>
          {admin.imgs.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.status})</option>)}
        </select>
        <button className="primary" disabled={!imgPickUser} onClick={() => {
          void admin.post({ op: 'setUserImage', userId: imgPickUser, imagePickable: imgPickable, assignedImageId: imgAssigned || null }, 'OS assignment');
        }}>save</button>
      </div>
      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        When &quot;user can pick OS&quot; is off and an OS is assigned, the user cannot choose — the assigned OS is used automatically.
      </div>
    </div>
  );
}

export function CustomBoxCard({ admin }: { admin: AdminState }) {
  return (
    <div className="card">
      <h3>custom box (no preset)</h3>
      <div className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
        Pick the cores, memory, disk and transfer allowance yourself. The spec becomes a
        custom plan row attached to this one box, so it bills and counts toward quota like
        any other.
      </div>
      <CustomBox users={admin.users} images={admin.imgs} onCreated={() => void admin.load()} />
    </div>
  );
}

/** Assign a box to a user directly. */
export function AssignBoxCard({ admin }: { admin: AdminState }) {
  const [instUser, setInstUser] = useState('');
  const [instName, setInstName] = useState('');
  const [instPlan, setInstPlan] = useState('');
  const [instImage, setInstImage] = useState('');
  return (
    <div className="card">
      <h3>assign a box to a user</h3>
      <div className="row">
        <select value={instUser} onChange={(e) => setInstUser(e.target.value)} style={{ maxWidth: 190 }}>
          <option value="">select user…</option>
          {admin.users.filter((u) => u.role === 'user').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input style={{ width: 160 }} placeholder="instance name" value={instName} onChange={(e) => setInstName(e.target.value)} />
        <select value={instPlan} onChange={(e) => setInstPlan(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">plan…</option>
          {admin.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={instImage} onChange={(e) => setInstImage(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">OS (optional)…</option>
          {admin.imgs.filter((i) => i.status === 'ready').map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <button className="primary" disabled={!instUser || !instName || !instPlan} onClick={() => {
          void admin.post({ op: 'createInstance', targetUserId: instUser, name: instName, planId: instPlan, imageId: instImage || undefined }, 'box assigned');
          setInstName('');
        }}>create</button>
      </div>
    </div>
  );
}

async function decide(url: string, op: string, okMsg: string, toast: ReturnType<typeof useToast>, reload: () => Promise<void>) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op }) });
  const j = await res.json().catch(() => ({}));
  if (res.ok) toast.ok(okMsg); else toast.err(j.error ?? 'fail');
  void reload();
}

export function RequestsCard({ admin }: { admin: AdminState }) {
  const toast = useToast();
  const pending = admin.reqs.filter((r) => r.status === 'pending').length;
  return (
    <div className="card">
      <h3>instance requests ({pending} pending)</h3>
      <table>
        <thead><tr><th>user</th><th>name</th><th>plan</th><th>status</th><th>note</th><th>actions</th></tr></thead>
        <tbody>
          {admin.reqs.map((r) => (
            <ReqRow key={r.id} r={r} toast={toast} reload={admin.load} />
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>approve/reject via the request id: use the buttons (wired to /api/requests/[id])</div>
    </div>
  );
}

function ReqRow({ r, toast, reload }: { r: InstReq; toast: ReturnType<typeof useToast>; reload: () => Promise<void> }) {
  return (
    <tr>
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
              void reload();
            }} style={{ padding: '2px 8px', fontSize: 11 }}>approve</button>
            <button onClick={() => void decide(`/api/requests/${r.id}`, 'reject', 'rejected', toast, reload)} style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>reject</button>
          </>
        )}
      </td>
    </tr>
  );
}

export function DeletionsCard({ admin }: { admin: AdminState }) {
  const toast = useToast();
  const pending = admin.delReqs.filter((r) => r.status === 'pending').length;
  return (
    <div className="card">
      <h3>deletion requests ({pending} pending)</h3>
      <table>
        <thead><tr><th>user</th><th>status</th><th>requested</th><th>actions</th></tr></thead>
        <tbody>
          {admin.delReqs.map((r) => (
            <DelRow key={r.id} r={r} toast={toast} reload={admin.load} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DelRow({ r, toast, reload }: { r: DelReq; toast: ReturnType<typeof useToast>; reload: () => Promise<void> }) {
  return (
    <tr>
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
              void reload();
            }} style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger, #f87171)' }}>fulfill (delete)</button>
            <button onClick={() => void decide(`/api/deletion/${r.id}`, 'reject', 'rejected', toast, reload)} style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>reject</button>
          </>
        )}
      </td>
    </tr>
  );
}

export function AuditCard({ admin }: { admin: AdminState }) {
  return (
    <div className="card">
      <h3>audit ({admin.aud.length ? `${Math.min(admin.auditOffset + 50, admin.auditTotal)} of ${admin.auditTotal}` : admin.auditTotal})</h3>
      <table>
        <thead><tr><th>when</th><th>actor</th><th>action</th><th>target</th><th>detail</th></tr></thead>
        <tbody>
          {admin.aud.map((a) => (
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
        <button disabled={admin.auditOffset === 0} onClick={() => admin.setAuditOffset(Math.max(0, admin.auditOffset - 50))}>newer</button>
        <button disabled={admin.auditOffset + 50 >= admin.auditTotal} onClick={() => admin.setAuditOffset(admin.auditOffset + 50)}>older</button>
        <span className="muted" style={{ fontSize: 11 }}>page {Math.floor(admin.auditOffset / 50) + 1}</span>
      </div>
    </div>
  );
}
