'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Empty, Orb } from './loaders';

type Point = { t: number; cpu: number; read: number; write: number };
type Payload = {
  ok: boolean;
  points: Point[];
  allocBytes: number;
  ncpu: number;
  ramAllocMb: number;
  ramObservable: boolean;
  running: boolean;
};

const RANGES = [
  { k: '1h', label: '1 hour' },
  { k: '6h', label: '6 hours' },
  { k: '24h', label: '24 hours' },
  { k: '7d', label: '7 days' },
] as const;

function fmtBytes(b: number): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function fmtRate(bps: number): string {
  return bps > 1024 ** 2 ? `${(bps / 1024 ** 2).toFixed(1)} MB/s` : `${(bps / 1024).toFixed(0)} KB/s`;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Live metrics. Everything drawn here is measured by the hypervisor (vCPU
 * runtime and disk I/O counters), not estimated.
 *
 * Guest memory is deliberately NOT plotted. The balloon device reports
 * balloon.current == balloon.maximum on every guest here regardless of what
 * the guest actually uses — verified on both Ubuntu and Alpine — so plotting it
 * would produce a RAM line pinned at 100% forever. It is shown as "allocated"
 * instead, which is the truth, with the reason stated rather than hidden.
 */
export function MetricsPanel({ instanceId, instanceStatus }: { instanceId: string; instanceStatus: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [range, setRange] = useState<string>('1h');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/instances/${instanceId}/metrics?range=${range}`, { cache: 'no-store' });
      if (r.ok) setData(await r.json());
    } catch {
      /* retried on the next tick */
    } finally {
      setLoading(false);
    }
  }, [instanceId, range]);

  useEffect(() => {
    setLoading(true);
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const points = data?.points ?? [];
  const latest = points[points.length - 1];
  const off = instanceStatus !== 'running';

  return (
    <div className="metrics">
      <div className="metrics-head">
        <div className="metrics-stats">
          <div className="metric">
            <div className="label">cpu now</div>
            <div className="value">{latest ? `${Math.round(latest.cpu)}%` : '—'}</div>
          </div>
          <div className="metric">
            <div className="label">disk read</div>
            <div className="value">{latest ? fmtRate(latest.read) : '—'}</div>
          </div>
          <div className="metric">
            <div className="label">disk write</div>
            <div className="value">{latest ? fmtRate(latest.write) : '—'}</div>
          </div>
          <div className="metric">
            <div className="label">memory allocated</div>
            <div className="value">{data?.ramAllocMb ? `${data.ramAllocMb} MB` : '—'}</div>
          </div>
        </div>
        <div className="metrics-ranges">
          {RANGES.map((r) => (
            <button
              key={r.k}
              className={`chip${range === r.k ? ' on' : ''}`}
              onClick={() => setRange(r.k)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {off && (
        <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
          The instance is {instanceStatus}. Metrics are sampled only while it runs.
        </div>
      )}

      {loading && !data ? (
        <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <Orb state="searching" size={20} /> reading metrics
          </span>
        </div>
      ) : points.length < 2 ? (
        <Empty
          text={
            off
              ? 'Start the instance and its load will be charted here.'
              : 'Collecting the first samples. A chart needs two readings, so give it about a minute.'
          }
        />
      ) : (
        <>
          <div className="chartlabel">cpu · % of all {data?.ncpu || 1} vCPU</div>
          <div className="chartbox">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="mcpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="t" tickFormatter={clock} stroke="var(--text-3)" fontSize={10}
                  tickLine={false} minTickGap={44}
                />
                <YAxis
                  domain={[0, 100]} stroke="var(--text-3)" fontSize={10}
                  tickLine={false} width={44} unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-2)', border: '1px solid var(--line)',
                    borderRadius: 6, fontSize: 12, color: 'var(--text)',
                  }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                  formatter={(v) => [`${Math.round(Number(v))}%`, 'cpu']}
                />
                <Area
                  type="monotone" dataKey="cpu" stroke="var(--accent)"
                  strokeWidth={1.5} fill="url(#mcpu)" isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chartlabel">disk throughput · guest disk only</div>
          <div className="chartbox">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="t" tickFormatter={clock} stroke="var(--text-3)" fontSize={10}
                  tickLine={false} minTickGap={44}
                />
                <YAxis
                  stroke="var(--text-3)" fontSize={10} tickLine={false} width={44}
                  tickFormatter={(v) => fmtRate(Number(v))}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-2)', border: '1px solid var(--line)',
                    borderRadius: 6, fontSize: 12, color: 'var(--text)',
                  }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                  formatter={(v, n) => [fmtRate(Number(v)), n === 'read' ? 'read' : 'write']}
                />
                <Line type="monotone" dataKey="read" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="write" stroke="var(--warn)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Disk in use {fmtBytes(data?.allocBytes ?? 0)} · {points.length} sample points ·
            {' '}memory usage is not shown: the balloon device does not report it on these guests
            without the QEMU guest agent, which is intentionally not installed.
          </div>
        </>
      )}
    </div>
  );
}