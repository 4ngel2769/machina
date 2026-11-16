/** Plans card: preset rates, bandwidth quotas, custom-plan drop. */

'use client';

import { useEffect, useState } from 'react';
import type { Plan } from '../types';

type Post = (body: object, label?: string) => Promise<void>;

/** One plan row plus its bandwidth-quota save and custom-plan drop. */
function PlanRow({ plan, post, usedBy }: { plan: Plan; post: Post; usedBy: number }) {
  const [bw, setBw] = useState(String(plan.bandwidthGb ?? 0));
  useEffect(() => { setBw(String(plan.bandwidthGb ?? 0)); }, [plan.bandwidthGb]);
  return (
    <tr>
      <td>
        {plan.name}
        {plan.custom ? <span className="badge" title="one-off spec — not offered in the catalog">custom</span> : null}
      </td>
      <td>{plan.vcpu}</td><td>{plan.ramMb / 1024}GB</td><td>{plan.diskGb}GB</td>
      <td className="mono">{(plan.hourlyRateCents / 100).toFixed(2)}</td>
      <td className="mono">{Math.round(plan.monthlyCapMin / 60)}h</td>
      <td>
        <input className="mono" style={{ width: 70 }} value={bw} onChange={(event) => setBw(event.target.value)} />
      </td>
      <td>
        <div className="snapacts">
          <button onClick={() => {
            const bandwidthGb = parseFloat(bw);
            if (Number.isFinite(bandwidthGb) && bandwidthGb >= 0) void post({ op: 'setPlan', planId: plan.id, bandwidthGb }, `plan ${plan.name} quota`);
          }}>save</button>
          {plan.custom && (
            <button
              disabled={usedBy > 0}
              title={usedBy > 0 ? `${usedBy} instance(s) use it` : 'delete this custom plan'}
              onClick={() => { if (confirm(`delete plan ${plan.name}?`)) void post({ op: 'deletePlan', planId: plan.id }, 'delete plan'); }}
              style={{ color: 'var(--danger, #f87171)' }}
            >drop</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PlansCard({ plans, planUsage, post }: {
  plans: Plan[]; planUsage: Record<string, number>; post: Post;
}) {
  return (
    <div className="card">
      <h3>plans</h3>
      <table>
        <thead><tr><th>name</th><th>vcpu</th><th>ram</th><th>disk</th><th>$/h</th><th>cap/h</th><th>bw GB/mo</th><th /></tr></thead>
        <tbody>
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} post={post} usedBy={planUsage[plan.id] ?? 0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
