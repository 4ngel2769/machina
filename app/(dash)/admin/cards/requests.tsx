/** Request queues: instance requests and account-deletion requests. */

'use client';

import { useEffect, useState } from 'react';
import type { AdminState } from '../use';
import type { DelReq, Img, InstReq, Plan } from '../types';

import { useToast } from '@/app/ui/toast';
import { Empty } from '@/app/ui/loaders';

async function decide(url: string, operation: string, okMsg: string, toast: ReturnType<typeof useToast>, reload: () => Promise<void>) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: operation }) });
  const body = await res.json().catch(() => ({}));
  if (res.ok) toast.ok(okMsg); else toast.err(body.error ?? 'fail');
  void reload();
}

export function RequestsCard({ admin }: { admin: AdminState }) {
  const toast = useToast();
  const pending = admin.reqs.filter((request) => request.status === 'pending').length;
  return (
    <div className="card">
      <h3>instance requests ({pending} pending)</h3>
      <table>
        <thead><tr><th>user</th><th>name</th><th>plan</th><th>status</th><th>note</th><th>actions</th></tr></thead>
        <tbody>
          {admin.reqs.length === 0 && <tr><td colSpan={6}><Empty icon="inbox" text="no instance requests" /></td></tr>}
          {admin.reqs.map((request) => (
            <ReqRow key={request.id} request={request} toast={toast} reload={admin.load} />
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>approve/reject via the request id: use the buttons (wired to /api/requests/[id])</div>
    </div>
  );
}

function ReqRow({ request, toast, reload }: { request: InstReq; toast: ReturnType<typeof useToast>; reload: () => Promise<void> }) {
  return (
    <tr>
      <td>{request.userId.slice(0, 8)}</td>
      <td className="mono">{request.name}</td>
      <td>{request.planId}</td>
      <td>{request.status}</td>
      <td className="muted" style={{ fontSize: 11 }}>{request.note ?? '—'}</td>
      <td>
        {request.status === 'pending' && (
          <>
            <button onClick={async () => {
              const res = await fetch(`/api/requests/${request.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'approve' }) });
              const body = await res.json().catch(() => ({}));
              if (res.ok) toast.ok(`approved (${body.instanceId ?? ''})`); else toast.err(body.error ?? 'fail');
              void reload();
            }} style={{ padding: '2px 8px', fontSize: 11 }}>approve</button>
            <button onClick={() => void decide(`/api/requests/${request.id}`, 'reject', 'rejected', toast, reload)} style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>reject</button>
          </>
        )}
      </td>
    </tr>
  );
}

export function DeletionsCard({ admin }: { admin: AdminState }) {
  const toast = useToast();
  const pending = admin.delReqs.filter((delReq) => delReq.status === 'pending').length;
  return (
    <div className="card">
      <h3>deletion requests ({pending} pending)</h3>
      <table>
        <thead><tr><th>user</th><th>status</th><th>requested</th><th>actions</th></tr></thead>
        <tbody>
          {admin.delReqs.length === 0 && <tr><td colSpan={4}><Empty icon="inbox" text="no deletion requests" /></td></tr>}
          {admin.delReqs.map((delReq) => (
            <DelRow key={delReq.id} delReq={delReq} toast={toast} reload={admin.load} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DelRow({ delReq, toast, reload }: { delReq: DelReq; toast: ReturnType<typeof useToast>; reload: () => Promise<void> }) {
  return (
    <tr>
      <td className="mono">{delReq.userId.slice(0, 12)}</td>
      <td>{delReq.status}</td>
      <td>{new Date(delReq.requestedAt).toLocaleString()}</td>
      <td>
        {delReq.status === 'pending' && (
          <>
            <button onClick={async () => {
              const res = await fetch(`/api/deletion/${delReq.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'fulfill' }) });
              const body = await res.json().catch(() => ({}));
              if (res.ok) toast.ok(`fulfilled (${body.destroyed ?? 0} VMs)`); else toast.err(body.error ?? 'fail');
              void reload();
            }} style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger, #f87171)' }}>fulfill (delete)</button>
            <button onClick={() => void decide(`/api/deletion/${delReq.id}`, 'reject', 'rejected', toast, reload)} style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }}>reject</button>
          </>
        )}
      </td>
    </tr>
  );
}
