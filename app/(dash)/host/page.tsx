import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { HostPanel } from '@/app/ui/host/panel';

export const dynamic = 'force-dynamic';

/** Admin-only console for the hypervisor itself. */
export default async function HostPage() {
  const user = await requireUser();
  if (!user) redirect('/signin');
  if (user.role !== 'admin') redirect('/home');
  return <HostPanel />;
}
