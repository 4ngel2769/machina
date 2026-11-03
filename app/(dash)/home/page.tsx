'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/app/ui/toast';
import { StatusCue } from '@/app/ui/status';
import { Skeleton, Empty } from '@/app/ui/loaders';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

type Inst = { id: string; name: string; status: string; planId: string; ip: string; createdAt: number; rateHourlyCents: number };
type Plan = { id: string; name: string; vcpu: number; ramMb: number };
type Sample = { ts: number; running: number; weight: number };

export default function HomePage() {
  const toast = useToast();
  const [insts, setInsts] = useState<Inst[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [pendingReqs, setPendingReqs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [spark, setSpark] = useState<Record<string, Sample[]>>({});

  const load = useCallback(async () => {
    const r = await fetch('/api/instances', { cache: 'no-store' });
    if (r.ok) {
      const j: Inst[] = await r.json();
      setInsts(j);
      for (const i of j) {
        fetch(`/api/instances/${i.id}/usage`, { cache: 'no-store' })
          .then((x) => x.ok ? x.json() : [])
          .then((s) => setSpark((p) => ({ ...p, [i.id]: s })))
          .catch(() => {});
      }
    }
    const b = await fetch('/api/billing', { cache: 'no-store' });
    if (b.ok) {
      const j = await b.json();
      setBalance(j.balanceCents);
    }
    const rq = await fetch('/api/requests', { cache: 'no-store' });
    if (rq.ok) {
      const j = await rq.json();
      setPendingReqs(j.filter((x: { status: string }) => x.status === 'pending').length);
    }
    const c = await fetch('/api/catalog', { cache: 'no-store' });
    if (c.ok) {
      const j = await c.json();
      setPlans(j.plans);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);

  const planById = (id: string) => plans.find((p) => p.id === id);
  const running = insts.filter((i) => i.status === 'running').length;
  const stopped = insts.filter((i) => i.status === 'stopped').length;

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
          <Link href="/instances" style={{ fontSize: 12, color: 'var(--accent)' }}>open grid →</Link>
        </div>
        {insts.length === 0 && !loading && (
          <Empty
            text="no VMs yet — request one from the instances page"
            action={<Link href="/instances" style={{ fontSize: 12, color: 'var(--accent)' }}>go to instances →</Link>}
          />
        )}
        {loading && insts.length === 0 && <div style={{ padding: '18px 0' }}><Skeleton h={10} w="60%" /><Skeleton h={10} w="40%" style={{ marginTop: 10 }} /></div>}
        {insts.map((i) => {
          const p = planById(i.planId);
          const samples = spark[i.id] ?? [];
          const data = samples.map((s) => ({ v: s.running ? s.weight * 100 : 0 }));
          return (
            <Link key={i.id} href={`/instances/${i.id}`} className="vmrow" style={{ textDecoration: 'none', color: 'inherit' }}>
                <StatusCue status={i.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{i.name}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>{i.ip} · {p?.name} · {p?.vcpu}v {p?.ramMb}MB</div>
                </div>
                <div style={{ width: 90, height: 28 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                      <defs>
                        <linearGradient id={`g-${i.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={1.5} fill={`url(#g-${i.id})`} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <span className="muted mono" style={{ fontSize: 11, minWidth: 70, textAlign: 'right' }}>{i.status}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
