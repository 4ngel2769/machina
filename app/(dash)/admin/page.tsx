/**
 * Admin overview: the numbers that need eyes first, then the newest audit
 * entries. Everything actionable lives on its own sub-page — this page is a
 * glance, not a workbench.
 */
'use client';

import Link from 'next/link';
import { useAdminOverview } from './use';
import { Empty } from '@/app/ui/loaders';
import type { Aud } from './types';

function Metric({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}

function pendingReqs(reqs: { status: string }[]) {
  return reqs.filter((request) => request.status === 'pending').length;
}

function AuditPreview({ aud }: { aud: Aud[] }) {
  return (
    <div className="card">
      <h3>recent activity</h3>
      {aud.length === 0 ? <Empty icon="file-text" text="no audit entries" /> : (
        <table>
          <tbody>
            {aud.map((entry) => (
              <tr key={entry.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(entry.ts).toLocaleString()}</td>
                <td>{entry.actorName ?? '—'}</td>
                <td>{entry.action}</td>
                <td className="mono">{entry.target ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 10 }}>
        <Link href="/admin/audit" style={{ fontSize: 12 }}>full audit log →</Link>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const admin = useAdminOverview();
  const host = admin.quotas?.host;

  return (
    <>
      <h1>admin</h1>
      <div className="sub">platform at a glance — manage details under admin in the dock</div>

      <div className="metrics">
        <div className="metrics-stats">
          <Metric label="accounts" value={admin.users.length} href="/admin/users" />
          <Metric label="plans" value={admin.plans.length} href="/admin/plans" />
          <Metric label="images" value={admin.imgs.length} href="/admin/images" />
          <Metric label="pending requests" value={pendingReqs(admin.reqs)} href="/admin/requests" />
          <Metric label="deletion requests" value={pendingReqs(admin.delReqs)} href="/admin/requests" />
          {host && (
            <Metric
              label="host capacity"
              value={`${host.committed.running} running · ${Math.round(host.committed.memoryMb / 1024)}GB RAM · ${host.committed.diskGb}GB disk`}
            />
          )}
        </div>
      </div>

      <AuditPreview aud={admin.aud} />
    </>
  );
}
