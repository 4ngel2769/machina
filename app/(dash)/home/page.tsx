/**
 * Dashboard home: greeting, instance summary and recent activity.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusCue } from '@/app/ui/status';
import { Skeleton, Empty, useMinVisible } from '@/app/ui/loaders';
import { ArrowRightIcon } from '@/app/ui/icons';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ignore } from '@/lib/core/ignore';

type Inst = { id: string; name: string; status: string; planId: string; ip: string; createdAt: number; rateHourlyCents: number };
type Plan = { id: string; name: string; vcpu: number; ramMb: number };
type Sample = { ts: number; running: number; weight: number };

export default function HomePage() {
  const [insts, setInsts] = useState<Inst[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [pendingReqs, setPendingReqs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [spark, setSpark] = useState<Record<string, Sample[]>>({});
  const ready = useMinVisible(400);
  const pending = loading || !ready;

  const load = useCallback(async () => {
    const instancesResponse = await fetch('/api/instances', { cache: 'no-store' });
    if (instancesResponse.ok) {
      const instances: Inst[] = await instancesResponse.json();
      setInsts(instances);
      for (const instance of instances) {
        fetch(`/api/instances/${instance.id}/usage`, { cache: 'no-store' })
          .then((usageResponse) => usageResponse.ok ? usageResponse.json() : [])
          .then((samples) => setSpark((previous) => ({ ...previous, [instance.id]: samples })))
          .catch(ignore('usage fetch failure leaves the card empty'));
      }
    }
    const billingResponse = await fetch('/api/billing', { cache: 'no-store' });
    if (billingResponse.ok) {
      const billing = await billingResponse.json();
      setBalance(billing.balanceCents);
    }
    const requestsResponse = await fetch('/api/requests', { cache: 'no-store' });
    if (requestsResponse.ok) {
      const requests = await requestsResponse.json();
      setPendingReqs(requests.filter((request: { status: string }) => request.status === 'pending').length);
    }
    const catalogResponse = await fetch('/api/catalog', { cache: 'no-store' });
    if (catalogResponse.ok) {
      const catalog = await catalogResponse.json();
      setPlans(catalog.plans);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);

  const planById = (id: string) => plans.find((plan) => plan.id === id);
  const running = insts.filter((instance) => instance.status === 'running').length;
  const stopped = insts.filter((instance) => instance.status === 'stopped').length;

  return (
    <>
      <h1>status</h1>
      <div className="sub">your homelab at a glance</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card statcard"><div className="label">balance</div><div className="value">${balance !== null ? (balance / 100).toFixed(2) : '—'}</div></div>
        <div className="card statcard"><div className="label">running</div><div className="value">{running}<span className="muted" style={{ fontSize: 12 }}> / {insts.length}</span></div></div>
        <div className="card statcard"><div className="label">stopped</div><div className="value">{stopped}</div></div>
        <div className="card statcard"><div className="label">pending requests</div><div className="value">{pendingReqs}</div></div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>your VMs</h3>
          <Link href="/instances" className="link-arrow" style={{ fontSize: 12, color: 'var(--accent)' }}>open grid <ArrowRightIcon size={12} /></Link>
        </div>
        {insts.length === 0 && !pending && (
          <Empty
            icon="server"
            text="no VMs yet — request one from the instances page"
            action={<Link href="/instances" className="link-arrow" style={{ fontSize: 12, color: 'var(--accent)' }}>go to instances <ArrowRightIcon size={12} /></Link>}
          />
        )}
        {pending && insts.length === 0 && <div style={{ padding: '18px 0' }}><Skeleton h={10} w="60%" /><Skeleton h={10} w="40%" style={{ marginTop: 10 }} /></div>}
        {!pending && insts.map((instance) => {
          const plan = planById(instance.planId);
          const samples = spark[instance.id] ?? [];
          const chartData = samples.map((sample) => ({ v: sample.running ? sample.weight * 100 : 0 }));
          return (
            <Link key={instance.id} href={`/instances/${instance.id}`} className="vmrow" style={{ textDecoration: 'none', color: 'inherit' }}>
                <StatusCue status={instance.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{instance.name}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>{instance.ip} · {plan?.name} · {plan?.vcpu}v {plan?.ramMb}MB</div>
                </div>
                <div style={{ width: 90, height: 28 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                      <defs>
                        <linearGradient id={`g-${instance.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} fill={`url(#g-${instance.id})`} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <span className="muted mono" style={{ fontSize: 11, minWidth: 70, textAlign: 'right' }}>{instance.status}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
