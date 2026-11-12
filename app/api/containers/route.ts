import { NextRequest } from 'next/server';
import { json, requireAdmin } from '@/lib/api';
import { listContainers, dockerAvailable } from '@/lib/host/docker';
import { friendlyError } from '@/lib/core/errors';

/** Docker inventory for the admin console. Read-only; lifecycle lives on the
 *  per-container route so a mutation always names exactly one container. */

export async function GET(_req: NextRequest) {
  const [, denied] = await requireAdmin();
  if (denied) return denied;

  const available = await dockerAvailable();
  if (!available) {
    // 'no docker on this host' is a state, not a failure: say it as one.
    return json({ available: false, containers: [], error: null });
  }
  try {
    return json({ available: true, containers: await listContainers(), error: null });
  } catch (e) {
    return json({ available: true, containers: [], error: friendlyError(e) });
  }
}
