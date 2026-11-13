/** Stats tab: docker stats --no-stream, polled every 4s while visible. */
'use client';

import { bytes } from '@/app/ui/host/shared';
import type { ContainerStats } from './types';

function num(value: number | null, suffix = ''): string {
  return value == null ? '—' : `${value}${suffix}`;
}

function mb(value: number | null): string {
  return value == null ? '—' : `${value} MB`;
}

function MemBar({ stats }: { stats: ContainerStats }) {
  if (stats.memMb == null || stats.memLimitMb == null || stats.memLimitMb <= 0) return null;
  const pct = Math.min(100, (stats.memMb / stats.memLimitMb) * 100);
  const hot = stats.memPct != null && stats.memPct > 85;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: hot ? 'var(--danger)' : 'var(--accent)',
          transition: 'width .4s ease',
        }} />
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {bytes(stats.memMb * 1048576)} of {bytes(stats.memLimitMb * 1048576)}
      </div>
    </div>
  );
}

export function StatsPanel({ stats, err }: { stats: ContainerStats | null; err: string }) {
  if (!stats) return <div className="muted">{err || 'sampling…'}</div>;
  return (
    <div>
      <dl className="kv">
        <dt>cpu</dt><dd className="mono">{num(stats.cpuPct, '%')}</dd>
        <dt>memory</dt>
        <dd className="mono">{mb(stats.memMb)}{stats.memLimitMb ? ` / ${stats.memLimitMb} MB` : ''}{stats.memPct != null ? ` (${stats.memPct.toFixed(0)}%)` : ''}</dd>
        <dt>network rx / tx</dt><dd className="mono">{mb(stats.netRxMb)} / {mb(stats.netTxMb)}</dd>
        <dt>block read / write</dt><dd className="mono">{mb(stats.blockReadMb)} / {mb(stats.blockWriteMb)}</dd>
        <dt>pids</dt><dd className="mono">{num(stats.pids)}</dd>
      </dl>
      <MemBar stats={stats} />
      {err && <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>last sample failed: {err}</div>}
    </div>
  );
}
