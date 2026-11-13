/**
 * Admin view of the Docker daemon on this host.
 */
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ContainersPanel } from '@/app/ui/containers';

export const dynamic = 'force-dynamic';

/** Admin-only view of the Docker daemon on this host. */
export default async function ContainersPage() {
  const user = await requireUser();
  if (!user) redirect('/signin');
  if (user.role !== 'admin') redirect('/my-containers');
  return <ContainersPanel apiBase="/api/containers" admin />;
}
