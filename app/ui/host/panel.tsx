'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/app/ui/toast';
import { Ring, Empty } from '@/app/ui/loaders';
import { bytes, rate, Field, Spark, usePoll } from './shared';

/** Admin console for the whole hypervisor, not just machina's own guests. */

type Owner = { id: string; name: string } | null;
type Vm = {
  name: string; state: string; persistent: boolean; autostart: boolean;
  vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number;
  instanceId: string | null; owner: Owner; system: boolean;
};
type NetHost = { mac: string; ip: string; name?: string };
type NetIp = { family: 'ipv4' | 'ipv6'; address: string; prefix: number; dhcp: { start: string; end: string } | null; hosts: NetHost[] };
type Net = { name: string; active: boolean; autostart: boolean; persistent: boolean; forward: string; bridge: string | null; domain: string | null; ips: NetIp[] };
type Pool = {
  name: string; type: string; state: 'running' | 'stopped'; autostart: boolean; persistent: boolean;
  path: string; capacityMb: number | null; allocationMb: number | null; availableMb: number | null;
};
type Iface = {
  name: string; kind: string; driver: 'networkmanager' | 'libvirt' | 'container' | 'unmanaged';
  connection: string | null; state: string; mac: string; mtu: number; addresses: string[];
  master: string | null; speedMbps: number | null; rxBytes: number; txBytes: number; rxBps: number; txBps: number;
  series: { t: number; rx: number; tx: number }[];
};
type Inv = {
  vms: Vm[]; vmsError: string | null; networks: Net[]; networksError: string | null;
  interfaces: Iface[];
  pools: Pool[];
  instances: { domain_name: string; id: string; plan_id: string; mac: string; ip: string; uid: string | null; uname: string | null; urole: string | null; balance_cents: number }[];
  users: { id: string; name: string; role: string; balance_cents: number }[];
  host: { hostname: string; cpus: number; load: number[]; memTotalMb: number; memFreeMb: number; uptimeSec: number; release: string };
};

const TABS = ['machines', 'networks', 'interfaces', 'pools', 'users', 'log'] as const;
type Tab = (typeof TABS)[number];

