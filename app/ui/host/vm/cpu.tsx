/** CPU topology, boot order and lifecycle knobs for one host VM. */

'use client';

import { Field } from '../shared';
import type { Detail, Op } from './types';

const BOOTS = ['hd', 'cdrom', 'network', 'fd'];
const CPU_MODES = ['host-passthrough', 'host-model', 'custom', 'maximum'];
const WATCHDOG_ACTIONS = ['reset', 'poweroff', 'inject-nmi', 'pause', 'none'] as const;
type WatchdogAction = (typeof WATCHDOG_ACTIONS)[number];

const WATCHDOG_LABELS: Record<WatchdogAction, string> = {
  none: 'none', reset: 'reset', poweroff: 'power off', 'inject-nmi': 'inject NMI', pause: 'pause',
};

function CpuTopology({ vm, busy, op }: { vm: Detail; busy: string; op: Op }) {
  return (
    <div className="row">
      <Field label="vCPU count"><input style={{ width: 70 }} defaultValue={vm.vcpu} key={`c${vm.vcpu}`} className="mono"
        onBlur={(event) => { const count = Number(event.target.value); if (count !== vm.vcpu) void op({ op: 'vcpu', count }, 'vCPU count'); }} /></Field>
      <Field label="vCPU maximum"><input style={{ width: 70 }} defaultValue={vm.vcpuMax} key={`m${vm.vcpuMax}`} className="mono"
        onBlur={(event) => { const count = Number(event.target.value); if (count !== vm.vcpuMax) void op({ op: 'vcpu', count: vm.vcpu, max: count }, 'vCPU maximum'); }} /></Field>
      <Field label="sockets"><input style={{ width: 60 }} defaultValue={vm.sockets} key={`s${vm.sockets}`} className="mono"
        onBlur={(event) => op({ op: 'topology', sockets: Number(event.target.value), cores: vm.cores, threads: vm.threads }, 'topology')} /></Field>
      <Field label="cores"><input style={{ width: 60 }} defaultValue={vm.cores} key={`k${vm.cores}`} className="mono"
        onBlur={(event) => op({ op: 'topology', sockets: vm.sockets, cores: Number(event.target.value), threads: vm.threads }, 'topology')} /></Field>
      <Field label="threads"><input style={{ width: 60 }} defaultValue={vm.threads} key={`t${vm.threads}`} className="mono"
        onBlur={(event) => op({ op: 'topology', sockets: vm.sockets, cores: vm.cores, threads: Number(event.target.value) }, 'topology')} /></Field>
      <Field label="mode">
        <select defaultValue={vm.cpuMode} key={`cm${vm.cpuMode}`} onChange={(event) => op({ op: 'cpuMode', mode: event.target.value }, 'cpu mode')}>
          {CPU_MODES.map((mode) => <option key={mode}>{mode}</option>)}
        </select>
      </Field>
      <Field label="memory (GB)"><input style={{ width: 80 }} defaultValue={(vm.memMaxMb / 1024).toFixed(1)} key={`mm${vm.memMaxMb}`} className="mono"
        onBlur={(event) => { const gigabytes = Number(event.target.value); if (gigabytes > 0) void op({ op: 'memory', mb: Math.round(gigabytes * 1024) }, 'memory'); }} /></Field>
    </div>
  );
}

/** Append the picked device to the end of the boot order. */
function bootWith(vm: Detail, device: string): string[] {
  return [...vm.boot.filter((bootDevice) => bootDevice !== device), device];
}

export function CpuCard({ vm, busy, op }: { vm: Detail; busy: string; op: Op }) {
  const model = vm.cpuModel ? `model ${vm.cpuModel} · ` : '';
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>cpu</h3>
      <CpuTopology vm={vm} busy={busy} op={op} />
      <div className="muted" style={{ marginTop: 8 }}>
        {model}
        structural changes are written to the stored config and apply at next start; memory also applies live when the guest allows it.
      </div>
    </div>
  );
}

export function BootCard({ vm, op }: { vm: Detail; op: Op }) {
  const add = (device: string) => {
    if (device) void op({ op: 'boot', order: bootWith(vm, device) }, 'boot order');
  };
  const rotate = () => {
    const [first, ...rest] = vm.boot;
    void op({ op: 'boot', order: [...rest, first] }, 'boot order');
  };
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>boot &amp; lifecycle</h3>
      <div className="row">
        <Field label="boot order">
          <select value="" onChange={(event) => add(event.target.value)}>
            <option value="">add device…</option>
            {BOOTS.filter((bootDevice) => !vm.boot.includes(bootDevice)).map((bootDevice) => <option key={bootDevice} value={bootDevice}>{bootDevice}</option>)}
          </select>
        </Field>
        <span className="mono" style={{ fontSize: 13 }}>{vm.boot.join(' → ')}</span>
        {vm.boot.length > 1 && <button onClick={rotate}>rotate</button>}
        <Field label="autostart">
          <select value={vm.autostart ? 'on' : 'off'} key={`as${vm.autostart}`} onChange={(event) => op({ op: 'autostart', on: event.target.value === 'on' }, 'autostart')}>
            <option value="on">on</option><option value="off">off</option>
          </select>
        </Field>
        <Field label="watchdog">
          <select value={vm.watchdog?.action ?? 'none'} key={`wd${vm.watchdog?.action}`}
            onChange={(event) => op({ op: 'watchdog', action: event.target.value as WatchdogAction }, 'watchdog')}>
            {WATCHDOG_ACTIONS.map((action) => <option key={action} value={action}>{WATCHDOG_LABELS[action]}</option>)}
          </select>
        </Field>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        The watchdog needs the i6300esb driver and a running watchdog service inside the guest, or it will never fire.
      </div>
    </div>
  );
}
