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
    const adminResponse = await fetch(`/api/admin?limit=50&offset=${auditOffset}`, { cache: 'no-store' });
    if (adminResponse.ok) {
      const adminJson = await adminResponse.json();
      setUsers(adminJson.users); setPlans(adminJson.plans); setImgs(adminJson.images); setAud(adminJson.audit);
      setPlanUsage(adminJson.planUsage ?? {});
      setAuditTotal(adminJson.auditTotal ?? adminJson.audit.length);
    }
    const requestsResponse = await fetch('/api/requests', { cache: 'no-store' });
    if (requestsResponse.ok) setReqs(await requestsResponse.json());
    const deletionResponse = await fetch('/api/deletion', { cache: 'no-store' });
    if (deletionResponse.ok) setDelReqs(await deletionResponse.json());
    const quotasResponse = await fetch('/api/quotas', { cache: 'no-store' });
    if (quotasResponse.ok) setQuotas(await quotasResponse.json());
  }, [auditOffset]);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: object, label = 'op') => {
    const response = await fetch('/api/admin', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (response.ok) toast.ok(`${label} done`);
    else toast.err(responseBody.error ?? `${label} failed`);
    void load();
  };

  const importImage = async (id: string, name: string, file: File | null, close: () => void) => {
    if (!file || !id) { toast.err('pick an id and a qcow2 file first'); return; }
    const queryString = new URLSearchParams({ id, name: name || id });
    try {
      const response = await fetch(`/api/images/import?${queryString}`, { method: 'POST', body: file });
      const responseBody = await response.json().catch(() => ({}));
      if (response.ok) { toast.ok(`image ${id} imported`); close(); }
      else toast.err(responseBody.error ?? 'import failed');
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
