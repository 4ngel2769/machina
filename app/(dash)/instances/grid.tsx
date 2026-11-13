/** The instance card grid: skeletons, empty state, or the cards. */

'use client';

import { Empty, Skeleton } from '@/app/ui/loaders';
import { InstanceCard } from './card';
import type { useInstancesPage } from './use';
import type { Inst } from './types';

type Page = ReturnType<typeof useInstancesPage>;

export function InstancesGrid({ page, isAdmin, onRequest, insts, selected, onToggle }: {
  page: Page; isAdmin: boolean; onRequest: () => void;
  insts: Inst[]; selected: Set<string>; onToggle: (id: string) => void;
}) {
  const planById = (id: string) => page.plans.find((plan) => plan.id === id);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }} className="stagger">
      {page.loading && page.insts.length === 0 && Array.from({ length: 3 }).map((_, n) => (
        <div key={n} className="card" style={{ padding: 14, margin: 0 }}>
          <Skeleton w="50%" h={14} style={{ marginBottom: 10 }} />
          <Skeleton w="70%" h={9} style={{ marginBottom: 14 }} />
          <Skeleton h={46} r={8} />
        </div>
      ))}
      {!page.loading && insts.length === 0 && page.insts.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <Empty icon="search" text="no instances match the current filter" />
        </div>
      )}
      {!page.loading && page.insts.length === 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <Empty
            text={isAdmin ? 'no VMs yet — create one above' : 'no VMs yet — request one and an admin will approve it'}
            action={!isAdmin && <button className="primary" onClick={onRequest}>request instance</button>}
          />
        </div>
      )}
      {insts.map((instance) => (
        <InstanceCard
          key={instance.id} instance={instance} plan={planById(instance.planId)}
          spark={page.spark[instance.id] ?? []} page={page} isAdmin={isAdmin}
          group={page.groups.groups[instance.id] ?? null}
          groupNames={page.groups.groupNames}
          onAssignGroup={(name) => page.groups.assign(instance.id, name)}
          selected={selected.has(instance.id)}
          onToggle={() => onToggle(instance.id)}
        />
      ))}
    </div>
  );
}
