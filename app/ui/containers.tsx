'use client';

import { Fragment, useMemo, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { Empty } from '@/app/ui/loaders';
import { bytes, usePoll } from '@/app/ui/host/shared';

/**
 * Docker tab for the admin console.
 *
 * Grouped by compose project rather than a flat list, because a host with 60
 * containers is not 60 things to know about: it is 12 stacks, one of which is
 * unhealthy. Health, restart count and live usage answer the only question the
 * page exists for — what is broken right now.
 */

type Container = {
  id: string; name: string; image: string; state: string; status: string;
  health: string | null; ports: string; project: string | null; service: string | null;
  createdAt: string; cpuPct: number | null; memMb: number | null; memLimitMb: number | null;
  memPct: number | null; pids: number | null; managed: boolean;
};
type Payload = { available: boolean; containers: Container[]; error: string | null };

const FILTERS = ['all', 'running', 'unhealthy', 'stopped'] as const;
type Filter = (typeof FILTERS)[number];

const badge = (c: Container): string => {
  if (c.health === 'unhealthy') return 'error';
  if (c.state === 'running') return c.health === 'starting' ? 'queued' : 'running';
  if (c.state === 'restarting') return 'provisioning';
  if (c.state === 'paused') return 'suspended';
  return 'stopped';
};

const match = (c: Container, f: Filter): boolean => {
  if (f === 'all') return true;
  if (f === 'unhealthy') return c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'dead';
  if (f === 'running') return c.state === 'running';
  return c.state !== 'running';
};

export function ContainersPanel() {
  const toast = useToast();
  const list = usePoll<Payload>('/api/containers', 10_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newImage, setNewImage] = useState('');
  const [newMemory, setNewMemory] = useState('512');
  const [newCpus, setNewCpus] = useState('1');
  const [newPorts, setNewPorts] = useState('');

  const all = list.data?.containers ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((c) => match(c, filter) && (
      !needle
      || c.name.toLowerCase().includes(needle)
      || c.image.toLowerCase().includes(needle)
      || (c.project ?? '').toLowerCase().includes(needle)
      || (c.service ?? '').toLowerCase().includes(needle)
    ));
  }, [all, filter, q]);

  const groups = useMemo(() => {
    const m = new Map<string, Container[]>();
    for (const c of shown) {
      const k = c.project ?? '(standalone)';
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const running = all.filter((c) => c.state === 'running').length;
  const broken = all.filter((c) => c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'dead').length;

  async function act(c: Container, action: string) {
    setBusy(`${c.id}:${action}`);
    try {
      const r = await fetch(`/api/containers/${c.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.err(j.error ?? `${action} failed`);
      else toast.ok(`${c.name}: ${action}`);
      list.reload();
    } catch {
      toast.err(`${action}: could not reach the server`);
    } finally {
      setBusy('');
    }
  }

  async function showLogs(c: Container) {
    if (open === c.id) { setOpen(null); return; }
    setOpen(c.id);
    if (logs[c.id]) return;
    try {
      const r = await fetch(`/api/containers/${c.id}?tail=200`, { cache: 'no-store' });
      const j = await r.json();
      setLogs((m) => ({ ...m, [c.id]: r.ok ? (j.logs || '(no output)') : (j.error ?? 'could not read logs') }));
    } catch {
      setLogs((m) => ({ ...m, [c.id]: 'could not reach the server' }));
    }
  }

  async function create() {
    setBusy('create');
    try {
      const ports = newPorts.trim() ? newPorts.split(',').map((spec) => {
        const [host, container] = spec.trim().split(':').map(Number);
        return { host, container };
      }) : [];
      const r = await fetch('/api/containers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newName, image: newImage, memoryMb: Number(newMemory), cpus: Number(newCpus), ports }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.err(j.error ?? 'create failed');
      else {
        toast.ok(`created ${newName}`);
        setCreateOpen(false); setNewName(''); setNewImage(''); setNewPorts('');
        list.reload();
      }
    } catch {
      toast.err('create: could not reach the server');
    } finally {
      setBusy('');
    }
  }

  async function remove(c: Container) {
    if (!c.managed || !confirm(`Remove ${c.name}? This deletes the container, not its image.`)) return;
    setBusy(`${c.id}:remove`);
    try {
      const r = await fetch(`/api/containers/${c.id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.err(j.error ?? 'remove failed');
      else { toast.ok(`removed ${c.name}`); list.reload(); }
    } catch {
      toast.err('remove: could not reach the server');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <h1>containers</h1>
      <div className="sub">
        {list.data?.available === false
          ? 'docker is not reachable on this host'
          : `${all.length} containers · ${running} running · ${broken} needing attention`}
      </div>

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f}{f === 'unhealthy' && broken ? ` (${broken})` : ''}
          </button>
        ))}
        <div className="spacer" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter by name, image, project…"
          style={{ maxWidth: 260 }}
          aria-label="filter containers"
        />
        <button onClick={() => setCreateOpen((v) => !v)}>{createOpen ? 'cancel' : 'create container'}</button>
      </div>

      {createOpen && <div className="card" style={{ marginTop: 12 }}>
        <h3>create a container</h3>
        <div className="muted" style={{ marginBottom: 10 }}>No host mounts, volumes, host networking, devices, or extra capabilities. Pin the image tag. Published ports are reachable on the host.</div>
        <div className="row">
          <label>name <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-service" /></label>
          <label>image <input value={newImage} onChange={(e) => setNewImage(e.target.value)} placeholder="ghcr.io/org/app:1.2.3" style={{ width: 280 }} /></label>
          <label>memory MB <input type="number" min="128" max="8192" value={newMemory} onChange={(e) => setNewMemory(e.target.value)} style={{ width: 90 }} /></label>
          <label>CPUs <input type="number" min="0.1" max="8" step="0.1" value={newCpus} onChange={(e) => setNewCpus(e.target.value)} style={{ width: 70 }} /></label>
          <label>ports host:container <input value={newPorts} onChange={(e) => setNewPorts(e.target.value)} placeholder="18080:8080,18443:8443" style={{ width: 200 }} /></label>
          <button disabled={!!busy || !newName || !newImage} onClick={() => void create()}>{busy === 'create' ? 'creating…' : 'create'}</button>
        </div>
      </div>}

      {list.error && <div className="notice err" style={{ marginTop: 12 }}>{list.error}</div>}
      {list.data?.error && <div className="notice err" style={{ marginTop: 12 }}>{list.data.error}</div>}
      {!list.data && <Empty text="reading docker…" />}
      {list.data && shown.length === 0 && (
        <Empty text={all.length === 0 ? 'no containers on this host' : 'nothing matches this filter'} />
      )}

      {groups.map(([project, cs]) => (
        <div className="card" key={project} style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{project}</h3>
            <span className="muted mono" style={{ fontSize: 11 }}>
              {cs.filter((c) => c.state === 'running').length}/{cs.length} up
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>name</th><th>state</th><th>image</th><th>cpu</th><th>ram</th><th>ports</th><th />
              </tr>
            </thead>
            <tbody>
              {cs.map((c) => {
                const stop = c.state === 'running';
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td className="mono">{c.service ?? c.name}</td>
                      <td>
                        <span className={`badge ${badge(c)}`}>{c.health === 'unhealthy' ? 'unhealthy' : c.state}</span>
                        {c.health === 'starting' && <span className="badge queued" style={{ marginLeft: 6 }}>starting</span>}
                      </td>
                      <td className="mono muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.image}>
                        {c.image}
                      </td>
                      <td className="mono">{c.cpuPct == null ? '—' : `${c.cpuPct.toFixed(1)}%`}</td>
                      <td className="mono" title={c.memLimitMb ? `of ${bytes(c.memLimitMb * 1048576)}` : undefined}>
                        {c.memMb == null ? '—' : `${bytes(c.memMb * 1048576)}${c.memPct == null ? '' : ` · ${c.memPct.toFixed(0)}%`}`}
                      </td>
                      <td className="mono muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.ports}>
                        {c.ports || '—'}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button disabled={!!busy} onClick={() => void showLogs(c)}>{open === c.id ? 'hide' : 'logs'}</button>{' '}
                        {stop
                          ? <button disabled={!!busy} onClick={() => void act(c, 'restart')}>restart</button>
                          : null}{' '}
                        {stop
                          ? <button className="danger" disabled={!!busy} onClick={() => void act(c, 'stop')}>stop</button>
                          : <button disabled={!!busy} onClick={() => void act(c, 'start')}>start</button>}{' '}
                        {c.managed ? <button className="danger" disabled={!!busy} onClick={() => void remove(c)}>remove</button> : null}
                      </td>
                    </tr>
                    {open === c.id && (
                      <tr>
                        <td colSpan={7}>
                          <pre
                            className="mono"
                            style={{ maxHeight: 280, overflow: 'auto', margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
                          >{logs[c.id] ?? 'reading logs…'}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
