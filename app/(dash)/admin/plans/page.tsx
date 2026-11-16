/**
 * Admin plans: preset rates and per-plan bandwidth quotas.
 */
'use client';

import { PlansCard } from './card';
import { useAdminPlans } from '../use';

export default function AdminPlansPage() {
  const admin = useAdminPlans();

  return (
    <>
      <h1>plans</h1>
      <div className="sub">rates, caps and monthly bandwidth quotas</div>
      <PlansCard plans={admin.plans} planUsage={admin.planUsage} post={admin.post} />
    </>
  );
}
