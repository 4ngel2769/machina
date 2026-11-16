/**
 * Admin queues: instance requests and account-deletion requests.
 */
'use client';

import { DeletionsCard, RequestsCard } from './cards';
import { useAdminRequests } from '../use';

export default function AdminRequestsPage() {
  const admin = useAdminRequests();

  return (
    <>
      <h1>requests</h1>
      <div className="sub">instance and deletion queues awaiting review</div>
      <RequestsCard reqs={admin.reqs} reload={admin.load} />
      <DeletionsCard delReqs={admin.delReqs} reload={admin.load} />
    </>
  );
}
