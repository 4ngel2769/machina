/**
 * Admin audit log.
 */
'use client';

import { AuditCard } from './card';
import { useAdminAudit } from '../use';

export default function AdminAuditPage() {
  const admin = useAdminAudit();

  return (
    <>
      <h1>audit</h1>
      <div className="sub">every admin action, newest first</div>
      <AuditCard aud={admin.aud} auditOffset={admin.auditOffset} setAuditOffset={admin.setAuditOffset} auditTotal={admin.auditTotal} />
    </>
  );
}
