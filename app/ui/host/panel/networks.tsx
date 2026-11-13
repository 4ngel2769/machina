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
function createBody(f: NetForm): Record<string, unknown> {
  return {
    op: 'create', name: f.name, forward: f.forward,
    bridge: f.bridge || undefined,
    domain: f.domain || undefined,
    ipv4: f.v4 ? { address: f.v4, prefix: Number(f.v4prefix), dhcpStart: f.dhcpStart, dhcpEnd: f.dhcpEnd } : undefined,
    ipv6: f.v6 ? { address: f.v6, prefix: Number(f.v6prefix) } : undefined,
  };
}

function NetCreate({ busy, netPost, onDone }: {
  busy: string; netPost: NetPost; onDone: () => void;
}) {
  const [f, setF] = useState<NetForm>(EMPTY_FORM);
  const submit = async () => {
    const ok = await netPost(createBody(f), 'create network');
    if (!ok) return;
    setF({ ...EMPTY_FORM });
    onDone();
  };
  return (
    <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14, marginBottom: 10 }}>
      <div className="row">
        <Field label="name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="lab-net" /></Field>
        <Field label="mode">
          <select value={f.forward} onChange={(e) => setF({ ...f, forward: e.target.value })}>
            <option value="nat">nat</option><option value="route">routed</option>
            <option value="bridge">bridged</option><option value="isolated">isolated</option>
            <option value="open">open</option>
          </select>
        </Field>
        {f.forward === 'bridge' && (
          <Field label="host bridge"><input value={f.bridge} onChange={(e) => setF({ ...f, bridge: e.target.value })} placeholder="br0" /></Field>
        )}
        <Field label="ipv4 / prefix">
          <div style={{ display: 'flex', gap: 4 }}>
            <input style={{ width: 128 }} value={f.v4} onChange={(e) => setF({ ...f, v4: e.target.value })} placeholder="10.9.0.1" className="mono" />
            <input style={{ width: 52 }} value={f.v4prefix} onChange={(e) => setF({ ...f, v4prefix: e.target.value })} className="mono" />
          </div>
        </Field>
        <Field label="dhcp range"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 118 }} value={f.dhcpStart} onChange={(e) => setF({ ...f, dhcpStart: e.target.value })} placeholder=".100" className="mono" />
          <input style={{ width: 118 }} value={f.dhcpEnd} onChange={(e) => setF({ ...f, dhcpEnd: e.target.value })} placeholder=".200" className="mono" />
        </div></Field>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="ipv6 / prefix"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 190 }} value={f.v6} onChange={(e) => setF({ ...f, v6: e.target.value })} placeholder="fd00:9::1" className="mono" />
          <input style={{ width: 52 }} value={f.v6prefix} onChange={(e) => setF({ ...f, v6prefix: e.target.value })} className="mono" />
        </div></Field>
        <Field label="dns domain"><input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="lab.internal" /></Field>
        <button className="primary" disabled={!f.name || !!busy} onClick={submit}>{busy === 'create network' ? <Ring size={11} /> : 'create'}</button>
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

function NetRow({ n, busy, netPost, onEdit, onDhcp }: {
  n: Net; busy: string; netPost: NetPost;
  onEdit: () => void; onDhcp: () => void;
}) {
  const v4 = n.ips.find((i) => i.family === 'ipv4');
  const v6 = n.ips.find((i) => i.family === 'ipv6');
  const reserved = n.ips.reduce((a, i) => a + i.hosts.length, 0);
  const action = n.active ? 'stop' : 'start';
  const del = () => {
    if (confirm(`delete network ${n.name}? running guests on it lose their link.`)) {
      void netPost({ op: 'delete', name: n.name }, `delete ${n.name}`);
    }
  };
  return (
    <tr key={n.name}>
      <td className="mono">{n.name}{n.domain ? <span className="muted"> · {n.domain}</span> : null}</td>
      <td><span className={`badge ${n.active ? 'running' : 'stopped'}`}>{n.active ? 'active' : 'inactive'}</span></td>
      <td>{n.forward}</td>
      <td className="mono muted">{n.bridge ?? '—'}</td>
      <td className="mono">{addrCell(v4)}</td>
      <td className="mono">{addrCell(v6)}</td>
      <td className="mono muted">
        {dhcpCell(v4, reserved)}
        {reserved ? ` · ${reserved} reserved` : ''}
      </td>
      <td>{n.autostart ? 'yes' : <span className="muted">no</span>}</td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button onClick={() => netPost({ op: action, name: n.name }, `${n.name} ${action}`)}>{action}</button>
        <button style={{ marginLeft: 6 }} onClick={onEdit}>edit</button>
        <button style={{ marginLeft: 6 }} onClick={onDhcp}>dhcp</button>
        <button style={{ marginLeft: 6, color: 'var(--danger, #f87171)' }} onClick={del}>delete</button>
      </td>
    </tr>
  );
}

/** First address block of that family, or null. */
function family(net: Net, fam: 'ipv4' | 'ipv6'): NetIp | null {
  for (const ip of net.ips) if (ip.family === fam) return ip;
  return null;
}

