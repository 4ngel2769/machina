/**
 * Dashboard home: greeting, instance summary and recent activity.
 * One /api/home/summary poll carries everything — instances with joined plan
 * specs, sparklines, balance, accrued charges and pending requests.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusCue } from '@/app/ui/status';
import { DataGate } from '@/app/ui/datagate';
import { Skeleton, useMinVisible } from '@/app/ui/loaders';
import { ArrowRightIcon } from '@/app/ui/icons';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ignore } from '@/lib/core/ignore';

type Sample = { ts: number; running: number; weight: number };
type Inst = {
  id: string; name: string; status: string; planId: string; ip: string;
  createdAt: number; rateHourlyCents: number; planName: string;
  vcpu: number; ramMb: number; spark: Sample[];
};
type Summary = {
  instances: Inst[];
  balanceCents: number | null;
  pendingRequests: number;
  accruedCents: number;
  accruedHours: number;
};

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card statcard">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function Sparkline({ id, spark }: { id: string; spark: Sample[] }) {
  const chartData = spark.map((sample) => ({ v: sample.running ? sample.weight * 100 : 0 }));
  return (
    <div style={{ width: 90, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} fill={`url(#g-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function VmRow({ instance }: { instance: Inst }) {
  return (
    <Link href={`/instances/${instance.id}`} className="vmrow" style={{ textDecoration: 'none', color: 'inherit' }}>
      <StatusCue status={instance.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{instance.name}</div>
        <div className="muted mono" style={{ fontSize: 11 }}>{instance.ip} · {instance.planName} · {instance.vcpu}v {instance.ramMb}MB</div>
      </div>
      <Sparkline id={instance.id} spark={instance.spark} />
      <span className="muted mono" style={{ fontSize: 11, minWidth: 70, textAlign: 'right' }}>{instance.status}</span>
    </Link>
  );
}

function BalanceStat({ summary }: { summary: Summary | null }) {
  const accrued = summary?.accruedCents ?? 0;
  const text = summary?.balanceCents != null ? `$${(summary.balanceCents / 100).toFixed(2)}` : '—';
  return (
    <StatCard
      label="balance"
      value={text}
      sub={accrued > 0 ? `+$${(accrued / 100).toFixed(2)} accrued (${summary!.accruedHours}h pending)` : undefined}
    />
  );
}

function VmList({ summary, pending }: { summary: Summary | null; pending: boolean }) {
  const insts = summary?.instances ?? [];
  return (
    <DataGate
      data={summary} loading={pending && insts.length === 0}
      isEmpty={() => insts.length === 0}
      emptyIcon="server" emptyText="no VMs yet — request one from the instances page"
      emptyAction={<Link href="/instances" className="link-arrow" style={{ fontSize: 12, color: 'var(--accent)' }}>go to instances <ArrowRightIcon size={12} /></Link>}
      skeleton={<div style={{ padding: '18px 0' }}><Skeleton h={10} w="60%" /><Skeleton h={10} w="40%" style={{ marginTop: 10 }} /></div>}
    >
      {() => <>{insts.map((instance) => <VmRow key={instance.id} instance={instance} />)}</>}
    </DataGate>
  );
}

export default function HomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const ready = useMinVisible(400);
  const pending = loading || !ready;

  const load = useCallback(async () => {
    const response = await fetch('/api/home/summary', { cache: 'no-store' })
      .catch(ignore('summary fetch failure leaves the page stale'));
    if (response?.ok) setSummary(await response.json());
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);

  const insts = summary?.instances ?? [];
  const running = insts.filter((instance) => instance.status === 'running').length;
  const stopped = insts.filter((instance) => instance.status === 'stopped').length;

  return (
    <>
      <h1>status</h1>
      <div className="sub">your homelab at a glance</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <BalanceStat summary={summary} />
        <StatCard label="running" value={<>{running}<span className="muted" style={{ fontSize: 12 }}> / {insts.length}</span></>} />
        <StatCard label="stopped" value={stopped} />
        <StatCard label="pending requests" value={summary?.pendingRequests ?? 0} />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>your VMs</h3>
          <Link href="/instances" className="link-arrow" style={{ fontSize: 12, color: 'var(--accent)' }}>open grid <ArrowRightIcon size={12} /></Link>
        </div>
        <VmList summary={summary} pending={pending} />
      </div>
    </>
  );
}
