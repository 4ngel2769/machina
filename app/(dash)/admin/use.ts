/**
 * Data hooks for the admin console, one per sub-page so each route fetches
 * only what it renders. `post` is shared: every admin mutation goes through
 * /api/admin and then reloads the page's own data.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { Aud, DelReq, Img, InstReq, Plan, Quotas, User } from './types';

/** Shared mutation helper: POST an admin op, toast the outcome, reload. */
export function useAdminPost(reload: () => Promise<void> | void) {
  const toast = useToast();
  return useCallback(async (body: object, label = 'op') => {
    const response = await fetch('/api/admin', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (response.ok) toast.ok(`${label} done`);
    else toast.err(responseBody.error ?? `${label} failed`);
    void reload();
  }, [reload, toast]);
}

/** /admin/users: accounts + quotas + the pickers the assign/custom cards need. */
export function useAdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [quotas, setQuotas] = useState<Quotas>(null);

  const load = useCallback(async () => {
    const adminResponse = await fetch('/api/admin?limit=10&offset=0', { cache: 'no-store' });
    if (adminResponse.ok) {
      const body = await adminResponse.json();
      setUsers(body.users); setPlans(body.plans); setImgs(body.images);
    }
    const quotasResponse = await fetch('/api/quotas', { cache: 'no-store' });
    if (quotasResponse.ok) setQuotas(await quotasResponse.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  return { users, plans, imgs, quotas, load, post: useAdminPost(load) };
}

/** /admin/images: the qcow2 library. */
export function useAdminImages() {
  const toast = useToast();
  const [imgs, setImgs] = useState<Img[]>([]);
  const load = useCallback(async () => {
    const response = await fetch('/api/admin?limit=10&offset=0', { cache: 'no-store' });
    if (response.ok) setImgs((await response.json()).images);
  }, []);
  useEffect(() => { void load(); }, [load]);

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

  return { imgs, load, post: useAdminPost(load), importImage };
}

/** /admin/plans: plan table + per-plan usage counts. */
export function useAdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planUsage, setPlanUsage] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    const response = await fetch('/api/admin?limit=10&offset=0', { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json();
      setPlans(body.plans); setPlanUsage(body.planUsage ?? {});
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { plans, planUsage, load, post: useAdminPost(load) };
}

/** /admin/requests: pending instance + deletion queues. */
export function useAdminRequests() {
  const [reqs, setReqs] = useState<InstReq[]>([]);
  const [delReqs, setDelReqs] = useState<DelReq[]>([]);
  const load = useCallback(async () => {
    const requestsResponse = await fetch('/api/requests', { cache: 'no-store' });
    if (requestsResponse.ok) setReqs(await requestsResponse.json());
    const deletionResponse = await fetch('/api/deletion', { cache: 'no-store' });
    if (deletionResponse.ok) setDelReqs(await deletionResponse.json());
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { reqs, delReqs, load };
}

/** /admin/audit: the audit log with its pager. */
export function useAdminAudit() {
  const [aud, setAud] = useState<Aud[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin?limit=50&offset=${auditOffset}`, { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json();
      setAud(body.audit); setAuditTotal(body.auditTotal ?? body.audit.length);
    }
  }, [auditOffset]);
  useEffect(() => { void load(); }, [load]);
  return { aud, auditOffset, setAuditOffset, auditTotal };
}

/** /admin overview: counts + pending queues + host capacity + latest audit. */
export function useAdminOverview() {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [imgs, setImgs] = useState<Img[]>([]);
  const [reqs, setReqs] = useState<InstReq[]>([]);
  const [delReqs, setDelReqs] = useState<DelReq[]>([]);
  const [aud, setAud] = useState<Aud[]>([]);
  const [quotas, setQuotas] = useState<Quotas>(null);

  const load = useCallback(async () => {
    const adminResponse = await fetch('/api/admin?limit=8&offset=0', { cache: 'no-store' });
    if (adminResponse.ok) {
      const body = await adminResponse.json();
      setUsers(body.users); setPlans(body.plans); setImgs(body.images); setAud(body.audit);
    }
    const requestsResponse = await fetch('/api/requests', { cache: 'no-store' });
    if (requestsResponse.ok) setReqs(await requestsResponse.json());
    const deletionResponse = await fetch('/api/deletion', { cache: 'no-store' });
    if (deletionResponse.ok) setDelReqs(await deletionResponse.json());
    const quotasResponse = await fetch('/api/quotas', { cache: 'no-store' });
    if (quotasResponse.ok) setQuotas(await quotasResponse.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  return { users, plans, imgs, reqs, delReqs, aud, quotas, load };
}

export type AdminState = ReturnType<typeof useAdminOverview>;
