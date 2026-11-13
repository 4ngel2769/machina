/** Networks tab: libvirt virtual networks, their address blocks and DHCP leases. */

'use client';

import { useState } from 'react';
import { Ring, Empty } from '@/app/ui/loaders';
import { Field } from '../shared';
import type { InstRow, Net, NetIp, NetPost } from './types';

const EMPTY_FORM = {
  name: '', forward: 'nat', bridge: '', v4: '', v4prefix: '24', dhcpStart: '', dhcpEnd: '',
  v6: '', v6prefix: '64', domain: '',
};

/** Draft network form state, all strings because it is bound to inputs. */
type NetForm = typeof EMPTY_FORM;

/** ipv4/ipv6 blocks out of the form, undefined when the address is blank. */
function createBody(form: NetForm): Record<string, unknown> {
  return {
    op: 'create', name: form.name, forward: form.forward,
    bridge: form.bridge || undefined,
    domain: form.domain || undefined,
    ipv4: form.v4 ? { address: form.v4, prefix: Number(form.v4prefix), dhcpStart: form.dhcpStart, dhcpEnd: form.dhcpEnd } : undefined,
    ipv6: form.v6 ? { address: form.v6, prefix: Number(form.v6prefix) } : undefined,
  };
}

function NetCreate({ busy, netPost, onDone }: {
  busy: string; netPost: NetPost; onDone: () => void;
}) {
  const [form, setForm] = useState<NetForm>(EMPTY_FORM);
  const submit = async () => {
    const ok = await netPost(createBody(form), 'create network');
    if (!ok) return;
    setForm({ ...EMPTY_FORM });
    onDone();
  };
  return (
    <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14, marginBottom: 10 }}>
      <div className="row">
        <Field label="name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="lab-net" /></Field>
        <Field label="mode">
          <select value={form.forward} onChange={(event) => setForm({ ...form, forward: event.target.value })}>
            <option value="nat">nat</option><option value="route">routed</option>
            <option value="bridge">bridged</option><option value="isolated">isolated</option>
            <option value="open">open</option>
          </select>
        </Field>
        {form.forward === 'bridge' && (
          <Field label="host bridge"><input value={form.bridge} onChange={(event) => setForm({ ...form, bridge: event.target.value })} placeholder="br0" /></Field>
        )}
        <Field label="ipv4 / prefix">
          <div style={{ display: 'flex', gap: 4 }}>
            <input style={{ width: 128 }} value={form.v4} onChange={(event) => setForm({ ...form, v4: event.target.value })} placeholder="10.9.0.1" className="mono" />
            <input style={{ width: 52 }} value={form.v4prefix} onChange={(event) => setForm({ ...form, v4prefix: event.target.value })} className="mono" />
          </div>
        </Field>
        <Field label="dhcp range"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 118 }} value={form.dhcpStart} onChange={(event) => setForm({ ...form, dhcpStart: event.target.value })} placeholder=".100" className="mono" />
          <input style={{ width: 118 }} value={form.dhcpEnd} onChange={(event) => setForm({ ...form, dhcpEnd: event.target.value })} placeholder=".200" className="mono" />
        </div></Field>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="ipv6 / prefix"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 190 }} value={form.v6} onChange={(event) => setForm({ ...form, v6: event.target.value })} placeholder="fd00:9::1" className="mono" />
          <input style={{ width: 52 }} value={form.v6prefix} onChange={(event) => setForm({ ...form, v6prefix: event.target.value })} className="mono" />
        </div></Field>
        <Field label="dns domain"><input value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} placeholder="lab.internal" /></Field>
        <button className="primary" disabled={!form.name || !!busy} onClick={submit}>{busy === 'create network' ? <Ring size={11} /> : 'create'}</button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        A DHCP range needs an ipv4 address. Leave the range blank for a routed network without dnsmasq.
      </div>
    </div>
  );
}

function addrCell(ip: NetIp | undefined): React.ReactNode {
  if (!ip) return <span className="muted">—</span>;
  return `${ip.address}/${ip.prefix}`;
}

/** DHCP range when there is one, otherwise whether any lease is reserved. */
function dhcpCell(v4: NetIp | undefined, reserved: number): string {
  if (v4?.dhcp) return `${v4.dhcp.start}–${v4.dhcp.end}`;
  return reserved ? 'static only' : '—';
}

