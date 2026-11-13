/**
 * Account page: profile, password change, data export and self-deletion.
 */
'use client';

import { DeletionCard, PasswordCard, ProfileCard, RequestsCard } from './cards';
import { useAccount } from './use';

export default function AccountPage() {
  const a = useAccount();

  return (
    <>
      <h1>account</h1>
      <div className="sub">profile, credentials, data</div>

      <ProfileCard a={a} />
      <PasswordCard a={a} />
      <RequestsCard a={a} />
      <DeletionCard a={a} />
    </>
  );
}
