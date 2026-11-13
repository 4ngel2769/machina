/** Data loading, sparkline fetches and form selection state for the list page. */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Img, Inst, Plan, Sample } from './types';
import { useInstanceMutations } from './mutations';
import { useGroups } from './groups';
import { useMinVisible } from '@/app/ui/loaders';
import { ignore } from '@/lib/core/ignore';

export type PendingRequest = {
  id: string; name: string; status: string; plan_id: string;
  image_id: string | null; note: string | null; created_at: number;
};

/** Live hypervisor metrics for one running VM; empty array otherwise. */
function fetchSpark(instance: Inst, setSpark: React.Dispatch<React.SetStateAction<Record<string, Sample[]>>>) {
  if (instance.status !== 'running') {
    setSpark((previous) => ({ ...previous, [instance.id]: [] }));
    return;
  }
  fetch(`/api/instances/${instance.id}/metrics?range=1h`, { cache: 'no-store' })
    .then((metricsResponse) => (metricsResponse.ok ? metricsResponse.json() : { points: [] }))
    .then((metrics) => setSpark((previous) => ({ ...previous, [instance.id]: metrics.points ?? [] })))
    .catch(ignore('catalog fetch failure leaves plans empty'));
}

async function loadInstances(setInsts: React.Dispatch<React.SetStateAction<Inst[]>>) {
  const response = await fetch('/api/instances', { cache: 'no-store' });
  if (!response.ok) return;
  const instances: Inst[] = await response.json();
  setInsts(instances);
  for (const instance of instances) fetchSpark(instance, setSparkRef.current);
}

// fetchSpark needs the setter; keep a module-level ref so loadInstances stays flat.
const setSparkRef: { current: React.Dispatch<React.SetStateAction<Record<string, Sample[]>>> } = {
  current: () => {},
};

async function loadCatalog(
  setPlans: React.Dispatch<React.SetStateAction<Plan[]>>,
  setImgs: React.Dispatch<React.SetStateAction<Img[]>>,
  setImgPickable: (v: boolean) => void,
  setAssignedImage: (v: string | null) => void,
) {
  const response = await fetch('/api/catalog', { cache: 'no-store' });
  if (!response.ok) return;
  const catalog = await response.json();
  setPlans((previous) => (previous.length ? previous : catalog.plans));
  setImgs(catalog.images);
  setImgPickable(!!catalog.imagePickable);
  setAssignedImage(catalog.assignedImageId ?? null);
}

async function loadSession(
  setRole: (v: string) => void,
  setUserName: (v: string) => void,
) {
  const response = await fetch('/api/auth/session', { cache: 'no-store' });
  if (!response.ok) return;
  const session = await response.json();
  setRole(session?.user?.role ?? 'user');
  setUserName(session?.user?.name ?? '');
}

async function loadRequests(setRequests: React.Dispatch<React.SetStateAction<PendingRequest[]>>) {
  const response = await fetch('/api/requests', { cache: 'no-store' });
  if (!response.ok) return;
  const rows = await response.json() as PendingRequest[];
  setRequests(rows.filter((row) => row.status === 'pending'));
}

export function useInstancesPage() {
  const [insts, setInsts] = useState<Inst[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [imgPickable, setImgPickable] = useState(true);
  const [assignedImage, setAssignedImage] = useState<string | null>(null);
  const [role, setRole] = useState('user');
  const [userName, setUserName] = useState('');
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [spark, setSpark] = useState<Record<string, Sample[]>>({});
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState('');
  const [imageId, setImageId] = useState('');
  const groups = useGroups(userName);
  // keep the skeleton up for a beat so fast loads don't flash one frame
  const minVisible = useMinVisible(400);
  const showLoading = loading || !minVisible;

  // Only offer OS images that are actually usable. 'broken' is a quarantine by
  // the bootability audit, 'missing'/'downloading'/'failed' are not bootable
  // yet, and offering any of them means offering a VM that cannot start.
  const readyImgs = useMemo(() => imgs.filter((image) => image.status === 'ready'), [imgs]);

  const load = useCallback(async () => {
    setSparkRef.current = setSpark;
    await Promise.all([
      loadInstances(setInsts),
      loadCatalog(setPlans, setImgs, setImgPickable, setAssignedImage),
      loadSession(setRole, setUserName),
      loadRequests(setRequests),
    ]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);

  const { busy, create, requestInstance, act } = useInstanceMutations(load);

  const cancelRequest = useCallback(async (id: string) => {
    const response = await fetch('/api/requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'cancel', id }),
    });
    if (response.ok) setRequests((prev) => prev.filter((row) => row.id !== id));
    // a stale click reconciles on the next poll; nothing to surface
  }, []);

  const bulkAct = useCallback(async (ids: string[], action: string) => {
    for (const id of ids) await act(id, action);
  }, [act]);

  // Preselect plan + OS once the catalog lands; never override a user pick.
  useEffect(() => {
    if (plans.length === 0) return;
    setPlanId((previous) => previous || (plans[0]?.id ?? ''));
  }, [plans]);
  useEffect(() => {
    if (imgs.length === 0) return;
    setImageId((previous) => previous || (imgs.find((image) => image.status === 'ready')?.id ?? ''));
  }, [imgs]);

  return {
    insts, plans, imgs, readyImgs, imgPickable, assignedImage, role, userName,
    requests, cancelRequest, bulkAct, groups,
    spark, loading: showLoading, busy,
    planId, setPlanId, imageId, setImageId,
    load, create, requestInstance, act,
  };
}
