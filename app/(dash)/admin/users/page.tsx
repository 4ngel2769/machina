/**
 * Admin console: users, quotas, OS/box assignment.
 */
'use client';

import { AssignBoxCard, CustomBoxCard, OsAssignCard, QuotasCard, UsersCard } from './cards';
import { useAdminUsers } from '../use';

export default function AdminUsersPage() {
  const admin = useAdminUsers();

  return (
    <>
      <h1>users</h1>
      <div className="sub">accounts, credits, allocations, OS and box assignment</div>

      <UsersCard users={admin.users} quotas={admin.quotas} onChanged={() => void admin.load()} />
      <QuotasCard quotas={admin.quotas} onSaved={() => void admin.load()} />
      <OsAssignCard users={admin.users} imgs={admin.imgs} post={admin.post} />
      <CustomBoxCard users={admin.users} imgs={admin.imgs} onCreated={() => void admin.load()} />
      <AssignBoxCard users={admin.users} plans={admin.plans} imgs={admin.imgs} post={admin.post} />
    </>
  );
}
