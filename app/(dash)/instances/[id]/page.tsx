/**
 * Instance detail: status, web terminal, VNC console, metrics, snapshots and info.
 */
'use client';

import { useState } from 'react';
import { StatusCard } from './detail/header';
import { TabBar, TabBody } from './detail/tabs';
import { instanceIdFromPath, type Tab } from './detail/types';
import { useInstance } from './detail/use';

export default function InstanceDetail() {
  const id = instanceIdFromPath();
  const { inst, jobs, msg, busy, act, clone, exportDisk } = useInstance(id);
  const [tab, setTab] = useState<Tab>('term');

  if (!inst) return <h1>{msg || 'loading…'}</h1>;

  return (
    <>
      <h1>{inst.name}</h1>
      <div className="sub">
        <span className="mono">{inst.id}</span> · {inst.planName?.name ?? inst.planId} · {inst.imageId}
      </div>

      <StatusCard inst={inst} busy={busy} msg={msg} act={act} clone={clone} exportDisk={exportDisk} />

      <TabBar tab={tab} setTab={setTab} />

      <div className="card">
        <TabBody tab={tab} inst={inst} jobs={jobs} />
      </div>
    </>
  );
}
