/**
 * The caller's own containers on their private docker network.
 */
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ContainersPanel } from '@/app/ui/containers';

export const dynamic = 'force-dynamic';

export default async function MyContainersPage() {
  const user = await requireUser();
  if (!user) redirect('/signin');
  return <ContainersPanel apiBase="/api/my-containers" tenant />;
}
