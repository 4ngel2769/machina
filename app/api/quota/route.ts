import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { quotaWithUsage, pct, getPendingUsage } from '@/lib/core/quota';

export async function GET(_req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);

  // A user sees their own quota and their own usage. Admins get the full fleet
  // picture from /api/quotas instead, which is admin-gated.
  const { quota, usage } = quotaWithUsage(user.id);
  // Pending is reported separately but is what quota counts. Showing only the
  // instances would have the user staring at "0 of 1 used" while being refused
  // for already having one in flight.
  const pending = getPendingUsage(user.id);
  return json({
    ok: true,
    quota,
    usage,
    pending,
    pct: {
      vms: pct(usage.vms + pending.vms, quota.maxVms),
      vcpus: pct(usage.vcpus + pending.vcpus, quota.maxVcpus),
      memoryMb: pct(usage.memoryMb + pending.memoryMb, quota.maxMemoryMb),
      diskGb: pct(usage.diskGb + pending.diskGb, quota.maxDiskGb),
    },
  });
}

export const dynamic = 'force-dynamic';