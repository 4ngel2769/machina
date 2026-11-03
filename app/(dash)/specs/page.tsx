'use client';

import { useEffect, useState } from 'react';
import { StatusCue } from '@/app/ui/status';

type Plan = { id: string; name: string; vcpu: number; ramMb: number; diskGb: number; hourlyRateCents: number; bandwidthGb: number; monthlyCapMin: number };

export default function SpecsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    fetch('/api/catalog', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPlans(j.plans))
      .catch(() => {});
  }, []);

  const fmtGb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`);

  return (
    <>
      <h1>specs</h1>
      <div className="sub">what you get on every plan, smallest to largest</div>

      {plans.length === 0 && <div className="empty">loading plans…</div>}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr><th>plan</th><th>vCPU</th><th>RAM</th><th>disk</th><th>network</th><th>rate</th><th>monthly cap</th></tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td style={{ color: 'var(--text)', fontWeight: 500 }}>{p.name}</td>
                <td className="mono">{p.vcpu}</td>
                <td className="mono">{fmtGb(p.ramMb)}</td>
                <td className="mono">{p.diskGb} GB</td>
                <td className="mono">{p.bandwidthGb} GB/mo</td>
                <td className="mono" style={{ color: 'var(--accent)' }}>${(p.hourlyRateCents / 100).toFixed(2)}/h</td>
                <td className="mono muted">{p.monthlyCapMin} min</td>
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
