/** The instance card grid: skeletons, empty state, or the cards. */

'use client';

import { Empty, Skeleton } from '@/app/ui/loaders';
import { InstanceCard } from './card';
import type { useInstancesPage } from './use';

type Page = ReturnType<typeof useInstancesPage>;

export function InstancesGrid({ page, isAdmin, onRequest }: {
  page: Page; isAdmin: boolean; onRequest: () => void;
}) {
  const planById = (id: string) => page.plans.find((p) => p.id === id);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }} className="stagger">
      {page.loading && page.insts.length === 0 && Array.from({ length: 3 }).map((_, n) => (
        <div key={n} className="card" style={{ padding: 14, margin: 0 }}>
          <Skeleton w="50%" h={14} style={{ marginBottom: 10 }} />
          <Skeleton w="70%" h={9} style={{ marginBottom: 14 }} />
          <Skeleton h={46} r={8} />
        </div>
      ))}
      {!page.loading && page.insts.length === 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <Empty
            text={isAdmin ? 'no VMs yet — create one above' : 'no VMs yet — request one and an admin will approve it'}
            action={!isAdmin && <button className="primary" onClick={onRequest}>request instance</button>}
          />
        </div>
      )}
      {page.insts.map((i) => (
        <InstanceCard key={i.id} i={i} p={planById(i.planId)} spark={page.spark[i.id] ?? []} page={page} isAdmin={isAdmin} />
      ))}
    </div>
  );
}
