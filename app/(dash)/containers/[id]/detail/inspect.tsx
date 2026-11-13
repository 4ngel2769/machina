/** Inspect tab: the docker inspect fields the page renders, grouped. */
'use client';

import { relTime } from '@/app/ui/time';
import type { ContainerDetail } from './types';

function Row({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className={mono ? 'mono' : undefined}>{v || '—'}</dd>
    </>
  );
}

function fmtTs(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `${new Date(ms).toLocaleString()} (${relTime(ms)})` : iso;
}

function EnvTable({ env }: { env: ContainerDetail['env'] }) {
  if (!env.length) return <span className="muted">none</span>;
  return (
    <table style={{ marginTop: 4 }}>
      <thead><tr><th>name</th><th>value</th><th>len</th></tr></thead>
      <tbody>
        {env.map((entry) => (
          <tr key={entry.name}>
            <td className="mono">{entry.name}</td>
            <td className="mono muted">{entry.value || '(empty)'}</td>
            <td className="mono muted">{entry.len}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InspectPanel({ detail }: { detail: ContainerDetail }) {
  return (
    <div>
      <h3>container</h3>
      <dl className="kv">
        <Row k="id" v={detail.id} />
        <Row k="name" v={detail.name} />
        <Row k="image" v={detail.image} />
        <Row k="platform" v={detail.platform} mono={false} />
        <Row k="pid" v={detail.pid} />
        <Row k="restarts" v={detail.restartCount} />
        <Row k="restart policy" v={detail.restartPolicy} mono={false} />
      </dl>

      <h3 style={{ marginTop: 18 }}>runtime</h3>
      <dl className="kv">
        <Row k="state" v={<span className={`badge ${detail.state === 'running' ? 'running' : 'stopped'}`}>{detail.state}</span>} mono={false} />
        <Row k="status" v={detail.status} mono={false} />
        <Row k="health" v={detail.health} mono={false} />
        <Row k="started" v={fmtTs(detail.startedAt)} mono={false} />
        <Row k="finished" v={fmtTs(detail.finishedAt)} mono={false} />
      </dl>

      <h3 style={{ marginTop: 18 }}>config</h3>
      <dl className="kv">
        <Row k="entrypoint" v={detail.entrypoint.join(' ') || '—'} />
        <Row k="command" v={detail.command.join(' ') || '—'} />
        <Row k="working dir" v={detail.workingDir} />
        <Row k="user" v={detail.user || 'root'} />
      </dl>

      <h3 style={{ marginTop: 18 }}>network</h3>
      <dl className="kv">
        <Row k="mode" v={detail.networkMode || 'default'} mono={false} />
        <Row k="networks" v={detail.networks.join(', ')} mono={false} />
      </dl>
      {detail.ports.length > 0 && (
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>private</th><th>public</th><th>proto</th></tr></thead>
          <tbody>
            {detail.ports.map((port, index) => (
              <tr key={index}>
                <td className="mono">{port.private}</td>
                <td className="mono">{port.public ?? '—'}</td>
                <td className="mono muted">{port.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 18 }}>mounts</h3>
      {detail.mounts.length === 0 && <div className="muted">no mounts</div>}
      {detail.mounts.length > 0 && (
        <table style={{ marginTop: 4 }}>
          <thead><tr><th>type</th><th>source</th><th>destination</th><th>rw</th></tr></thead>
          <tbody>
            {detail.mounts.map((mount, index) => (
              <tr key={index}>
                <td className="mono muted">{mount.type}</td>
                <td className="mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mount.source}>{mount.source}</td>
                <td className="mono">{mount.destination}</td>
                <td className="mono muted">{mount.rw ? 'rw' : 'ro'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 18 }}>environment</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>values are masked — names and lengths only</div>
      <EnvTable env={detail.env} />
    </div>
  );
}
