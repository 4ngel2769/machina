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
  const { instance, jobs, msg, busy, act, clone, exportDisk } = useInstance(id);
  const [tab, setTab] = useState<Tab>('term');

  if (!instance) return <h1>{msg || 'loading…'}</h1>;

  return (
    <>
      <h1>{instance.name}</h1>
      <div className="sub">
        <span className="mono">{instance.id}</span> · {instance.planName?.name ?? instance.planId} · {instance.imageId}
      </div>

      <StatusCard instance={instance} busy={busy} msg={msg} act={act} clone={clone} exportDisk={exportDisk} />

      <TabBar tab={tab} setTab={setTab} />

      <div className="card">
        <TabBody tab={tab} instance={instance} jobs={jobs} />
      </div>
    </>
  );
}