export function HostPanel() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('machines');
  const [owner, setOwner] = useState<string>('visible');
  const [busy, setBusy] = useState('');

  const inv = usePoll<Inv>(
    tab === 'interfaces' ? '/api/host?ifaces=1' : tab === 'pools' ? '/api/host?pools=1' : '/api/host',
    tab === 'interfaces' ? 5000 : 15_000,
  );
  const log = usePoll<{ rows: { id: string; ts: number; actor_name: string; action: string; target: string; detail: string }[] }>(
    '/api/host?log=1', 20_000, tab === 'log',
  );

  const d = inv.data;
  const roles = useMemo(() => new Map((d?.users ?? []).map((u) => [u.id, u.role])), [d?.users]);
  const isAdminOwner = (o: Owner) => !o || roles.get(o.id) === 'admin';

  const vms = (d?.vms ?? []).filter((v) => {
    if (owner === 'all') return true;
    if (owner !== 'visible') return v.owner?.id === owner;
    return v.system || isAdminOwner(v.owner);
  });

  async function post(url: string, body: Record<string, unknown>, label: string): Promise<boolean> {
    setBusy(label);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.err(j.error ?? `${label} failed`); return false; }
      toast.ok(j.result ? `${label}: ${j.result}` : `${label} done`);
      inv.reload();
      return true;
    } catch {
      toast.err(`${label}: could not reach the server`);
      return false;
    } finally {
      setBusy('');
    }
  }

  const vmPost = (name: string, body: Record<string, unknown>, label: string) => post('/api/host/vm', { name, ...body }, label);
  const netPost = (body: Record<string, unknown>, label: string) => post('/api/host/net', body, label);

  return (
    <>
      <h1>host</h1>
      <div className="sub">
        every libvirt domain and network on {d?.host.hostname ?? 'this machine'}
        {' · '}{d ? `${d.host.cpus} cores · load ${d.host.load[0].toFixed(2)} · ${bytes((d.host.memTotalMb - d.host.memFreeMb) * 1048576)} of ${bytes(d.host.memTotalMb * 1048576)} RAM used` : 'loading…'}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {inv.error && <div className="notice err" style={{ marginTop: 12 }}>{inv.error}</div>}
      {(d?.vmsError || d?.networksError) && (
        <div className="notice err" style={{ marginTop: 12 }}>{d?.vmsError ?? d?.networksError}</div>
      )}

      {tab === 'machines' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{vms.length} machine{vms.length === 1 ? '' : 's'}</h3>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ maxWidth: 240 }}>
              <option value="visible">system + admin-owned</option>
              <option value="all">everything</option>
              {(d?.users ?? []).filter((u) => (d?.instances ?? []).some((i) => i.uid === u.id)).map((u) => (
                <option key={u.id} value={u.id}>owner: {u.name}</option>
              ))}
            </select>
          </div>
          {!d && <Empty text="reading libvirt…" />}
          {d && vms.length === 0 && <Empty text="no machines in this view" />}
          {vms.length > 0 && (
            <table>
              <thead><tr>
                <th>name</th><th>state</th><th>owner</th><th>vCPU</th><th>RAM</th><th>boot</th><th>autostart</th><th />
              </tr></thead>
              <tbody>
                {vms.map((v) => {
                  const running = v.state === 'running';
                  return (
                    <tr key={v.name}>
                      <td className="mono"><Link href={`/host/${encodeURIComponent(v.name)}`}>{v.name}</Link></td>
                      <td><span className={`badge ${running ? 'running' : v.state === 'paused' ? 'stopped' : 'stopped'}`}>{v.state}</span></td>
                      <td>{v.system ? <span className="muted">system</span> : v.owner?.name}</td>
                      <td className="mono">{v.vcpu || '—'}{v.vcpuMax && v.vcpuMax !== v.vcpu ? ` / ${v.vcpuMax}` : ''}</td>
                      <td className="mono">{v.memMb ? `${Math.round(v.memMb / 1024)} GB` : '—'}</td>
                      <td>{v.persistent ? 'defined' : 'transient'}</td>
                      <td>{v.autostart ? 'yes' : <span className="muted">no</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button disabled={!!busy} onClick={() => vmPost(v.name, { op: 'power', action: running ? 'shutdown' : 'start' }, `${v.name} ${running ? 'shutdown' : 'start'}`)}>
                          {busy === `${v.name} ${running ? 'shutdown' : 'start'}` ? <Ring size={10} /> : running ? 'stop' : 'start'}
                        </button>
                        <Link href={`/host/${encodeURIComponent(v.name)}`} style={{ marginLeft: 8 }}>open</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'networks' && <Networks nets={d?.networks ?? []} instances={d?.instances ?? []} busy={busy} netPost={netPost} />}

      {tab === 'interfaces' && <Interfaces ifaces={d?.interfaces ?? []} busy={busy} post={post} />}

      {tab === 'pools' && <Pools pools={d?.pools ?? []} busy={busy} post={post} />}

      {tab === 'users' && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>accounts and their machines</h3>
          <div className="muted" style={{ marginBottom: 12 }}>
            machines owned by a non-admin account stay off the machines tab unless you pick that owner.
          </div>
          <table>
            <thead><tr><th>account</th><th>role</th><th>machines</th><th>balance</th><th /></tr></thead>
            <tbody>
              {(d?.users ?? []).map((u) => {
                const mine = (d?.instances ?? []).filter((i) => i.uid === u.id);
                return (
                  <tr key={u.id}>
                    <td className="mono">{u.name}</td>
                    <td>{u.role}</td>
                    <td className="mono">{mine.length}</td>
                    <td className="mono">${(u.balance_cents / 100).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {mine.length > 0 && (
                        <button onClick={() => { setOwner(u.id); setTab('machines'); }}>
                          view {mine.length}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'log' && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>host actions</h3>
          {!log.data && <Empty text="loading…" />}
          <table>
            <thead><tr><th>when</th><th>admin</th><th>action</th><th>target</th><th>detail</th></tr></thead>
            <tbody>
              {(log.data?.rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="muted mono">{new Date(r.ts).toLocaleString()}</td>
                  <td>{r.actor_name}</td>
                  <td className="mono">{r.action}</td>
                  <td className="mono">{r.target}</td>
                  <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }} className="muted">
                    {r.detail ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------- pools

function Pools({ pools, busy, post }: {
  pools: Pool[];
  busy: string;
  post: (url: string, b: Record<string, unknown>, label: string) => Promise<boolean>;
}) {
  if (!pools.length) return <div className="card" style={{ marginTop: 16 }}><Empty text="no storage pools defined" /></div>;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>storage pools</h3>
      <div className="muted" style={{ marginBottom: 12 }}>
        a dir pool does not notice files placed there by anything but libvirt until it rescans.
        refresh after copying a base image or an ISO into the directory.
      </div>
      <table>
        <thead><tr><th>pool</th><th>state</th><th>type</th><th>path</th><th>used</th><th>free</th><th>autostart</th><th /></tr></thead>
        <tbody>
          {pools.map((p) => (
            <tr key={p.name}>
              <td className="mono">{p.name}</td>
              <td><span className={`badge ${p.state === 'running' ? 'running' : 'stopped'}`}>{p.state}</span></td>
              <td>{p.type || '—'}</td>
              <td className="mono muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.path || '—'}</td>
              <td className="mono">
                {p.allocationMb != null ? bytes(p.allocationMb * 1048576) : '—'}
                {p.capacityMb != null ? <span className="muted"> / {bytes(p.capacityMb * 1048576)}</span> : null}
              </td>
              <td className="mono">{p.availableMb != null ? bytes(p.availableMb * 1048576) : '—'}</td>
              <td>{p.autostart ? 'yes' : <span className="muted">no</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button disabled={!!busy || p.state !== 'running'}
                  onClick={() => void post('/api/host', { op: 'poolRefresh', name: p.name }, `refresh ${p.name}`)}>
                  {busy === `refresh ${p.name}` ? <Ring size={10} /> : 'refresh'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ networks

function Networks({ nets, instances, busy, netPost }: {
  nets: Net[]; instances: Inv['instances']; busy: string;
  netPost: (b: Record<string, unknown>, label: string) => Promise<boolean>;
}) {
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [dhcp, setDhcp] = useState<string | null>(null);
  const [f, setF] = useState({
    name: '', forward: 'nat', bridge: '', v4: '', v4prefix: '24', dhcpStart: '', dhcpEnd: '',
    v6: '', v6prefix: '64', domain: '',
  });

  const submit = async () => {
    const ok = await netPost({
      op: 'create', name: f.name, forward: f.forward,
      bridge: f.bridge || undefined,
      domain: f.domain || undefined,
      ipv4: f.v4 ? { address: f.v4, prefix: Number(f.v4prefix), dhcpStart: f.dhcpStart, dhcpEnd: f.dhcpEnd } : undefined,
      ipv6: f.v6 ? { address: f.v6, prefix: Number(f.v6prefix) } : undefined,
    }, 'create network');
    if (ok) { setCreate(false); setF({ ...f, name: '', bridge: '', v4: '', dhcpStart: '', dhcpEnd: '', v6: '', domain: '' }); }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{nets.length} virtual networks</h3>
        <button className="primary" onClick={() => setCreate((v) => !v)}>{create ? 'close' : 'new network'}</button>
      </div>

      {create && (
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
      )}

      <table>
        <thead><tr>
          <th>name</th><th>state</th><th>mode</th><th>bridge</th><th>ipv4</th><th>ipv6</th><th>dhcp</th><th>auto</th><th />
        </tr></thead>
        <tbody>
          {nets.map((n) => {
            const v4 = n.ips.find((i) => i.family === 'ipv4');
            const v6 = n.ips.find((i) => i.family === 'ipv6');
            const reserved = n.ips.reduce((a, i) => a + i.hosts.length, 0);
            return (
              <tr key={n.name}>
                <td className="mono">{n.name}{n.domain ? <span className="muted"> · {n.domain}</span> : null}</td>
                <td><span className={`badge ${n.active ? 'running' : 'stopped'}`}>{n.active ? 'active' : 'inactive'}</span></td>
                <td>{n.forward}</td>
                <td className="mono muted">{n.bridge ?? '—'}</td>
                <td className="mono">{v4 ? `${v4.address}/${v4.prefix}` : <span className="muted">—</span>}</td>
                <td className="mono">{v6 ? `${v6.address}/${v6.prefix}` : <span className="muted">—</span>}</td>
                <td className="mono muted">
                  {v4?.dhcp ? `${v4.dhcp.start}–${v4.dhcp.end}` : reserved ? 'static only' : '—'}
                  {reserved ? ` · ${reserved} reserved` : ''}
                </td>
                <td>{n.autostart ? 'yes' : <span className="muted">no</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => netPost({ op: n.active ? 'stop' : 'start', name: n.name }, `${n.name} ${n.active ? 'stop' : 'start'}`)}>
                    {n.active ? 'stop' : 'start'}
                  </button>
                  <button style={{ marginLeft: 6 }} onClick={() => { setEdit(edit === n.name ? null : n.name); setDhcp(null); }}>edit</button>
                  <button style={{ marginLeft: 6 }} onClick={() => { setDhcp(dhcp === n.name ? null : n.name); setEdit(null); }}>dhcp</button>
                  <button style={{ marginLeft: 6, color: 'var(--danger, #f87171)' }} onClick={() => {
                    if (confirm(`delete network ${n.name}? running guests on it lose their link.`)) void netPost({ op: 'delete', name: n.name }, `delete ${n.name}`);
                  }}>delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {edit && (() => {
        const n = nets.find((x) => x.name === edit);
        if (!n) return null;
        return <NetEdit net={n} busy={busy} netPost={netPost} onDone={() => setEdit(null)} />;
      })()}

      {dhcp && (() => {
        const n = nets.find((x) => x.name === dhcp);
        if (!n) return null;
        return <DhcpPanel net={n} instances={instances} busy={busy} netPost={netPost} />;
      })()}
    </div>
  );
}

function NetEdit({ net, busy, netPost, onDone }: {
  net: Net; busy: string; onDone: () => void;
  netPost: (b: Record<string, unknown>, label: string) => Promise<boolean>;
}) {
  const v4 = net.ips.find((i) => i.family === 'ipv4');
  const v6 = net.ips.find((i) => i.family === 'ipv6');
  const [a, setA] = useState(v4?.address ?? '');
  const [p, setP] = useState(String(v4?.prefix ?? 24));
  const [ds, setDs] = useState(v4?.dhcp?.start ?? '');
  const [de, setDe] = useState(v4?.dhcp?.end ?? '');
  const [a6, setA6] = useState(v6?.address ?? '');
  const [p6, setP6] = useState(String(v6?.prefix ?? 64));
  const [auto, setAuto] = useState(net.autostart);

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
        <button className="primary" disabled={!!busy} onClick={async () => {
          const ok = await netPost({
            op: 'update', name: net.name, autostart: auto,
            ipv4: a ? { address: a, prefix: Number(p), dhcpStart: ds, dhcpEnd: de } : null,
            ipv6: a6 ? { address: a6, prefix: Number(p6) } : null,
          }, `update ${net.name}`);
          if (ok) onDone();
        }}>{busy ? <Ring size={11} /> : 'save'}</button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Saved as configuration. Address changes apply when the network is restarted; DHCP reservations do not need a restart.
      </div>
    </div>
  );
}

function DhcpPanel({ net, instances, busy, netPost }: {
  net: Net; instances: Inv['instances']; busy: string;
  netPost: (b: Record<string, unknown>, label: string) => Promise<boolean>;
}) {
  const [mac, setMac] = useState('');
  const [ip, setIp] = useState('');
  const [hostname, setHostname] = useState('');
  const v4 = net.ips.find((i) => i.family === 'ipv4');
  const hosts = net.ips.flatMap((i) => i.hosts.map((h) => ({ ...h, family: i.family })));

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="mono">{net.name} · reservations</strong>
        <span className="muted">static leases for {v4?.dhcp ? `${v4.dhcp.start}–${v4.dhcp.end}` : 'this network'}</span>
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
          <select value="" onChange={(e) => {
            const i = instances.find((x) => x.id === e.target.value);
            if (i) { setMac(i.mac); setHostname(i.domain_name); }
          }} style={{ maxWidth: 210 }}>
            <option value="">pick a machina VM…</option>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.domain_name} · {i.ip}</option>)}
          </select>
        </Field>
        <Field label="mac"><input style={{ width: 150 }} value={mac} onChange={(e) => setMac(e.target.value)} className="mono" placeholder="52:54:00:.." /></Field>
        <Field label="ip"><input style={{ width: 130 }} value={ip} onChange={(e) => setIp(e.target.value)} className="mono" placeholder="10.9.0.50" /></Field>
        <Field label="hostname"><input style={{ width: 130 }} value={hostname} onChange={(e) => setHostname(e.target.value)} /></Field>
        <button className="primary" disabled={!mac || !ip || !!busy} onClick={async () => {
          const ok = await netPost({ op: 'dhcpHost', name: net.name, action: 'add', mac, ip, hostname }, 'add reservation');
          if (ok) { setMac(''); setIp(''); setHostname(''); }
        }}>add</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- interfaces

function Interfaces({ ifaces, busy, post }: {
  ifaces: Iface[]; busy: string;
  post: (url: string, b: Record<string, unknown>, label: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState('bridge');
  const [f, setF] = useState({ name: '', ports: '', parent: '', vlanId: '', bondMode: 'active-backup', address: '', listenPort: '51820', peerPublicKey: '', peerEndpoint: '', peerAllowedIps: '' });

  const shown = ifaces.filter((i) => i.driver !== 'unmanaged');
  const unmanaged = ifaces.filter((i) => i.driver === 'unmanaged');

  const table = (rows: Iface[]) => (
    <table>
      <thead><tr>
        <th>interface</th><th>kind</th><th>managed by</th><th>addresses</th><th>state</th>
        <th>rx</th><th>tx</th><th>total ↓ / ↑</th><th>graph</th><th />
      </tr></thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.name}>
            <td className="mono">{i.name}{i.master ? <span className="muted"> → {i.master}</span> : null}</td>
            <td>{i.kind}</td>
            <td>{i.driver === 'networkmanager' ? <span className="mono">{i.connection}</span> : i.driver}</td>
            <td className="mono">{i.addresses.length ? i.addresses.join(' · ') : <span className="muted">none</span>}</td>
            <td><span className="muted">{i.state}</span></td>
            <td className="mono">{rate(i.rxBps)}</td>
            <td className="mono">{rate(i.txBps)}</td>
            <td className="mono muted">{bytes(i.rxBytes)} / {bytes(i.txBytes)}</td>
            <td style={{ width: 110 }}><Spark series={i.series} /></td>
            <td style={{ textAlign: 'right' }}>
              {i.driver === 'networkmanager' && /bridge|vlan|bond|team|wireguard/.test(i.kind) && (
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

  return (
    <>
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
          {(kind === 'bridge' || kind === 'bond' || kind === 'team') && (
            <Field label="ports (comma)"><input style={{ width: 150 }} value={f.ports} onChange={(e) => setF({ ...f, ports: e.target.value })} placeholder="enp3s0" className="mono" /></Field>
          )}
          {kind === 'vlan' && (<>
            <Field label="parent"><input style={{ width: 110 }} value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })} placeholder="enp2s0" className="mono" /></Field>
            <Field label="vlan id"><input style={{ width: 70 }} value={f.vlanId} onChange={(e) => setF({ ...f, vlanId: e.target.value })} className="mono" /></Field>
          </>)}
          {kind === 'bond' && (
            <Field label="mode">
              <select value={f.bondMode} onChange={(e) => setF({ ...f, bondMode: e.target.value })}>
                {['active-backup', 'balance-rr', 'balance-xor', '802.3ad', 'balance-tlb', 'balance-alb'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          )}
          {kind === 'vpn' && (<>
            <Field label="listen port"><input style={{ width: 80 }} value={f.listenPort} onChange={(e) => setF({ ...f, listenPort: e.target.value })} className="mono" /></Field>
            <Field label="peer public key"><input style={{ width: 200 }} value={f.peerPublicKey} onChange={(e) => setF({ ...f, peerPublicKey: e.target.value })} className="mono" placeholder="optional" /></Field>
            <Field label="endpoint"><input style={{ width: 150 }} value={f.peerEndpoint} onChange={(e) => setF({ ...f, peerEndpoint: e.target.value })} className="mono" placeholder="host:port" /></Field>
            <Field label="allowed ips"><input style={{ width: 120 }} value={f.peerAllowedIps} onChange={(e) => setF({ ...f, peerAllowedIps: e.target.value })} className="mono" placeholder="10.8.0.0/24" /></Field>
          </>)}
          <button className="primary" disabled={!f.name || !!busy} onClick={async () => {
            const ok = await post('/api/host/iface', {
              kind, name: f.name, ports: f.ports, parent: f.parent,
              vlanId: f.vlanId ? Number(f.vlanId) : undefined, bondMode: f.bondMode,
              address: f.address || undefined,
              listenPort: f.listenPort ? Number(f.listenPort) : undefined,
              peerPublicKey: f.peerPublicKey || undefined, peerEndpoint: f.peerEndpoint || undefined,
              peerAllowedIps: f.peerAllowedIps || undefined,
            }, `create ${f.name}`);
            if (ok) setF({ ...f, name: '', ports: '', parent: '', vlanId: '', address: '' });
          }}>{busy ? <Ring size={11} /> : 'create'}</button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          New devices only — existing connections are never edited from here, and an uplink that has an address is refused as a port.
          Leave the address blank for a device that just carries traffic (a bridge or bond for VMs); give it a CIDR to address it.
          Team needs teamd on the host; if it is missing the error says so.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>{shown.length} interfaces</h3>
        {shown.length === 0 ? <Empty text="none" /> : table(shown)}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>{unmanaged.length} unmanaged</h3>
        <div className="muted" style={{ marginBottom: 8 }}>
          Present at the kernel with nothing managing them. They work now and will not survive a reboot.
        </div>
        {unmanaged.length === 0 ? <Empty text="none" /> : table(unmanaged)}
      </div>
    </>
  );
}
