/** One instance card in the grid: sparkline, specs, lifecycle buttons. */

'use client';

import Link from 'next/link';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { StatusCue } from '@/app/ui/status';
import { Ring } from '@/app/ui/loaders';
import type { Inst, Plan, Sample } from './types';
import type { useInstancesPage } from './use';

type Page = ReturnType<typeof useInstancesPage>;

/** The CPU sparkline or its explicit empty state. */
function Spark({ series, live, id }: { series: Sample[]; live: boolean; id: string }) {
  const data = series.map((s) => ({ v: s.cpu }));
  if (data.length <= 1) {
    return (
      <div className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', height: '100%' }}>
        {live ? 'collecting samples…' : 'off — no load to show'}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} fill={`url(#g-${id})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** stop/start/retry/delete row at the card foot. */
function CardActions({ i, busy, isAdmin, act }: {
  i: Inst; busy: boolean; isAdmin: boolean; act: Page['act'];
}) {
  const live = i.activeJob && (i.activeJob.status === 'running' || i.activeJob.status === 'queued');
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <Link href={`/instances/${i.id}`} className="primary" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}>open</Link>
      {i.status === 'running' && <button onClick={() => void act(i.id, 'stop')} disabled={busy} style={{ padding: '4px 10px', fontSize: 12 }}>stop</button>}
      {i.status === 'stopped' && <button onClick={() => void act(i.id, 'start')} disabled={busy} style={{ padding: '4px 10px', fontSize: 12 }}>start</button>}
      {i.status === 'error' && (
        <button onClick={() => void act(i.id, 'retry')} disabled={busy} style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Ring size={10} /> retry
        </button>
      )}
      {live && <span className="muted pulse-live" style={{ fontSize: 11, marginLeft: 2 }}>{i.activeJob!.type.replace('instance.', '')}…</span>}
      {isAdmin && <button onClick={() => { if (confirm(`delete ${i.name}?`)) void act(i.id, 'delete'); }} disabled={busy} style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger, #f87171)', marginLeft: 'auto' }}>delete</button>}
    </div>
  );
}

/** ip · plan name · custom badge line under the title. */
function PlanLine({ i, p }: { i: Inst; p: Plan | undefined }) {
  return (
    <div className="muted mono" style={{ fontSize: 11, marginBottom: 8 }}>
      {i.ip} · {i.planName ?? p?.name}{i.custom ? ' · custom' : ''}
    </div>
  );
}

/** specs line: resolved instance values win over the plan defaults. */
function SpecLine({ i, p }: { i: Inst; p: Plan | undefined }) {
  return (
    <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
      {i.vcpu ?? p?.vcpu} vCPU · {i.ramMb ?? p?.ramMb} MB RAM · {i.diskGb ?? p?.diskGb} GB
    </div>
  );
}

/** 'CPU · now N%' footer under the sparkline. */
function CpuLine({ series }: { series: Sample[] }) {
  const last = series.length > 1 ? series[series.length - 1] : null;
  return (
    <div className="muted" style={{ fontSize: 10, marginBottom: 8, letterSpacing: '.04em' }}>
      CPU{last ? ` · now ${Math.round(last.cpu)}%` : ''}
    </div>
  );
}

export function InstanceCard({ i, p, spark, page, isAdmin }: {
  i: Inst; p: Plan | undefined; spark: Sample[]; page: Page; isAdmin: boolean;
}) {
  const series = spark;
  const live_ = i.status === 'running';
  const jobLive = i.activeJob && (i.activeJob.status === 'running' || i.activeJob.status === 'queued');
  return (
    <div className="card card-hover" style={{ padding: 14, margin: 0, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Link href={`/instances/${i.id}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{i.name}</Link>
        <StatusCue status={i.status} jobType={jobLive ? i.activeJob!.type : undefined} />
      </div>
      <PlanLine i={i} p={p} />
      <SpecLine i={i} p={p} />
      <div style={{ height: 46, marginBottom: 4 }}>
        <Spark series={series} live={live_} id={i.id} />
      </div>
      <CpuLine series={series} />
      <CardActions i={i} busy={page.busy} isAdmin={isAdmin} act={page.act} />
    </div>
  );
}
