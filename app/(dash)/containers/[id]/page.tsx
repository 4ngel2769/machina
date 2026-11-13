/**
 * Container detail: logs, exec console, stats and inspect for one docker
 * container. Admin-only — every API route behind it enforces the role.
 */
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import ContainerDetailPage from './detail-page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await requireUser();
  if (!user) redirect('/signin');
  if (user.role !== 'admin') redirect('/home');
  return <ContainerDetailPage />;
}
