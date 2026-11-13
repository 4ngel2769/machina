/**
 * Account page: profile, password change, data export and self-deletion.
 */
'use client';

import { DeletionCard, PasswordCard, ProfileCard, RequestsCard } from './cards';
import { useAccount } from './use';

export default function AccountPage() {
  const account = useAccount();

  return (
    <>
      <h1>account</h1>
      <div className="sub">profile, credentials, data</div>

      <ProfileCard account={account} />
      <PasswordCard account={account} />
      <RequestsCard account={account} />
      <DeletionCard account={account} />
    </>
  );
}
