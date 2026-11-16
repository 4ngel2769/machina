/**
 * Instance detail: status, web terminal, VNC console, metrics, snapshots and info.
 */
'use client';

import { useState } from 'react';
import { DataGate } from '@/app/ui/datagate';
import { Skeleton } from '@/app/ui/loaders';
import { StatusCard } from './detail/header';
import { TabBar, TabBody } from './detail/tabs';
import { instanceIdFromPath, type Job, type Tab } from './detail/types';
import { useInstance } from './detail/use';

export default function InstanceDetail() {
  const id = instanceIdFromPath();
  const { instance, jobs, msg, busy, act, clone, exportDisk } = useInstance(id);
  const [tab, setTab] = useState<Tab>('term');

  if (msg === 'instance gone') return <h1>{msg}</h1>;

  return (
    <DataGate
      data={instance} loading={!instance}
      emptyIcon="server" emptyText="instance gone"
      skeleton={<div><Skeleton w="40%" h={26} style={{ marginBottom: 8 }} /><Skeleton w="60%" h={12} /><div className="card" style={{ marginTop: 14 }}><Skeleton h={220} /></div></div>}
    >
      {(inst) => <InstanceBody inst={inst} jobs={jobs} msg={msg} busy={busy} act={act} clone={clone} exportDisk={exportDisk} tab={tab} setTab={setTab} />}
    </DataGate>
  );
}

function InstanceBody({ inst: instance, jobs, msg, busy, act, clone, exportDisk, tab, setTab }: {
  inst: NonNullable<ReturnType<typeof useInstance>['instance']>; jobs: Job[]; msg: string; busy: boolean;
  act: (a: string) => Promise<void>; clone: () => Promise<void>; exportDisk: () => Promise<void>;
  tab: Tab; setTab: (t: Tab) => void;
}) {
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