function NetRow({ net, busy, netPost, onEdit, onDhcp }: {
  net: Net; busy: string; netPost: NetPost;
  onEdit: () => void; onDhcp: () => void;
}) {
  const v4 = net.ips.find((netIp) => netIp.family === 'ipv4');
  const v6 = net.ips.find((netIp) => netIp.family === 'ipv6');
  const reserved = net.ips.reduce((count, netIp) => count + netIp.hosts.length, 0);
  const action = net.active ? 'stop' : 'start';
  const del = () => {
    if (confirm(`delete network ${net.name}? running guests on it lose their link.`)) {
      void netPost({ op: 'delete', name: net.name }, `delete ${net.name}`);
    }
  };
  return (
    <tr key={net.name}>
      <td className="mono">{net.name}{net.domain ? <span className="muted"> · {net.domain}</span> : null}</td>
      <td><span className={`badge ${net.active ? 'running' : 'stopped'}`}>{net.active ? 'active' : 'inactive'}</span></td>
      <td>{net.forward}</td>
      <td className="mono muted">{net.bridge ?? '—'}</td>
      <td className="mono">{addrCell(v4)}</td>
      <td className="mono">{addrCell(v6)}</td>
      <td className="mono muted">
        {dhcpCell(v4, reserved)}
        {reserved ? ` · ${reserved} reserved` : ''}
      </td>
      <td>{net.autostart ? 'yes' : <span className="muted">no</span>}</td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button onClick={() => netPost({ op: action, name: net.name }, `${net.name} ${action}`)}>{action}</button>
        <button style={{ marginLeft: 6 }} onClick={onEdit}>edit</button>
        <button style={{ marginLeft: 6 }} onClick={onDhcp}>dhcp</button>
        <button style={{ marginLeft: 6, color: 'var(--danger, #f87171)' }} onClick={del}>delete</button>
      </td>
    </tr>
  );
}

/** First address block of that family, or null. */
function family(net: Net, fam: 'ipv4' | 'ipv6'): NetIp | null {
  for (const netIp of net.ips) if (netIp.family === fam) return netIp;
  return null;
}

/** Form defaults from whatever the network currently has. */
function editDefaults(net: Net): {
  address: string; prefix: string; dhcpStart: string; dhcpEnd: string; address6: string; prefix6: string;
} {
  const v4 = family(net, 'ipv4');
  const v6 = family(net, 'ipv6');
  const dhcp = v4 ? v4.dhcp : null;
  return {
    address: v4 ? v4.address : '',
    prefix: String(v4 ? v4.prefix : 24),
    dhcpStart: dhcp ? dhcp.start : '',
    dhcpEnd: dhcp ? dhcp.end : '',
    address6: v6 ? v6.address : '',
    prefix6: String(v6 ? v6.prefix : 64),
  };
}

function NetEdit({ net, busy, netPost, onDone }: {
  net: Net; busy: string; onDone: () => void; netPost: NetPost;
}) {
  const init = editDefaults(net);
  const [address, setAddress] = useState(init.address);
  const [prefix, setPrefix] = useState(init.prefix);
  const [dhcpStart, setDhcpStart] = useState(init.dhcpStart);
  const [dhcpEnd, setDhcpEnd] = useState(init.dhcpEnd);
  const [address6, setAddress6] = useState(init.address6);
  const [prefix6, setPrefix6] = useState(init.prefix6);
  const [autostart, setAutostart] = useState(net.autostart);
  const save = async () => {
    const ok = await netPost({
      op: 'update', name: net.name, autostart,
      ipv4: address ? { address, prefix: Number(prefix), dhcpStart, dhcpEnd } : null,
      ipv6: address6 ? { address: address6, prefix: Number(prefix6) } : null,
    }, `update ${net.name}`);
    if (ok) onDone();
  };
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div className="row">
        <strong className="mono">{net.name}</strong>
        <Field label="ipv4 / prefix"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 128 }} value={address} onChange={(event) => setAddress(event.target.value)} className="mono" />
          <input style={{ width: 52 }} value={prefix} onChange={(event) => setPrefix(event.target.value)} className="mono" />
        </div></Field>
        <Field label="dhcp range"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 118 }} value={dhcpStart} onChange={(event) => setDhcpStart(event.target.value)} className="mono" />
          <input style={{ width: 118 }} value={dhcpEnd} onChange={(event) => setDhcpEnd(event.target.value)} className="mono" />
        </div></Field>
        <Field label="ipv6 / prefix"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 190 }} value={address6} onChange={(event) => setAddress6(event.target.value)} className="mono" />
          <input style={{ width: 52 }} value={prefix6} onChange={(event) => setPrefix6(event.target.value)} className="mono" />
        </div></Field>
        <Field label="autostart">
          <select value={autostart ? 'on' : 'off'} onChange={(event) => setAutostart(event.target.value === 'on')}>
            <option value="on">on</option><option value="off">off</option>
          </select>
        </Field>
        <button className="primary" disabled={!!busy} onClick={save}>{busy ? <Ring size={11} /> : 'save'}</button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Saved as configuration. Address changes apply when the network is restarted; DHCP reservations do not need a restart.
      </div>
    </div>
  );
}