/** Form defaults from whatever the network currently has. */
function editDefaults(net: Net): {
  a: string; p: string; ds: string; de: string; a6: string; p6: string;
} {
  const v4 = family(net, 'ipv4');
  const v6 = family(net, 'ipv6');
  const dhcp = v4 ? v4.dhcp : null;
  return {
    a: v4 ? v4.address : '',
    p: String(v4 ? v4.prefix : 24),
    ds: dhcp ? dhcp.start : '',
    de: dhcp ? dhcp.end : '',
    a6: v6 ? v6.address : '',
    p6: String(v6 ? v6.prefix : 64),
  };
}

function NetEdit({ net, busy, netPost, onDone }: {
  net: Net; busy: string; onDone: () => void; netPost: NetPost;
}) {
  const init = editDefaults(net);
  const [a, setA] = useState(init.a);
  const [p, setP] = useState(init.p);
  const [ds, setDs] = useState(init.ds);
  const [de, setDe] = useState(init.de);
  const [a6, setA6] = useState(init.a6);
  const [p6, setP6] = useState(init.p6);
  const [auto, setAuto] = useState(net.autostart);
  const save = async () => {
    const ok = await netPost({
      op: 'update', name: net.name, autostart: auto,
      ipv4: a ? { address: a, prefix: Number(p), dhcpStart: ds, dhcpEnd: de } : null,
      ipv6: a6 ? { address: a6, prefix: Number(p6) } : null,
    }, `update ${net.name}`);
    if (ok) onDone();
  };
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div className="row">
        <strong className="mono">{net.name}</strong>
        <Field label="ipv4 / prefix"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 128 }} value={a} onChange={(e) => setA(e.target.value)} className="mono" />
          <input style={{ width: 52 }} value={p} onChange={(e) => setP(e.target.value)} className="mono" />
        </div></Field>
        <Field label="dhcp range"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 118 }} value={ds} onChange={(e) => setDs(e.target.value)} className="mono" />
          <input style={{ width: 118 }} value={de} onChange={(e) => setDe(e.target.value)} className="mono" />
        </div></Field>
        <Field label="ipv6 / prefix"><div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 190 }} value={a6} onChange={(e) => setA6(e.target.value)} className="mono" />
          <input style={{ width: 52 }} value={p6} onChange={(e) => setP6(e.target.value)} className="mono" />
        </div></Field>
        <Field label="autostart">
          <select value={auto ? 'on' : 'off'} onChange={(e) => setAuto(e.target.value === 'on')}>
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
  const v4 = net.ips.find((i) => i.family === 'ipv4');
  const hosts = net.ips.flatMap((i) => i.hosts.map((h) => ({ ...h, family: i.family })));
  const pick = (id: string) => {
    const i = instances.find((x) => x.id === id);
    if (!i) return;
    setMac(i.mac);
    setHostname(i.domain_name);
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
            {hosts.map((h) => (
              <tr key={h.mac + h.ip}>
                <td className="mono">{h.mac}</td>
                <td className="mono">{h.ip}</td>
                <td>{h.name ?? <span className="muted">—</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => netPost({ op: 'dhcpHost', name: net.name, action: 'remove', mac: h.mac, ip: h.ip }, 'remove reservation')}>remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <Field label="machine (optional)">
          <select value="" onChange={(e) => pick(e.target.value)} style={{ maxWidth: 210 }}>
            <option value="">pick a machina VM…</option>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.domain_name} · {i.ip}</option>)}
          </select>
        </Field>
        <Field label="mac"><input style={{ width: 150 }} value={mac} onChange={(e) => setMac(e.target.value)} className="mono" placeholder="52:54:00:.." /></Field>
        <Field label="ip"><input style={{ width: 130 }} value={ip} onChange={(e) => setIp(e.target.value)} className="mono" placeholder="10.9.0.50" /></Field>
        <Field label="hostname"><input style={{ width: 130 }} value={hostname} onChange={(e) => setHostname(e.target.value)} /></Field>
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
  const editing = nets.find((x) => x.name === edit);
  const leasing = nets.find((x) => x.name === dhcp);
  const openEdit = (name: string) => { setEdit(edit === name ? null : name); setDhcp(null); };
  const openDhcp = (name: string) => { setDhcp(dhcp === name ? null : name); setEdit(null); };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{nets.length} virtual networks</h3>
        <button className="primary" onClick={() => setCreate((v) => !v)}>{create ? 'close' : 'new network'}</button>
      </div>

      {create && <NetCreate busy={busy} netPost={netPost} onDone={() => setCreate(false)} />}

      {nets.length === 0 ? <Empty text="no networks" /> : (
        <table>
          <thead><tr>
            <th>name</th><th>state</th><th>mode</th><th>bridge</th><th>ipv4</th><th>ipv6</th><th>dhcp</th><th>auto</th><th />
          </tr></thead>
          <tbody>
            {nets.map((n) => (
              <NetRow
                key={n.name} n={n} busy={busy} netPost={netPost}
                onEdit={() => openEdit(n.name)} onDhcp={() => openDhcp(n.name)}
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
