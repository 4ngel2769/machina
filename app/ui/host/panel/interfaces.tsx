/** Interfaces tab: host NICs, who manages each one, and interface creation. */

'use client';

import { useState } from 'react';
import { Ring, Empty } from '@/app/ui/loaders';
import { bytes, rate, Field, Spark } from '../shared';
import type { Iface, Post } from './types';

/** Drivers whose interfaces this console may delete. */
const REMOVABLE = /bridge|vlan|bond|team|wireguard/;

function addrCell(i: Iface): React.ReactNode {
  if (!i.addresses.length) return <span className="muted">none</span>;
  return i.addresses.join(' · ');
}

function driverCell(i: Iface): React.ReactNode {
  if (i.driver === 'networkmanager') return <span className="mono">{i.connection}</span>;
  return i.driver;
}

function masterCell(i: Iface): React.ReactNode {
  if (!i.master) return i.name;
  return <>{i.name}<span className="muted"> → {i.master}</span></>;
}

function IfaceTable({ rows, busy, post }: { rows: Iface[]; busy: string; post: Post }) {
  return (
    <table>
      <thead><tr>
        <th>interface</th><th>kind</th><th>managed by</th><th>addresses</th><th>state</th>
        <th>rx</th><th>tx</th><th>total ↓ / ↑</th><th>graph</th><th />
      </tr></thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.name}>
            <td className="mono">{masterCell(i)}</td>
            <td>{i.kind}</td>
            <td>{driverCell(i)}</td>
            <td className="mono">{addrCell(i)}</td>
            <td><span className="muted">{i.state}</span></td>
            <td className="mono">{rate(i.rxBps)}</td>
            <td className="mono">{rate(i.txBps)}</td>
            <td className="mono muted">{bytes(i.rxBytes)} / {bytes(i.txBytes)}</td>
            <td style={{ width: 110 }}><Spark series={i.series} /></td>
            <td style={{ textAlign: 'right' }}>
              {i.driver === 'networkmanager' && REMOVABLE.test(i.kind) && (
                <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy}
                  onClick={() => { if (confirm(`remove ${i.name}?`)) void post('/api/host/iface', { op: 'delete', name: i.name }, `delete ${i.name}`); }}>
                  remove
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const BOND_MODES = ['active-backup', 'balance-rr', 'balance-xor', '802.3ad', 'balance-tlb', 'balance-alb'];

const EMPTY_IFACE = {
  name: '', ports: '', parent: '', vlanId: '', bondMode: 'active-backup', address: '',
  listenPort: '51820', peerPublicKey: '', peerEndpoint: '', peerAllowedIps: '',
};

type IfaceDraft = typeof EMPTY_IFACE;

/** POST body for the kind being created; blank optional fields stay absent. */
function ifaceBody(kind: string, f: IfaceDraft): Record<string, unknown> {
  return {
    kind, name: f.name, ports: f.ports, parent: f.parent,
    vlanId: f.vlanId ? Number(f.vlanId) : undefined, bondMode: f.bondMode,
    address: f.address || undefined,
    listenPort: f.listenPort ? Number(f.listenPort) : undefined,
    peerPublicKey: f.peerPublicKey || undefined, peerEndpoint: f.peerEndpoint || undefined,
    peerAllowedIps: f.peerAllowedIps || undefined,
  };
}

function PortsFields({ kind, f, setF }: { kind: string; f: IfaceDraft; setF: (v: IfaceDraft) => void }) {
  const enslaves = kind === 'bridge' || kind === 'bond' || kind === 'team';
  return (
    <>
      {enslaves && (
        <Field label="ports (comma)"><input style={{ width: 150 }} value={f.ports} onChange={(e) => setF({ ...f, ports: e.target.value })} placeholder="enp3s0" className="mono" /></Field>
      )}
      {kind === 'vlan' && (<>
        <Field label="parent"><input style={{ width: 110 }} value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })} placeholder="enp2s0" className="mono" /></Field>
        <Field label="vlan id"><input style={{ width: 70 }} value={f.vlanId} onChange={(e) => setF({ ...f, vlanId: e.target.value })} className="mono" /></Field>
      </>)}
      {kind === 'bond' && (
        <Field label="mode">
          <select value={f.bondMode} onChange={(e) => setF({ ...f, bondMode: e.target.value })}>
            {BOND_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
      )}
      {kind === 'vpn' && (<>
        <Field label="listen port"><input style={{ width: 80 }} value={f.listenPort} onChange={(e) => setF({ ...f, listenPort: e.target.value })} className="mono" /></Field>
        <Field label="peer public key"><input style={{ width: 200 }} value={f.peerPublicKey} onChange={(e) => setF({ ...f, peerPublicKey: e.target.value })} className="mono" placeholder="optional" /></Field>
        <Field label="endpoint"><input style={{ width: 150 }} value={f.peerEndpoint} onChange={(e) => setF({ ...f, peerEndpoint: e.target.value })} className="mono" placeholder="host:port" /></Field>
        <Field label="allowed ips"><input style={{ width: 120 }} value={f.peerAllowedIps} onChange={(e) => setF({ ...f, peerAllowedIps: e.target.value })} className="mono" placeholder="10.8.0.0/24" /></Field>
      </>)}
    </>
  );
}

function IfaceForm({ busy, post }: { busy: string; post: Post }) {
  const [kind, setKind] = useState('bridge');
  const [f, setF] = useState<IfaceDraft>(EMPTY_IFACE);
  const create = async () => {
    const ok = await post('/api/host/iface', ifaceBody(kind, f), `create ${f.name}`);
    if (ok) setF({ ...f, name: '', ports: '', parent: '', vlanId: '', address: '' });
  };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>add an interface</h3>
      <div className="row">
        <Field label="type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="bridge">bridge</option><option value="vlan">vlan</option>
            <option value="bond">bond</option><option value="team">team</option>
            <option value="vpn">vpn (wireguard)</option>
          </select>
        </Field>
        <Field label="name"><input style={{ width: 110 }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="br1" className="mono" /></Field>
        <Field label="address (cidr, optional)">
          <input style={{ width: 140 }} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="10.9.0.1/24" className="mono" />
        </Field>
        <PortsFields kind={kind} f={f} setF={setF} />
        <button className="primary" disabled={!f.name || !!busy} onClick={create}>{busy ? <Ring size={11} /> : 'create'}</button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        New devices only — existing connections are never edited from here, and an uplink that has an address is refused as a port.
        Leave the address blank for a device that just carries traffic (a bridge or bond for VMs); give it a CIDR to address it.
        Team needs teamd on the host; if it is missing the error says so.
      </div>
    </div>
  );
}

export function Interfaces({ ifaces, busy, post }: {
  ifaces: Iface[]; busy: string; post: Post;
}) {
  const shown = ifaces.filter((i) => i.driver !== 'unmanaged');
  const unmanaged = ifaces.filter((i) => i.driver === 'unmanaged');
  return (
    <>
      <IfaceForm busy={busy} post={post} />

      <div className="card" style={{ marginTop: 14 }}>
        <h3>{shown.length} interfaces</h3>
        {shown.length === 0 ? <Empty text="none" /> : <IfaceTable rows={shown} busy={busy} post={post} />}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>{unmanaged.length} unmanaged</h3>
        <div className="muted" style={{ marginBottom: 8 }}>
          Present at the kernel with nothing managing them. They work now and will not survive a reboot.
        </div>
        {unmanaged.length === 0 ? <Empty text="none" /> : <IfaceTable rows={unmanaged} busy={busy} post={post} />}
      </div>
    </>
  );
}
