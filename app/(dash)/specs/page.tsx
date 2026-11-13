/**
 * Plan catalogue: the spec tiers a user can rent.
 */
'use client';

import { useEffect, useState } from 'react';
import { Skeleton, useMinVisible } from '@/app/ui/loaders';

type Plan = { id: string; name: string; vcpu: number; ramMb: number; diskGb: number; hourlyRateCents: number; bandwidthGb: number; monthlyCapMin: number };

export default function SpecsPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const ready = useMinVisible(400);

  useEffect(() => {
    fetch('/api/catalog', { cache: 'no-store' })
      .then((catalogResponse) => (catalogResponse.ok ? catalogResponse.json() : null))
      .then((catalog) => setPlans(catalog?.plans ?? []))
      .catch(() => setPlans([]));
  }, []);

  const formatGigabytes = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`);
  const loading = !ready || plans === null;

  return (
    <>
      <h1>specs</h1>
      <div className="sub">what you get on every plan, smallest to largest</div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr><th>plan</th><th>vCPU</th><th>RAM</th><th>disk</th><th>network</th><th>rate</th><th>monthly cap</th></tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }).map((_, n) => (
              <tr key={n}>
                {Array.from({ length: 7 }).map((__, cell) => (
                  <td key={cell} style={{ padding: '12px 10px' }}><Skeleton w={cell === 0 ? '60%' : '70%'} h={10} /></td>
                ))}
              </tr>
            ))}
            {!loading && (plans ?? []).map((plan) => (
              <tr key={plan.id}>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>{plan.name}</td>
                <td className="mono">{plan.vcpu}</td>
                <td className="mono">{formatGigabytes(plan.ramMb)}</td>
                <td className="mono">{plan.diskGb} GB</td>
                <td className="mono">{plan.bandwidthGb} GB/mo</td>
                <td className="mono" style={{ color: 'var(--accent)' }}>${(plan.hourlyRateCents / 100).toFixed(2)}/h</td>
                <td className="mono muted">{plan.monthlyCapMin} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>included on every VM</h3>
        <div className="grid2" style={{ gap: 14 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              · a dedicated private IP, reachable only from your console<br />
              · a root password and optional SSH key injection<br />
              · web terminal (SSH over a secured relay) and a VNC console<br />
              · hourly metering from your credit balance<br />
              · automatic suspension when your balance hits zero
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
              · outbound bandwidth is metered and throttled at the plan quota<br />
              · guests are isolated: no route to the host or to other VMs<br />
              · instances can be requested by you and approved by an admin
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>billing</h3>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          You are billed per hour of running time against an internal credit balance. An admin tops you up;
          when the balance reaches zero your instances are suspended (not deleted) until it is topped up again.
          See the <a href="/terms" style={{ color: 'var(--accent)' }}>terms</a> and <a href="/privacy" style={{ color: 'var(--accent)' }}>privacy policy</a>.
        </div>
      </div>
    </>
  );
}
