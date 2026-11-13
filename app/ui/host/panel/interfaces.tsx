/** Interfaces tab: host NICs, who manages each one, and interface creation. */

'use client';

import { useState } from 'react';
import { Ring, Empty } from '@/app/ui/loaders';
import { bytes, rate, Field, Spark } from '../shared';
import type { Iface, Post } from './types';

/** Drivers whose interfaces this console may delete. */
const REMOVABLE = /bridge|vlan|bond|team|wireguard/;

function addrCell(iface: Iface): React.ReactNode {
  if (!iface.addresses.length) return <span className="muted">none</span>;
  return iface.addresses.join(' · ');
}

function driverCell(iface: Iface): React.ReactNode {
  if (iface.driver === 'networkmanager') return <span className="mono">{iface.connection}</span>;
  return iface.driver;
}

function masterCell(iface: Iface): React.ReactNode {
  if (!iface.master) return iface.name;
  return <>{iface.name}<span className="muted"> → {iface.master}</span></>;
}

function IfaceTable({ rows, busy, post }: { rows: Iface[]; busy: string; post: Post }) {
  return (
    <table>
      <thead><tr>
        <th>interface</th><th>kind</th><th>managed by</th><th>addresses</th><th>state</th>
        <th>rx</th><th>tx</th><th>total ↓ / ↑</th><th>graph</th><th />
      </tr></thead>
      <tbody>
        {rows.map((iface) => (
          <tr key={iface.name}>
            <td className="mono">{masterCell(iface)}</td>
            <td>{iface.kind}</td>
            <td>{driverCell(iface)}</td>
            <td className="mono">{addrCell(iface)}</td>
            <td><span className="muted">{iface.state}</span></td>
            <td className="mono">{rate(iface.rxBps)}</td>
            <td className="mono">{rate(iface.txBps)}</td>
            <td className="mono muted">{bytes(iface.rxBytes)} / {bytes(iface.txBytes)}</td>
            <td style={{ width: 110 }}><Spark series={iface.series} /></td>
            <td style={{ textAlign: 'right' }}>
              {iface.driver === 'networkmanager' && REMOVABLE.test(iface.kind) && (
                <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy}
                  onClick={() => { if (confirm(`remove ${iface.name}?`)) void post('/api/host/iface', { op: 'delete', name: iface.name }, `delete ${iface.name}`); }}>
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
function ifaceBody(kind: string, form: IfaceDraft): Record<string, unknown> {
  return {
    kind, name: form.name, ports: form.ports, parent: form.parent,
    vlanId: form.vlanId ? Number(form.vlanId) : undefined, bondMode: form.bondMode,
    address: form.address || undefined,
    listenPort: form.listenPort ? Number(form.listenPort) : undefined,
    peerPublicKey: form.peerPublicKey || undefined, peerEndpoint: form.peerEndpoint || undefined,
    peerAllowedIps: form.peerAllowedIps || undefined,
  };
}

function PortsFields({ kind, form, setForm }: { kind: string; form: IfaceDraft; setForm: (value: IfaceDraft) => void }) {
  const enslaves = kind === 'bridge' || kind === 'bond' || kind === 'team';
  return (
    <>
      {enslaves && (
        <Field label="ports (comma)"><input style={{ width: 150 }} value={form.ports} onChange={(event) => setForm({ ...form, ports: event.target.value })} placeholder="enp3s0" className="mono" /></Field>
      )}
      {kind === 'vlan' && (<>
        <Field label="parent"><input style={{ width: 110 }} value={form.parent} onChange={(event) => setForm({ ...form, parent: event.target.value })} placeholder="enp2s0" className="mono" /></Field>
        <Field label="vlan id"><input style={{ width: 70 }} value={form.vlanId} onChange={(event) => setForm({ ...form, vlanId: event.target.value })} className="mono" /></Field>
      </>)}
      {kind === 'bond' && (
        <Field label="mode">
          <select value={form.bondMode} onChange={(event) => setForm({ ...form, bondMode: event.target.value })}>
            {BOND_MODES.map((mode) => <option key={mode}>{mode}</option>)}
          </select>
        </Field>
      )}
      {kind === 'vpn' && (<>
        <Field label="listen port"><input style={{ width: 80 }} value={form.listenPort} onChange={(event) => setForm({ ...form, listenPort: event.target.value })} className="mono" /></Field>
        <Field label="peer public key"><input style={{ width: 200 }} value={form.peerPublicKey} onChange={(event) => setForm({ ...form, peerPublicKey: event.target.value })} className="mono" placeholder="optional" /></Field>
        <Field label="endpoint"><input style={{ width: 150 }} value={form.peerEndpoint} onChange={(event) => setForm({ ...form, peerEndpoint: event.target.value })} className="mono" placeholder="host:port" /></Field>
        <Field label="allowed ips"><input style={{ width: 120 }} value={form.peerAllowedIps} onChange={(event) => setForm({ ...form, peerAllowedIps: event.target.value })} className="mono" placeholder="10.8.0.0/24" /></Field>
      </>)}
    </>
  );
}

function IfaceForm({ busy, post }: { busy: string; post: Post }) {
  const [kind, setKind] = useState('bridge');
  const [form, setForm] = useState<IfaceDraft>(EMPTY_IFACE);
  const create = async () => {
    const ok = await post('/api/host/iface', ifaceBody(kind, form), `create ${form.name}`);
    if (ok) setForm({ ...form, name: '', ports: '', parent: '', vlanId: '', address: '' });
  };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>add an interface</h3>
      <div className="row">
        <Field label="type">
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="bridge">bridge</option><option value="vlan">vlan</option>
            <option value="bond">bond</option><option value="team">team</option>
            <option value="vpn">vpn (wireguard)</option>
          </select>
        </Field>
        <Field label="name"><input style={{ width: 110 }} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="br1" className="mono" /></Field>
        <Field label="address (cidr, optional)">
          <input style={{ width: 140 }} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="10.9.0.1/24" className="mono" />
        </Field>
        <PortsFields kind={kind} form={form} setForm={setForm} />
        <button className="primary" disabled={!form.name || !!busy} onClick={create}>{busy ? <Ring size={11} /> : 'create'}</button>
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
  const shown = ifaces.filter((iface) => iface.driver !== 'unmanaged');
  const unmanaged = ifaces.filter((iface) => iface.driver === 'unmanaged');
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
