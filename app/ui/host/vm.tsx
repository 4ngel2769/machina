/** One host VM: every knob libvirt will let us turn, and the live counters. */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/app/ui/toast';
import { Empty } from '@/app/ui/loaders';
import { usePoll } from './shared';
import { maxIsoGb, useIsoUpload, useVmOp, isosOf } from './vm/actions';
import { VmHeader, VmStats } from './vm/header';
import { BootCard, CpuCard } from './vm/cpu';
import { DisksCard } from './vm/disks';
import { MediaCard } from './vm/media';
import { NicsCard } from './vm/nics';
import { DirsCard, HostdevCard } from './vm/devices';
import { SnapshotsCard } from './vm/snapshots';
import type { Live, NetList, Payload } from './vm/types';

/** Live CPU% sample series, one point per poll. */
function useCpuHist(live: Live | undefined, vcpu: number): number {
  const [history, setHistory] = useState<{ t: number; v: number }[]>([]);
  const previousCpu = useRef<{ t: number; cpu: number } | null>(null);
  useEffect(() => {
    if (!live) return;
    const now = Date.now();
    const previous = previousCpu.current;
    const perCore = Math.max(1, vcpu);
    const pct = previous && now > previous.t
      ? Math.max(0, Math.min(100, ((live.cpuSec - previous.cpu) / ((now - previous.t) / 1000)) / perCore * 100))
      : 0;
    previousCpu.current = { t: now, cpu: live.cpuSec };
    if (previous) setHistory((points) => [...points.slice(-59), { t: now, v: pct }]);
  }, [live, vcpu]);
  return history.at(-1)?.v ?? 0;
}

/** Active network names, for the attach dropdown. */
function netNames(netList: NetList | null): string[] {
  if (!netList) return [];
  return netList.networks.filter((network) => network.active).map((network) => network.name);
}

function snapsOf(payload: Payload | null): Payload['snapshots'] {
  return payload ? payload.snapshots : [];
}

export function HostVm({ name }: { name: string }) {
  const query = usePoll<Payload>(`/api/host/vm?name=${encodeURIComponent(name)}`, 5000);
  const nets = usePoll<NetList>('/api/host/net', 60_000);
  const isos = usePoll<{ isos: { name: string; sizeMb: number; sha256: string | null }[]; maxIsoGb: number }>('/api/isos', 60_000);
  const { busy, op } = useVmOp(name, query.reload);
  const toast = useToast();
  const { busy: uploadBusy, uploadIso } = useIsoUpload(query.reload, isos.reload);
  const isoList = isos.payload;
  const isoRows = isosOf(isoList);
  const isoMaxGb = maxIsoGb(isoList);

  const vm = query.payload?.vm;
  const live = query.payload?.live;
  const cpuPct = useCpuHist(live, vm ? vm.vcpu : 1);

  if (query.error) return <><h1>{name}</h1><div className="notice err" style={{ marginTop: 12 }}>{query.error}</div><Link href="/host">← host</Link></>;
  if (!vm) return <><h1>{name}</h1><Empty text="reading the domain…" /></>;

  const running = vm.state === 'running';
  const onUpload = (file: File | null) => {
    if (!file) { toast.err('pick a .iso file first'); return; }
    void uploadIso(file);
  };

  return (
    <>
      <VmHeader vm={vm} running={running} busy={busy} op={op} />
      <VmStats vm={vm} live={live} cpuPct={cpuPct} />

      <CpuCard vm={vm} busy={busy} op={op} />
      <BootCard vm={vm} op={op} />
      <DisksCard vm={vm} busy={busy} op={op} />
      <MediaCard vm={vm} running={running} busy={busy} op={op} isos={isoRows} maxGb={isoMaxGb} uploadBusy={!!uploadBusy} onUpload={onUpload} />
      <NicsCard vm={vm} busy={busy} op={op} netNames={netNames(nets.payload)} />
      <HostdevCard vm={vm} busy={busy} op={op} />
      <DirsCard vm={vm} busy={busy} op={op} />
      <SnapshotsCard snaps={snapsOf(query.payload)} busy={busy} op={op} />

      {vm.system && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>definition</h3>
          <div className="muted" style={{ marginBottom: 10 }}>
            This domain is not managed by machina. Removing its definition keeps the disk files.
          </div>
          <button style={{ color: 'var(--danger, #f87171)' }} disabled={running || !!busy}
            onClick={() => { if (confirm(`remove the definition of ${vm.name}? disks are kept.`)) void op({ op: 'undefine' }, 'undefine'); }}>
            remove definition
          </button>
        </div>
      )}
    </>
  );
}
