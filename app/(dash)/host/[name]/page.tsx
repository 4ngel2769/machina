import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { HostVm } from '@/app/ui/host/vm';

export const dynamic = 'force-dynamic';

export default async function HostVmPage({ params }: { params: Promise<{ name: string }> }) {
  const user = await requireUser();
  if (!user) redirect('/signin');
  if (user.role !== 'admin') redirect('/home');
  const { name } = await params;
  return <HostVm name={decodeURIComponent(name)} />;
}
