/** Title bar, power controls and the live counters for one host VM. */

'use client';

import Link from 'next/link';
import { bytes } from '../shared';
import type { Detail, Live, Op } from './types';

/** resume when paused, pause otherwise. */
function pauseAction(state: string): 'resume' | 'pause' {
  return state === 'paused' ? 'resume' : 'pause';
}

/** libvirt's pausable states. */
function canPause(state: string): boolean {
  return state === 'running' || state === 'paused';
}

function VmMeta({ vm, running }: { vm: Detail; running: boolean }) {
  const owner = vm.owner ? vm.owner.name : 'unknown';
  const origin = vm.system ? 'system domain' : `machina · ${owner}`;
  const vnc = vm.vnc ? ` · vnc :${vm.vnc}` : '';
  const spice = vm.spice ? ` · spice :${vm.spice.port}` : '';
  return (
    <div className="sub" style={{ margin: '6px 0 0' }}>
      <span className={`badge ${running ? 'running' : 'stopped'}`}>{vm.state}</span>
      {' · '}{vm.osType || 'hvm'} {vm.arch} · {vm.machineType || 'pc'} · {vm.firmware.toUpperCase()}
      {' · '}{origin}{vnc}{spice}
    </div>
  );
}

function PowerBar({ vm, running, busy, op }: {
  vm: Detail; running: boolean; busy: string; op: Op;
}) {
  const flip = running ? 'shutdown' : 'start';
  const pause = pauseAction(vm.state);
  const forceOff = () => {
    if (confirm(`force power off ${vm.name}? this is a hard stop.`)) void op({ op: 'power', action: 'destroy' }, 'destroy');
  };
  return (
    <div className="row">
      <button className="primary" disabled={!!busy} onClick={() => op({ op: 'power', action: flip }, flip)}>
        {flip}
      </button>
      <button disabled={!running || !!busy} onClick={() => op({ op: 'power', action: 'reboot' }, 'reboot')}>reboot</button>
      <button disabled={!running || !!busy} onClick={() => op({ op: 'power', action: 'reset' }, 'reset')}>reset</button>
      <button disabled={!canPause(vm.state) || !!busy}
        onClick={() => op({ op: 'power', action: pause }, pause)}>
        {pause}
      </button>
      <button disabled={!running || !!busy} style={{ color: 'var(--danger, #f87171)' }} onClick={forceOff}>
        power off
      </button>
      <Link href="/host">← host</Link>
    </div>
  );
}

export function VmHeader({ vm, running, busy, op }: {
  vm: Detail; running: boolean; busy: string; op: Op;
}) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div>
        <h1 style={{ margin: 0 }}>{vm.name}</h1>
        <VmMeta vm={vm} running={running} />
      </div>
      <PowerBar vm={vm} running={running} busy={busy} op={op} />
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card statcard" style={{ margin: 0, minWidth: 130 }}>
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}

/** vCPU count with the hot-plug maximum when it differs. */
function vcpuText(vm: Detail): string {
  const shown = vm.vcpu || '—';
  const max = vm.vcpuMax && vm.vcpuMax !== vm.vcpu ? ` / ${vm.vcpuMax}` : '';
  return `${shown}${max}`;
}

function ramText(vm: Detail, live: Live | undefined): string {
  const memMb = live ? live.memMb : vm.memMb;
  return `${(memMb / 1024).toFixed(1)} GB`;
}

function blocksText(live: Live | undefined): string {
  if (!live) return '—';
  return `${bytes(live.blocks.reduce((total, block) => total + block.rdBytes + block.wrBytes, 0))} total`;
}

function netsText(live: Live | undefined): string {
  if (!live) return '—';
  return `${bytes(live.nets.reduce((total, net) => total + net.rxBytes + net.txBytes, 0))} total`;
}

export function VmStats({ vm, live, cpuPct }: {
  vm: Detail; live: Live | undefined; cpuPct: number;
}) {
  return (
    <div className="row" style={{ marginTop: 16, gap: 14 }}>
      <Stat label="vCPU" value={vcpuText(vm)} />
      <Stat label="RAM" value={ramText(vm, live)} />
      <Stat label="cpu now" value={`${cpuPct.toFixed(0)}%`} />
      <Stat label="disk io" value={blocksText(live)} />
      <Stat label="net" value={netsText(live)} />
      <Stat label="autostart" value={vm.autostart ? 'on' : 'off'} />
    </div>
  );
}
