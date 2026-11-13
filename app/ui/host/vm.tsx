'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/app/ui/toast';
import { Ring, Empty } from '@/app/ui/loaders';
import { bytes, rate, Field, usePoll } from './shared';

/** One host VM: every knob libvirt will let us turn, and the live counters. */

type Detail = {
  name: string; state: string; persistent: boolean; autostart: boolean;
  vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number;
  instanceId: string | null; owner: { id: string; name: string } | null; system: boolean;
  arch: string; machineType: string; osType: string; cpuMode: string; cpuModel: string;
  sockets: number; cores: number; threads: number; boot: string[];
  firmware: 'bios' | 'efi'; vnc: string | null;
  spice: { port: number; tlsPort: number | null } | null;
  watchdog: { model: string; action: string } | null;
  disks: { target: string; bus: string; device: string; source: string; format: string; sizeGb: number | null }[];
  nics: { mac: string; type: string; source: string; model: string }[];
  hostdevs: { kind: string; label: string; xml: string }[];
  dirs: { source: string; target: string; readonly: boolean }[];
};
type Live = {
  cpuSec: number; memMb: number; maxMemMb: number;
  nets: { name: string; rxBytes: number; txBytes: number }[];
  blocks: { name: string; rdBytes: number; wrBytes: number }[];
};
type Snap = { name: string; description: string; state: string; isCurrent: boolean; sizeBytes: number; createdAt: number };
type Payload = { vm: Detail; live: Live; snapshots: Snap[]; dominfo: string };
type Net = { name: string; active: boolean };

const BOOTS = ['hd', 'cdrom', 'network', 'fd'];

