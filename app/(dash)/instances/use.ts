/** Data loading, sparkline fetches and form selection state for the list page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Img, Inst, Plan, Sample } from './types';
import { useInstanceMutations } from './mutations';
import { ignore } from '@/lib/core/ignore';

export function useInstancesPage() {
  const [insts, setInsts] = useState<Inst[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [imgPickable, setImgPickable] = useState(true);
  const [assignedImage, setAssignedImage] = useState<string | null>(null);
  const [role, setRole] = useState('user');
  const [spark, setSpark] = useState<Record<string, Sample[]>>({});
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState('');
  const [imageId, setImageId] = useState('');

  // Only offer OS images that are actually usable. 'broken' is a quarantine by
  // the bootability audit, 'missing'/'downloading'/'failed' are not bootable
  // yet, and offering any of them means offering a VM that cannot start.
  const readyImgs = imgs.filter((image) => image.status === 'ready');

  const load = useCallback(async () => {
    /** Live hypervisor metrics for one running VM; empty array otherwise. */
    const fetchSpark = (instance: Inst) => {
      if (instance.status !== 'running') {
        setSpark((previous) => ({ ...previous, [instance.id]: [] }));
        return;
      }
      fetch(`/api/instances/${instance.id}/metrics?range=1h`, { cache: 'no-store' })
        .then((metricsResponse) => (metricsResponse.ok ? metricsResponse.json() : { points: [] }))
        .then((metrics) => setSpark((previous) => ({ ...previous, [instance.id]: metrics.points ?? [] })))
        .catch(ignore('catalog fetch failure leaves plans empty'));
    };
    const instancesResponse = await fetch('/api/instances', { cache: 'no-store' });
    if (instancesResponse.ok) {
      const instances: Inst[] = await instancesResponse.json();
      setInsts(instances);
      for (const instance of instances) fetchSpark(instance);
    }
    const catalogResponse = await fetch('/api/catalog', { cache: 'no-store' });
    if (catalogResponse.ok) {
      const catalog = await catalogResponse.json();
      setPlans((previous) => (previous.length ? previous : catalog.plans));
      setImgs(catalog.images);
      setImgPickable(!!catalog.imagePickable);
      setAssignedImage(catalog.assignedImageId ?? null);
    }
    const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
    if (sessionResponse.ok) {
      const session = await sessionResponse.json();
      setRole(session?.user?.role ?? 'user');
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);

  const { busy, create, requestInstance, act } = useInstanceMutations(load);

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
    insts, plans, imgs, readyImgs, imgPickable, assignedImage, role, spark, loading, busy,
    planId, setPlanId, imageId, setImageId,
    load, create, requestInstance, act,
  };
}