function DhcpPanel({ net, instances, busy, netPost }: {
  net: Net; instances: InstRow[]; busy: string; netPost: NetPost;
}) {
  const [mac, setMac] = useState('');
  const [ip, setIp] = useState('');
  const [hostname, setHostname] = useState('');
  const v4 = net.ips.find((netIp) => netIp.family === 'ipv4');
  const hosts = net.ips.flatMap((netIp) => netIp.hosts.map((host) => ({ ...host, family: netIp.family })));
  const pick = (id: string) => {
    const instance = instances.find((candidate) => candidate.id === id);
    if (!instance) return;
    setMac(instance.mac);
    setHostname(instance.domain_name);
  };
  const add = async () => {
    const ok = await netPost({ op: 'dhcpHost', name: net.name, action: 'add', mac, ip, hostname }, 'add reservation');
    if (ok) { setMac(''); setIp(''); setHostname(''); }
  };
  const lease = v4?.dhcp ? `${v4.dhcp.start}–${v4.dhcp.end}` : 'this network';
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="mono">{net.name} · reservations</strong>
        <span className="muted">static leases for {lease}</span>
      </div>
      {hosts.length === 0 && <div className="muted" style={{ margin: '10px 0' }}>no static leases yet</div>}
      {hosts.length > 0 && (
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>mac</th><th>ip</th><th>hostname</th><th /></tr></thead>
          <tbody>
            {hosts.map((host) => (
              <tr key={host.mac + host.ip}>
                <td className="mono">{host.mac}</td>
                <td className="mono">{host.ip}</td>
                <td>{host.name ?? <span className="muted">—</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => netPost({ op: 'dhcpHost', name: net.name, action: 'remove', mac: host.mac, ip: host.ip }, 'remove reservation')}>remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <Field label="machine (optional)">
          <select value="" onChange={(event) => pick(event.target.value)} style={{ maxWidth: 210 }}>
            <option value="">pick a machina VM…</option>
            {instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.domain_name} · {instance.ip}</option>)}
          </select>
        </Field>
        <Field label="mac"><input style={{ width: 150 }} value={mac} onChange={(event) => setMac(event.target.value)} className="mono" placeholder="52:54:00:.." /></Field>
        <Field label="ip"><input style={{ width: 130 }} value={ip} onChange={(event) => setIp(event.target.value)} className="mono" placeholder="10.9.0.50" /></Field>
        <Field label="hostname"><input style={{ width: 130 }} value={hostname} onChange={(event) => setHostname(event.target.value)} /></Field>
        <button className="primary" disabled={!mac || !ip || !!busy} onClick={add}>add</button>
      </div>
    </div>
  );
}

export function Networks({ nets, instances, busy, netPost }: {
  nets: Net[]; instances: InstRow[]; busy: string; netPost: NetPost;
}) {
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [dhcp, setDhcp] = useState<string | null>(null);
  const editing = nets.find((net) => net.name === edit);
  const leasing = nets.find((net) => net.name === dhcp);
  const openEdit = (name: string) => { setEdit(edit === name ? null : name); setDhcp(null); };
  const openDhcp = (name: string) => { setDhcp(dhcp === name ? null : name); setEdit(null); };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{nets.length} virtual networks</h3>
        <button className="primary" onClick={() => setCreate((open) => !open)}>{create ? 'close' : 'new network'}</button>
      </div>

      {create && <NetCreate busy={busy} netPost={netPost} onDone={() => setCreate(false)} />}

      {nets.length === 0 ? <Empty icon="network" text="no networks" /> : (
        <table>
          <thead><tr>
            <th>name</th><th>state</th><th>mode</th><th>bridge</th><th>ipv4</th><th>ipv6</th><th>dhcp</th><th>auto</th><th />
          </tr></thead>
          <tbody>
            {nets.map((net) => (
              <NetRow
                key={net.name} net={net} busy={busy} netPost={netPost}
                onEdit={() => openEdit(net.name)} onDhcp={() => openDhcp(net.name)}
              />
            ))}
          </tbody>
        </table>
      )}

      {editing && <NetEdit net={editing} busy={busy} netPost={netPost} onDone={() => setEdit(null)} />}
      {leasing && <DhcpPanel net={leasing} instances={instances} busy={busy} netPost={netPost} />}
    </div>
  );
}
