/**
 * Instance list: create, request, start, stop and delete the user's VMs.
 * Toolbar adds search, status filter, groups and bulk actions.
 */
'use client';

import { useMemo, useState } from 'react';
import { CreateForm, RequestForm } from './forms';
import { InstancesGrid } from './grid';
import { Toolbar, type StatusFilter } from './toolbar';
import { useInstancesPage } from './use';
import type { Inst } from './types';

function statusOk(instance: Inst, status: StatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'provisioning') return instance.status === 'provisioning' || !!instance.activeJob;
  return instance.status === status;
}

function groupOk(instance: Inst, groupFilter: string, groups: Record<string, string>): boolean {
  if (groupFilter === '__none__') return !groups[instance.id];
  if (groupFilter) return groups[instance.id] === groupFilter;
  return true;
}

function searchOk(instance: Inst, needle: string): boolean {
  if (!needle) return true;
  return [instance.name, instance.ip, instance.id, instance.planName ?? '']
    .some((field) => field.toLowerCase().includes(needle));
}

/** Apply search + status + group to the loaded list. */
function filterInsts(
  insts: Inst[], query: string, status: StatusFilter, groupFilter: string,
  groups: Record<string, string>,
): Inst[] {
  const needle = query.trim().toLowerCase();
  return insts.filter((instance) =>
    statusOk(instance, status) && groupOk(instance, groupFilter, groups) && searchOk(instance, needle));
}

export default function InstancesPage() {
  const page = useInstancesPage();
  const isAdmin = page.role === 'admin';
  const [reqOpen, setReqOpen] = useState(false);
  const [reqImage, setReqImage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => filterInsts(page.insts, query, status, groupFilter, page.groups.groups),
    [page.insts, query, status, groupFilter, page.groups.groups],
  );

  const newGroup = () => {
    const name = window.prompt('group name');
    if (!name?.trim()) return;
    const target = name.trim();
    // Materialize the group by assigning the first selected (or first visible) VM.
    const anchor = [...selected][0] ?? visible[0]?.id;
    if (anchor) page.groups.assign(anchor, target);
  };

  const renameGroup = () => {
    if (!groupFilter || groupFilter === '__none__') return;
    const name = window.prompt('rename group to', groupFilter);
    if (name?.trim()) page.groups.renameGroup(groupFilter, name.trim());
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulk = async (action: string) => {
    const ids = [...selected];
    setSelected(new Set());
    await page.bulkAct(ids, action);
  };

  return (
    <>
      <h1>instances</h1>
      <div className="sub">{isAdmin ? 'provision and manage VMs' : 'your VMs · request new ones from the admin'}</div>

      {isAdmin && <CreateForm page={page} />}

      {!isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <button className="primary" onClick={() => setReqOpen((prev) => !prev)}>{reqOpen ? 'cancel' : 'request instance'}</button>
          {reqOpen && <RequestForm page={page} selectedImage={reqImage} onImage={setReqImage} />}
        </div>
      )}

      {!isAdmin && page.requests.length > 0 && (
        <div className="card" style={{ marginBottom: 14, padding: '10px 14px' }}>
          <div className="chartlabel" style={{ marginBottom: 6 }}>pending requests</div>
          {page.requests.map((request) => (
            <div key={request.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
              <span style={{ flex: 1 }}>{request.name} · {page.plans.find((p) => p.id === request.plan_id)?.name ?? request.plan_id}</span>
              <span className="badge pending">pending</span>
              <button onClick={() => void page.cancelRequest(request.id)} style={{ fontSize: 12 }}>cancel</button>
            </div>
          ))}
        </div>
      )}

      <Toolbar
        insts={visible}
        query={query} setQuery={setQuery}
        status={status} setStatus={setStatus}
        groupFilter={groupFilter} setGroupFilter={setGroupFilter}
        groupNames={page.groups.groupNames}
        onNewGroup={newGroup} onRenameGroup={renameGroup}
        selected={selected} setSelected={setSelected}
        busy={page.busy} isAdmin={isAdmin}
        onBulk={(action) => void bulk(action)}
      />

      <InstancesGrid page={page} isAdmin={isAdmin} onRequest={() => setReqOpen(true)} insts={visible} selected={selected} onToggle={toggle} />
    </>
  );
}
