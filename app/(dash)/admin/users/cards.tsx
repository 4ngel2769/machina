/** Account-side admin cards: quotas editor, users, OS assignment, box assignment. */

'use client';

import { useState } from 'react';
import type { useAdminUsers } from '../use';
import type { Img, Plan, User } from '../types';

import { QuotaEditor } from '@/app/ui/quota';
import { UserAdmin } from '@/app/ui/users';
import { CustomBox } from '@/app/ui/custombox';
import { DataGate } from '@/app/ui/datagate';
import { Skeleton } from '@/app/ui/loaders';

type UsersState = ReturnType<typeof useAdminUsers>;

export function QuotasCard({ quotas, onSaved }: { quotas: UsersState['quotas']; onSaved: () => void }) {
  const host = quotas?.host;
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
      <DataGate
        data={quotas} loading={!quotas}
        skeleton={<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><Skeleton h={34} /><Skeleton h={34} /><Skeleton h={34} /></div>}
      >
        {(loaded) => <QuotaEditor data={loaded} onSaved={onSaved} />}
      </DataGate>
    </div>
  );
}

export function UsersCard({ users, quotas, onChanged }: {
  users: User[]; quotas: UsersState['quotas']; onChanged: () => void;
}) {
  return (
    <div className="card">
      <h3>users</h3>
      <div className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
        Registration is closed — accounts exist only because an admin made one. Create, fund,
        re-role, re-password, suspend and delete here. Allocation (what they may provision)
        is managed below.
      </div>
      <UserAdmin users={users} allocations={quotas?.rows ?? []} onChanged={onChanged} />
    </div>
  );
}

/** OS assignment per user. */
export function OsAssignCard({ users, imgs, post }: {
  users: User[]; imgs: Img[]; post: UsersState['post'];
}) {
  const [imgPickUser, setImgPickUser] = useState('');
  const [imgPickable, setImgPickable] = useState(true);
  const [imgAssigned, setImgAssigned] = useState('');

  return (
    <div className="card">
      <h3>OS assignment per user</h3>
      <div className="row">
        <select value={imgPickUser} onChange={(event) => {
          setImgPickUser(event.target.value);
          const user = users.find((candidate) => candidate.id === event.target.value);
          if (user) { setImgPickable(!!user.imagePickable); setImgAssigned(user.assignedImageId ?? ''); }
        }} style={{ maxWidth: 190 }}>
          <option value="">select user…</option>
          {users.filter((user) => user.role === 'user').map((user) => (
            <option key={user.id} value={user.id}>{user.name} {user.imagePickable ? '(pickable)' : '(assigned)'}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={imgPickable} onChange={(event) => setImgPickable(event.target.checked)} />
          user can pick OS
        </label>
        <select value={imgAssigned} onChange={(event) => setImgAssigned(event.target.value)} style={{ maxWidth: 220 }}>
          <option value="">no assigned OS</option>
          {imgs.map((image) => <option key={image.id} value={image.id}>{image.name} ({image.status})</option>)}
        </select>
        <button className="primary" disabled={!imgPickUser} onClick={() => {
          void post({ op: 'setUserImage', userId: imgPickUser, imagePickable: imgPickable, assignedImageId: imgAssigned || null }, 'OS assignment');
        }}>save</button>
      </div>
      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        When &quot;user can pick OS&quot; is off and an OS is assigned, the user cannot choose — the assigned OS is used automatically.
      </div>
    </div>
  );
}

export function CustomBoxCard({ users, imgs, onCreated }: {
  users: User[]; imgs: Img[]; onCreated: () => void;
}) {
  return (
    <div className="card">
      <h3>custom box (no preset)</h3>
      <div className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
        Pick the cores, memory, disk and transfer allowance yourself. The spec becomes a
        custom plan row attached to this one box, so it bills and counts toward quota like
        any other.
      </div>
      <CustomBox users={users} images={imgs} onCreated={onCreated} />
    </div>
  );
}

/** Assign a box to a user directly. */
export function AssignBoxCard({ users, plans, imgs, post }: {
  users: User[]; plans: Plan[]; imgs: Img[]; post: UsersState['post'];
}) {
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
          {users.filter((user) => user.role === 'user').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <input style={{ width: 160 }} placeholder="instance name" value={assignName} onChange={(event) => setAssignName(event.target.value)} />
        <select value={assignPlanId} onChange={(event) => setAssignPlanId(event.target.value)} style={{ maxWidth: 160 }}>
          <option value="">plan…</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <select value={assignImageId} onChange={(event) => setAssignImageId(event.target.value)} style={{ maxWidth: 220 }}>
          <option value="">OS (optional)…</option>
          {imgs.filter((image) => image.status === 'ready').map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
        </select>
        <button className="primary" disabled={!assignUserId || !assignName || !assignPlanId} onClick={() => {
          void post({ op: 'createInstance', targetUserId: assignUserId, name: assignName, planId: assignPlanId, imageId: assignImageId || undefined }, 'box assigned');
          setAssignName('');
        }}>create</button>
      </div>
    </div>
  );
}
