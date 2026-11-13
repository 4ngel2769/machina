/** All fetches and mutations for the admin console. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { Aud, DelReq, Img, InstReq, Plan, Quotas, User } from './types';

export function useAdmin(): {
  users: User[]; plans: Plan[]; planUsage: Record<string, number>; imgs: Img[];
  aud: Aud[]; reqs: InstReq[]; delReqs: DelReq[];
  auditOffset: number; setAuditOffset: (v: number) => void; auditTotal: number;
  quotas: Quotas;
  load: () => Promise<void>;
  post: (body: object, label?: string) => Promise<void>;
  importImage: (id: string, name: string, file: File | null, close: () => void) => Promise<void>;
} {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planUsage, setPlanUsage] = useState<Record<string, number>>({});
  const [imgs, setImgs] = useState<Img[]>([]);
  const [aud, setAud] = useState<Aud[]>([]);
  const [reqs, setReqs] = useState<InstReq[]>([]);
  const [delReqs, setDelReqs] = useState<DelReq[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [quotas, setQuotas] = useState<Quotas>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin?limit=50&offset=${auditOffset}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setUsers(j.users); setPlans(j.plans); setImgs(j.images); setAud(j.audit);
      setPlanUsage(j.planUsage ?? {});
      setAuditTotal(j.auditTotal ?? j.audit.length);
    }
    const rq = await fetch('/api/requests', { cache: 'no-store' });
    if (rq.ok) setReqs(await rq.json());
    const dq = await fetch('/api/deletion', { cache: 'no-store' });
    if (dq.ok) setDelReqs(await dq.json());
    const qq = await fetch('/api/quotas', { cache: 'no-store' });
    if (qq.ok) setQuotas(await qq.json());
  }, [auditOffset]);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: object, label = 'op') => {
    const r = await fetch('/api/admin', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast.ok(`${label} done`);
    else toast.err(j.error ?? `${label} failed`);
    void load();
  };

  const importImage = async (id: string, name: string, file: File | null, close: () => void) => {
    if (!file || !id) { toast.err('pick an id and a qcow2 file first'); return; }
    const qs = new URLSearchParams({ id, name: name || id });
    try {
      const r = await fetch(`/api/images/import?${qs}`, { method: 'POST', body: file });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { toast.ok(`image ${id} imported`); close(); }
      else toast.err(j.error ?? 'import failed');
      void load();
    } catch {
      toast.err('import failed');
    }
  };

  return {
    users, plans, planUsage, imgs, aud, reqs, delReqs,
    auditOffset, setAuditOffset, auditTotal, quotas,
    load, post, importImage,
  };
}

export type AdminState = ReturnType<typeof useAdmin>;
