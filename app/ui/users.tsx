/**
 * Account lifecycle for the admin panel.
 *
 * The premise: registration is not open. Every account is minted by an admin,
 * starts with nothing (no credit, zero quota) and gets access deliberately.
 * So this is the only place a human can: create, rename-by-recreate, set a
 * password, promote/demote, suspend, top up, and delete.
 *
 * Delete deliberately refuses while the account still owns instances: those
 * own qcow2 overlays, IP leases and VNC sockets, and they must be destroyed
 * through the normal handler rather than orphaned.
 */

'use client';

import { useUserAdmin } from './users/actions';
import { CreateForm, UserTable } from './users/table';
import type { AdminUser, Allocation } from './users/types';

export type { AdminUser };

export function UserAdmin({
  users,
  allocations,
  onChanged,
}: {
  users: AdminUser[];
  allocations: Allocation[];
  onChanged: () => void;
}) {
  const s = useUserAdmin(onChanged);

  return (
    <>
      <CreateForm send={s.send} busy={s.busy} />

      <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
        New accounts start with the credit above (default $0.00) and a zero allocation,
        so they cannot provision anything until you set their quota in the panel above.
      </div>

      <UserTable users={users} allocations={allocations} s={s} />
    </>
  );
}