export function HostVm({ name }: { name: string }) {
  const toast = useToast();
  const q = usePoll<Payload>(`/api/host/vm?name=${encodeURIComponent(name)}`, 5000);
  const nets = usePoll<{ networks: Net[] }>('/api/host/net', 60_000);
  const isos = usePoll<{ isos: { name: string; sizeMb: number; sha256: string | null }[]; maxIsoGb: number }>('/api/isos', 60_000);
  const [busy, setBusy] = useState('');
  const [cpuHist, setCpuHist] = useState<{ t: number; v: number }[]>([]);
  const prev = useRef<{ t: number; cpu: number } | null>(null);

  const vm = q.data?.vm;
  const live = q.data?.live;

  useEffect(() => {
    if (!live) return;
    const now = Date.now();
    const p = prev.current;
    const pct = p && now > p.t ? Math.max(0, Math.min(100, ((live.cpuSec - p.cpu) / ((now - p.t) / 1000)) / Math.max(1, vm?.vcpu ?? 1) * 100)) : 0;
    prev.current = { t: now, cpu: live.cpuSec };
    if (p) setCpuHist((h) => [...h.slice(-59), { t: now, v: pct }]);
  }, [live, vm?.vcpu]);

  async function op(body: Record<string, unknown>, label: string): Promise<boolean> {
    setBusy(label);
    try {
      const r = await fetch('/api/host/vm', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, ...body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.err(j.error ?? `${label} failed`); return false; }
      toast.ok(j.result ? `${label}: ${j.result}` : `${label} done`);
      q.reload();
      return true;
    } catch {
      toast.err(`${label}: could not reach the server`);
      return false;
    } finally { setBusy(''); }
  }

  /** Raw body, filename in the query: the server caps while streaming. */
  async function uploadIso(file: File): Promise<void> {
    setBusy('upload iso');
    try {
      const r = await fetch(`/api/isos?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.err(j.error ?? 'upload failed'); return; }
      toast.ok(`uploaded ${j.iso?.name ?? file.name}`);
      isos.reload();
      q.reload();
    } catch {
      toast.err('upload failed: could not reach the server');
    } finally { setBusy(''); }
  }

  if (q.error) return <><h1>{name}</h1><div className="notice err" style={{ marginTop: 12 }}>{q.error}</div><Link href="/host">← host</Link></>;
  if (!vm) return <><h1>{name}</h1><Empty text="reading the domain…" /></>;

  const running = vm.state === 'running';
  const netNames = (nets.data?.networks ?? []).filter((n) => n.active).map((n) => n.name);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>{vm.name}</h1>
          <div className="sub" style={{ margin: '6px 0 0' }}>
            <span className={`badge ${running ? 'running' : 'stopped'}`}>{vm.state}</span>
            {' · '}{vm.osType || 'hvm'} {vm.arch} · {vm.machineType || 'pc'} · {vm.firmware.toUpperCase()}
            {' · '}{vm.system ? 'system domain' : `machina · ${vm.owner?.name ?? 'unknown'}`}
            {vm.vnc ? ` · vnc :${vm.vnc}` : ''}
            {vm.spice ? ` · spice :${vm.spice.port}` : ''}
          </div>
        </div>
        <div className="row">
          <button className="primary" disabled={!!busy} onClick={() => op({ op: 'power', action: running ? 'shutdown' : 'start' }, running ? 'shutdown' : 'start')}>
            {running ? 'shutdown' : 'start'}
          </button>
          <button disabled={!running || !!busy} onClick={() => op({ op: 'power', action: 'reboot' }, 'reboot')}>reboot</button>
          <button disabled={!running || !!busy} onClick={() => op({ op: 'power', action: 'reset' }, 'reset')}>reset</button>
          <button disabled={(vm.state !== 'running' && vm.state !== 'paused') || !!busy}
            onClick={() => op({ op: 'power', action: vm.state === 'paused' ? 'resume' : 'pause' }, vm.state === 'paused' ? 'resume' : 'pause')}>
            {vm.state === 'paused' ? 'resume' : 'pause'}
          </button>
          <button disabled={!running || !!busy} style={{ color: 'var(--danger, #f87171)' }}
            onClick={() => { if (confirm(`force power off ${vm.name}? this is a hard stop.`)) void op({ op: 'power', action: 'destroy' }, 'destroy'); }}>
            power off
          </button>
          <Link href="/host">← host</Link>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, gap: 14 }}>
        <Stat label="vCPU" value={`${vm.vcpu || '—'}${vm.vcpuMax && vm.vcpuMax !== vm.vcpu ? ` / ${vm.vcpuMax}` : ''}`} />
        <Stat label="RAM" value={live ? `${(live.memMb / 1024).toFixed(1)} GB` : `${(vm.memMb / 1024).toFixed(1)} GB`} />
        <Stat label="cpu now" value={`${(cpuHist.at(-1)?.v ?? 0).toFixed(0)}%`} />
        <Stat label="disk io" value={live ? `${bytes(live.blocks.reduce((a, b) => a + b.rdBytes + b.wrBytes, 0))} total` : '—'} />
        <Stat label="net" value={live ? `${bytes(live.nets.reduce((a, b) => a + b.rxBytes + b.txBytes, 0))} total` : '—'} />
        <Stat label="autostart" value={vm.autostart ? 'on' : 'off'} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>cpu</h3>
        <div className="row">
          <Field label="vCPU count"><input style={{ width: 70 }} defaultValue={vm.vcpu} key={`c${vm.vcpu}`} className="mono"
            onBlur={(e) => { const n = Number(e.target.value); if (n !== vm.vcpu) void op({ op: 'vcpu', count: n }, 'vCPU count'); }} /></Field>
          <Field label="vCPU maximum"><input style={{ width: 70 }} defaultValue={vm.vcpuMax} key={`m${vm.vcpuMax}`} className="mono"
            onBlur={(e) => { const n = Number(e.target.value); if (n !== vm.vcpuMax) void op({ op: 'vcpu', count: vm.vcpu, max: n }, 'vCPU maximum'); }} /></Field>
          <Field label="sockets"><input style={{ width: 60 }} defaultValue={vm.sockets} key={`s${vm.sockets}`} className="mono"
            onBlur={(e) => op({ op: 'topology', sockets: Number(e.target.value), cores: vm.cores, threads: vm.threads }, 'topology')} /></Field>
          <Field label="cores"><input style={{ width: 60 }} defaultValue={vm.cores} key={`k${vm.cores}`} className="mono"
            onBlur={(e) => op({ op: 'topology', sockets: vm.sockets, cores: Number(e.target.value), threads: vm.threads }, 'topology')} /></Field>
          <Field label="threads"><input style={{ width: 60 }} defaultValue={vm.threads} key={`t${vm.threads}`} className="mono"
            onBlur={(e) => op({ op: 'topology', sockets: vm.sockets, cores: vm.cores, threads: Number(e.target.value) }, 'topology')} /></Field>
          <Field label="mode">
            <select defaultValue={vm.cpuMode} key={`cm${vm.cpuMode}`} onChange={(e) => op({ op: 'cpuMode', mode: e.target.value }, 'cpu mode')}>
              {['host-passthrough', 'host-model', 'custom', 'maximum'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="memory (GB)"><input style={{ width: 80 }} defaultValue={(vm.memMaxMb / 1024).toFixed(1)} key={`mm${vm.memMaxMb}`} className="mono"
            onBlur={(e) => { const gb = Number(e.target.value); if (gb > 0) void op({ op: 'memory', mb: Math.round(gb * 1024) }, 'memory'); }} /></Field>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {vm.cpuModel ? `model ${vm.cpuModel} · ` : ''}
          structural changes are written to the stored config and apply at next start; memory also applies live when the guest allows it.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>boot &amp; lifecycle</h3>
        <div className="row">
          <Field label="boot order">
            <select value="" onChange={(e) => { if (!e.target.value) return; void op({ op: 'boot', order: [...vm.boot.filter((b) => b !== e.target.value), e.target.value] }, 'boot order'); }}>
              <option value="">add device…</option>
              {BOOTS.filter((b) => !vm.boot.includes(b)).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <span className="mono" style={{ fontSize: 13 }}>{vm.boot.join(' → ')}</span>
          {vm.boot.length > 1 && (
            <button onClick={() => op({ op: 'boot', order: [...vm.boot.slice(1), vm.boot[0]] }, 'boot order')}>rotate</button>
          )}
          <Field label="autostart">
            <select value={vm.autostart ? 'on' : 'off'} key={`as${vm.autostart}`} onChange={(e) => op({ op: 'autostart', on: e.target.value === 'on' }, 'autostart')}>
              <option value="on">on</option><option value="off">off</option>
            </select>
          </Field>
          <Field label="watchdog">
            <select value={vm.watchdog?.action ?? 'none'} key={`wd${vm.watchdog?.action}`}
              onChange={(e) => op({ op: 'watchdog', action: e.target.value as 'reset' | 'poweroff' | 'inject-nmi' | 'pause' | 'none' }, 'watchdog')}>
              <option value="none">none</option>
              <option value="reset">reset</option>
              <option value="poweroff">power off</option>
              <option value="inject-nmi">inject NMI</option>
              <option value="pause">pause</option>
            </select>
          </Field>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          The watchdog needs the i6300esb driver and a running watchdog service inside the guest, or it will never fire.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>disks</h3>
        <table>
          <thead><tr><th>target</th><th>bus</th><th>device</th><th>format</th><th>size</th><th>source</th><th /></tr></thead>
          <tbody>
            {vm.disks.map((d) => (
              <tr key={d.target + d.source}>
                <td className="mono">{d.target}</td><td>{d.bus}</td><td>{d.device}</td><td>{d.format}</td>
                <td className="mono">{d.sizeGb ?? '—'}{d.sizeGb ? ' GB' : ''}</td>
                <td className="mono muted" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.source || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {d.device === 'disk' && (
                    <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy}
                      onClick={() => { if (confirm(`detach ${d.target}? the file stays on the host.`)) void op({ op: 'diskDetach', target: d.target }, 'detach disk'); }}>
                      detach
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="new disk (GB)"><input id="disk-gb" style={{ width: 90 }} defaultValue="20" className="mono" /></Field>
          <button disabled={!!busy} onClick={() => {
            const el = document.getElementById('disk-gb') as HTMLInputElement | null;
            void op({ op: 'diskAttach', sizeGb: Number(el?.value ?? 0) }, 'attach disk');
          }}>attach a new disk</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>media</h3>
        {vm.disks.filter((d) => d.device === 'cdrom').length === 0 ? (
          <Empty text="no cdrom attached" />
        ) : (
          <table>
            <thead><tr><th>target</th><th>bus</th><th>media</th><th /></tr></thead>
            <tbody>
              {vm.disks.filter((d) => d.device === 'cdrom').map((d) => (
                <tr key={d.target + d.source}>
                  <td className="mono">{d.target}</td><td>{d.bus}</td>
                  <td className="mono muted" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.source ? d.source.split('/').pop() : '(empty)'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button disabled={!!busy}
                      onClick={() => { if (confirm(`eject ${d.target}?`)) void op({ op: 'isoDetach', target: d.target }, 'eject media'); }}>
                      eject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <Field label="insert iso">
            <select id="iso-pick" defaultValue="" style={{ minWidth: 220 }}>
              <option value="">select…</option>
              {(isos.data?.isos ?? []).map((i) => (
                <option key={i.name} value={i.name}>{i.name} · {i.sizeMb} MB</option>
              ))}
            </select>
          </Field>
          <button disabled={!!busy || running || !(isos.data?.isos ?? []).length} onClick={() => {
            const el = document.getElementById('iso-pick') as HTMLSelectElement | null;
            if (el?.value) void op({ op: 'isoAttach', iso: el.value }, 'insert media');
          }}>insert</button>
          <span className="muted" style={{ fontSize: 12 }}>
            {running ? 'stop the VM to change media' : isos.data?.isos.length ? '' : 'no isos uploaded yet'}
          </span>
        </div>

        <div className="row" style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <Field label={`upload iso (max ${isos.data?.maxIsoGb ?? 16} GB)`}>
            <input id="iso-file" type="file" accept=".iso,application/x-iso9660-image" />
          </Field>
          <button disabled={!!busy} onClick={() => {
            const el = document.getElementById('iso-file') as HTMLInputElement | null;
            const file = el?.files?.[0];
            if (!file) { toast.err('pick a .iso file first'); return; }
            void uploadIso(file);
          }}>{busy === 'upload iso' ? <Ring size={11} /> : 'upload'}</button>
        </div>

        <div className="row" style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <Field label="spice console">
            <span className="muted" style={{ fontSize: 12 }}>
              {vm.spice ? `enabled on 127.0.0.1:${vm.spice.port}` : 'off'}
            </span>
          </Field>
          <button disabled={!!busy || running} onClick={() => void op({ op: 'spice', on: !vm.spice }, vm.spice ? 'disable spice' : 'enable spice')}>
            {vm.spice ? 'disable' : 'enable'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            {running ? 'stop the VM to change the console' : vm.spice ? 'remote-viewer spice://127.0.0.1:' + vm.spice.port : ''}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>network interfaces</h3>
        <table>
          <thead><tr><th>mac</th><th>type</th><th>network</th><th>model</th><th /></tr></thead>
          <tbody>
            {vm.nics.map((n) => (
              <tr key={n.mac}>
                <td className="mono">{n.mac}</td><td>{n.type}</td><td className="mono">{n.source}</td><td>{n.model || 'default'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy}
                    onClick={() => { if (confirm(`detach ${n.mac}?`)) void op({ op: 'nicDetach', mac: n.mac }, 'detach nic'); }}>detach</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="attach to network">
            <select id="nic-net" defaultValue={netNames[0] ?? ''} style={{ minWidth: 150 }}>
              {netNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <button disabled={!!busy || !netNames.length} onClick={() => {
            const el = document.getElementById('nic-net') as HTMLSelectElement | null;
            if (el?.value) void op({ op: 'nicAttach', network: el.value }, 'attach nic');
          }}>attach interface</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>host devices</h3>
        {vm.hostdevs.length === 0 ? <Empty text="no passthrough devices" /> : (
          <table>
            <thead><tr><th>kind</th><th>device</th><th /></tr></thead>
            <tbody>
              {vm.hostdevs.map((h, i) => (
                <tr key={i}><td>{h.kind}</td><td className="mono">{h.label}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy}
                      onClick={() => { if (confirm(`detach ${h.label}?`)) void op({ op: 'hostdevDetach', index: i }, 'detach hostdev'); }}>detach</button>
                  </td></tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="usb vendor"><input id="hv" style={{ width: 90 }} placeholder="046d" className="mono" /></Field>
          <Field label="product"><input id="hp" style={{ width: 90 }} placeholder="c52b" className="mono" /></Field>
          <button disabled={!!busy} onClick={() => {
            const v = (document.getElementById('hv') as HTMLInputElement | null)?.value ?? '';
            const p = (document.getElementById('hp') as HTMLInputElement | null)?.value ?? '';
            void op({ op: 'hostdevAttach', vendor: v, product: p }, 'attach hostdev');
          }}>attach usb device</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>shared dirs</h3>
        {vm.dirs.length === 0 ? <Empty text="none" /> : (
          <table>
            <thead><tr><th>tag</th><th>source</th><th>mode</th><th /></tr></thead>
            <tbody>
              {vm.dirs.map((d) => (
                <tr key={d.target}><td className="mono">{d.target}</td><td className="mono muted">{d.source}</td>
                  <td>{d.readonly ? 'read-only' : 'read-write'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy}
                      onClick={() => { if (confirm(`unshare ${d.target}?`)) void op({ op: 'dirDetach', tag: d.target }, 'remove share'); }}>remove</button>
                  </td></tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="host path"><input id="ds" style={{ width: 220 }} placeholder="/mnt/8tbv1/share" className="mono" /></Field>
          <Field label="guest tag"><input id="dt" style={{ width: 100 }} placeholder="share" className="mono" /></Field>
          <button disabled={!!busy} onClick={() => {
            const s = (document.getElementById('ds') as HTMLInputElement | null)?.value ?? '';
            const t = (document.getElementById('dt') as HTMLInputElement | null)?.value ?? '';
            void op({ op: 'dirAttach', source: s, tag: t }, 'share dir');
          }}>share</button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>9p mount: in the guest, <span className="mono">mount -t 9p -o trans=virtio &lt;tag&gt; /mnt/x</span></div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>snapshots</h3>
        {(q.data?.snapshots ?? []).length === 0 ? <Empty text="no snapshots" /> : (
          <table>
            <thead><tr><th>name</th><th>state</th><th>added</th><th>taken</th><th /></tr></thead>
            <tbody>
              {(q.data?.snapshots ?? []).map((s) => (
                <tr key={s.name}>
                  <td className="mono">{s.name}{s.isCurrent ? <span className="muted"> · current</span> : null}</td>
                  <td>{s.state}</td>
                  <td className="mono">{bytes(s.sizeBytes)}</td>
                  <td className="muted">{new Date(s.createdAt).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button disabled={!!busy} onClick={() => { if (confirm(`revert to ${s.name}? the current disk state is lost.`)) void op({ op: 'snapshotRevert', snapName: s.name }, 'revert'); }}>revert</button>
                    <button style={{ marginLeft: 6, color: 'var(--danger, #f87171)' }} disabled={!!busy}
                      onClick={() => { if (confirm(`delete ${s.name}?`)) void op({ op: 'snapshotDelete', snapName: s.name }, 'delete snapshot'); }}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="new snapshot"><input id="sn" style={{ width: 160 }} placeholder="auto name" className="mono" /></Field>
          <button className="primary" disabled={!!busy} onClick={() => {
            const n = (document.getElementById('sn') as HTMLInputElement | null)?.value ?? '';
            void op({ op: 'snapshotCreate', snapName: n }, 'snapshot');
          }}>take snapshot</button>
        </div>
      </div>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card statcard" style={{ margin: 0, minWidth: 130 }}>
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}
