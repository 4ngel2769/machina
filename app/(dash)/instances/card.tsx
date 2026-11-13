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
function Spark({ series, isLive, id }: { series: Sample[]; isLive: boolean; id: string }) {
  const chartData = series.map((sample) => ({ v: sample.cpu }));
  if (chartData.length <= 1) {
    return (
      <div className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', height: '100%' }}>
        {isLive ? 'collecting samples…' : 'off — no load to show'}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
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
function CardActions({ instance, busy, isAdmin, act }: {
  instance: Inst; busy: boolean; isAdmin: boolean; act: Page['act'];
}) {
  const hasActiveJob = instance.activeJob && (instance.activeJob.status === 'running' || instance.activeJob.status === 'queued');
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <Link href={`/instances/${instance.id}`} className="primary" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}>open</Link>
      {instance.status === 'running' && <button onClick={() => void act(instance.id, 'stop')} disabled={busy} style={{ padding: '4px 10px', fontSize: 12 }}>stop</button>}
      {instance.status === 'stopped' && <button onClick={() => void act(instance.id, 'start')} disabled={busy} style={{ padding: '4px 10px', fontSize: 12 }}>start</button>}
      {instance.status === 'error' && (
        <button onClick={() => void act(instance.id, 'retry')} disabled={busy} style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Ring size={10} /> retry
        </button>
      )}
      {hasActiveJob && <span className="muted pulse-live" style={{ fontSize: 11, marginLeft: 2 }}>{instance.activeJob!.type.replace('instance.', '')}…</span>}
      {isAdmin && <button onClick={() => { if (confirm(`delete ${instance.name}?`)) void act(instance.id, 'delete'); }} disabled={busy} style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger, #f87171)', marginLeft: 'auto' }}>delete</button>}
    </div>
  );
}

/** ip · plan name · custom badge line under the title. */
function PlanLine({ instance, plan }: { instance: Inst; plan: Plan | undefined }) {
  return (
    <div className="muted mono" style={{ fontSize: 11, marginBottom: 8 }}>
      {instance.ip} · {instance.planName ?? plan?.name}{instance.custom ? ' · custom' : ''}
    </div>
  );
}

/** specs line: resolved instance values win over the plan defaults. */
function SpecLine({ instance, plan }: { instance: Inst; plan: Plan | undefined }) {
  return (
    <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
      {instance.vcpu ?? plan?.vcpu} vCPU · {instance.ramMb ?? plan?.ramMb} MB RAM · {instance.diskGb ?? plan?.diskGb} GB
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

export function InstanceCard({ instance, plan, spark, page, isAdmin }: {
  instance: Inst; plan: Plan | undefined; spark: Sample[]; page: Page; isAdmin: boolean;
}) {
  const series = spark;
  const isLive = instance.status === 'running';
  const hasActiveJob = instance.activeJob && (instance.activeJob.status === 'running' || instance.activeJob.status === 'queued');
  return (
    <div className="card card-hover" style={{ padding: 14, margin: 0, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Link href={`/instances/${instance.id}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{instance.name}</Link>
        <StatusCue status={instance.status} jobType={hasActiveJob ? instance.activeJob!.type : undefined} />
      </div>
      <PlanLine instance={instance} plan={plan} />
      <SpecLine instance={instance} plan={plan} />
      <div style={{ height: 46, marginBottom: 4 }}>
        <Spark series={series} isLive={isLive} id={instance.id} />
      </div>
      <CpuLine series={series} />
      <CardActions instance={instance} busy={page.busy} isAdmin={isAdmin} act={page.act} />
    </div>
  );
}
