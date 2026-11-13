/** Data loading, sparkline fetches and form selection state for the list page. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Img, Inst, Plan, Sample } from './types';
import { useInstanceMutations } from './mutations';

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
  const readyImgs = imgs.filter((i) => i.status === 'ready');

  const load = useCallback(async () => {
    /** Live hypervisor metrics for one running VM; empty array otherwise. */
    const fetchSpark = (i: Inst) => {
      if (i.status !== 'running') {
        setSpark((p) => ({ ...p, [i.id]: [] }));
        return;
      }
      fetch(`/api/instances/${i.id}/metrics?range=1h`, { cache: 'no-store' })
        .then((x) => (x.ok ? x.json() : { points: [] }))
        .then((m) => setSpark((p) => ({ ...p, [i.id]: m.points ?? [] })))
        .catch(() => {});
    };
    const r = await fetch('/api/instances', { cache: 'no-store' });
    if (r.ok) {
      const j: Inst[] = await r.json();
      setInsts(j);
      for (const i of j) fetchSpark(i);
    }
    const a = await fetch('/api/catalog', { cache: 'no-store' });
    if (a.ok) {
      const j = await a.json();
      setPlans((o) => (o.length ? o : j.plans));
      setImgs(j.images);
      setImgPickable(!!j.imagePickable);
      setAssignedImage(j.assignedImageId ?? null);
    }
    const s = await fetch('/api/auth/session', { cache: 'no-store' });
    if (s.ok) {
      const j = await s.json();
      setRole(j?.user?.role ?? 'user');
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);

  const { busy, create, requestInstance, act } = useInstanceMutations(load);

  // Preselect plan + OS once the catalog lands; never override a user pick.
  useEffect(() => {
    if (plans.length === 0) return;
    setPlanId((o) => o || (plans[0]?.id ?? ''));
  }, [plans]);
  useEffect(() => {
    if (imgs.length === 0) return;
    setImageId((o) => o || (imgs.find((x) => x.status === 'ready')?.id ?? ''));
  }, [imgs]);

  return {
    insts, plans, imgs, readyImgs, imgPickable, assignedImage, role, spark, loading, busy,
    planId, setPlanId, imageId, setImageId,
    load, create, requestInstance, act,
  };
}
