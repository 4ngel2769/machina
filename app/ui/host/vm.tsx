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
  const [hist, setHist] = useState<{ t: number; v: number }[]>([]);
  const prev = useRef<{ t: number; cpu: number } | null>(null);
  useEffect(() => {
    if (!live) return;
    const now = Date.now();
    const p = prev.current;
    const per = Math.max(1, vcpu);
    const pct = p && now > p.t
      ? Math.max(0, Math.min(100, ((live.cpuSec - p.cpu) / ((now - p.t) / 1000)) / per * 100))
      : 0;
    prev.current = { t: now, cpu: live.cpuSec };
    if (p) setHist((h) => [...h.slice(-59), { t: now, v: pct }]);
  }, [live, vcpu]);
  return hist.at(-1)?.v ?? 0;
}

/** Active network names, for the attach dropdown. */
function netNames(data: NetList | null): string[] {
  if (!data) return [];
  return data.networks.filter((n) => n.active).map((n) => n.name);
}

function snapsOf(data: Payload | null): Payload['snapshots'] {
  return data ? data.snapshots : [];
}

export function HostVm({ name }: { name: string }) {
  const q = usePoll<Payload>(`/api/host/vm?name=${encodeURIComponent(name)}`, 5000);
  const nets = usePoll<NetList>('/api/host/net', 60_000);
  const isos = usePoll<{ isos: { name: string; sizeMb: number; sha256: string | null }[]; maxIsoGb: number }>('/api/isos', 60_000);
  const { busy, op } = useVmOp(name, q.reload);
  const toast = useToast();
  const { busy: uploadBusy, uploadIso } = useIsoUpload(q.reload, isos.reload);
  const isoList = isos.data;
  const isoRows = isosOf(isoList);
  const isoMaxGb = maxIsoGb(isoList);

  const vm = q.data?.vm;
  const live = q.data?.live;
  const cpuPct = useCpuHist(live, vm ? vm.vcpu : 1);

  if (q.error) return <><h1>{name}</h1><div className="notice err" style={{ marginTop: 12 }}>{q.error}</div><Link href="/host">← host</Link></>;
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
      <NicsCard vm={vm} busy={busy} op={op} netNames={netNames(nets.data)} />
      <HostdevCard vm={vm} busy={busy} op={op} />
      <DirsCard vm={vm} busy={busy} op={op} />
      <SnapshotsCard snaps={snapsOf(q.data)} busy={busy} op={op} />

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
