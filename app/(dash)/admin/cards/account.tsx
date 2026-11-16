/** Account-side admin cards: quotas, users, plans, OS assignment, custom/assigned boxes. */

'use client';

import { useEffect, useState } from 'react';
import type { AdminState } from '../use';
import type { DelReq, Img, InstReq, Plan } from '../types';

import { QuotaEditor } from '@/app/ui/quota';
import { UserAdmin } from '@/app/ui/users';
import { CustomBox } from '@/app/ui/custombox';
import { Skeleton } from '@/app/ui/loaders';

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
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><Skeleton h={34} /><Skeleton h={34} /><Skeleton h={34} /></div>}
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

export function PlanRow({ plan, post, usedBy }: { plan: Plan; post: AdminState['post']; usedBy: number }) {
  const [bw, setBw] = useState(String(plan.bandwidthGb ?? 0));
  useEffect(() => { setBw(String(plan.bandwidthGb ?? 0)); }, [plan.bandwidthGb]);
  return (
    <tr>
      <td>
        {plan.name}
        {plan.custom ? <span className="badge" title="one-off spec — not offered in the catalog">custom</span> : null}
      </td>
      <td>{plan.vcpu}</td><td>{plan.ramMb / 1024}GB</td><td>{plan.diskGb}GB</td>
      <td className="mono">{(plan.hourlyRateCents / 100).toFixed(2)}</td>
      <td className="mono">{Math.round(plan.monthlyCapMin / 60)}h</td>
      <td>
        <input className="mono" style={{ width: 70 }} value={bw} onChange={(event) => setBw(event.target.value)} />
      </td>
      <td>
        <div className="snapacts">
          <button onClick={() => {
            const bandwidthGb = parseFloat(bw);
            if (Number.isFinite(bandwidthGb) && bandwidthGb >= 0) void post({ op: 'setPlan', planId: plan.id, bandwidthGb }, `plan ${plan.name} quota`);
          }}>save</button>
          {plan.custom && (
            <button
              disabled={usedBy > 0}
              title={usedBy > 0 ? `${usedBy} instance(s) use it` : 'delete this custom plan'}
              onClick={() => { if (confirm(`delete plan ${plan.name}?`)) void post({ op: 'deletePlan', planId: plan.id }, 'delete plan'); }}
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
          {admin.plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} post={admin.post} usedBy={admin.planUsage[plan.id] ?? 0} />
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
        <select value={imgPickUser} onChange={(event) => {
          setImgPickUser(event.target.value);
          const user = admin.users.find((candidate) => candidate.id === event.target.value);
          if (user) { setImgPickable(!!user.imagePickable); setImgAssigned(user.assignedImageId ?? ''); }
        }} style={{ maxWidth: 190 }}>
          <option value="">select user…</option>
          {admin.users.filter((user) => user.role === 'user').map((user) => (
            <option key={user.id} value={user.id}>{user.name} {user.imagePickable ? '(pickable)' : '(assigned)'}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={imgPickable} onChange={(event) => setImgPickable(event.target.checked)} />
          user can pick OS
        </label>
        <select value={imgAssigned} onChange={(event) => setImgAssigned(event.target.value)} style={{ maxWidth: 220 }}>
          <option value="">no assigned OS</option>
          {admin.imgs.map((image) => <option key={image.id} value={image.id}>{image.name} ({image.status})</option>)}
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
  const [assignUserId, setAssignUserId] = useState('');
  const [assignName, setAssignName] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignImageId, setAssignImageId] = useState('');
  return (
    <div className="card">
      <h3>assign a box to a user</h3>
      <div className="row">
        <select value={assignUserId} onChange={(event) => setAssignUserId(event.target.value)} style={{ maxWidth: 190 }}>
          <option value="">select user…</option>
          {admin.users.filter((user) => user.role === 'user').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <input style={{ width: 160 }} placeholder="instance name" value={assignName} onChange={(event) => setAssignName(event.target.value)} />
        <select value={assignPlanId} onChange={(event) => setAssignPlanId(event.target.value)} style={{ maxWidth: 160 }}>
          <option value="">plan…</option>
          {admin.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <select value={assignImageId} onChange={(event) => setAssignImageId(event.target.value)} style={{ maxWidth: 220 }}>
          <option value="">OS (optional)…</option>
          {admin.imgs.filter((image) => image.status === 'ready').map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
        </select>
        <button className="primary" disabled={!assignUserId || !assignName || !assignPlanId} onClick={() => {
          void admin.post({ op: 'createInstance', targetUserId: assignUserId, name: assignName, planId: assignPlanId, imageId: assignImageId || undefined }, 'box assigned');
          setAssignName('');
        }}>create</button>
      </div>
    </div>
  );
}
