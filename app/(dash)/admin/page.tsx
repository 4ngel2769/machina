/**
 * Admin console: users, plans, images, the quota editor, requests and the audit log.
 */
'use client';

import {
  AssignBoxCard, AuditCard, CustomBoxCard, DeletionsCard, ImagesCard,
  OsAssignCard, PlansCard, QuotasCard, RequestsCard, UsersCard,
} from './cards';
import { useAdmin } from './use';

export default function AdminPage() {
  const admin = useAdmin();

  return (
    <>
      <h1>admin</h1>
      <div className="sub">accounts, credits, images, plans, audit trail</div>

      <QuotasCard admin={admin} />
      <UsersCard admin={admin} />
      <ImagesCard admin={admin} />
      <PlansCard admin={admin} />
      <OsAssignCard admin={admin} />
      <CustomBoxCard admin={admin} />
      <AssignBoxCard admin={admin} />
      <RequestsCard admin={admin} />
      <DeletionsCard admin={admin} />
      <AuditCard admin={admin} />
    </>
  );
}
