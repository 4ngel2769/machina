/** Docker inventory (GET) and a narrow create (POST) for the admin console.
 *  Lifecycle and removal live on the per-container route so a mutation always
 *  names exactly one container. */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { listContainers, dockerAvailable, parseCreate, createContainer } from '@/lib/host/docker';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

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

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const [user, denied] = await requireAdmin();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const spec = parseCreate(body);
    const id = await createContainer(spec);
    await logAudit({
      actorId: user.id, actorName: user.name,
      action: 'container.create', target: spec.name,
      detail: { image: spec.image, memoryMb: spec.memoryMb, cpus: spec.cpus, ports: spec.ports },
    });
    return json({ ok: true, id, name: spec.name });
  } catch (e) {
    return err(friendlyError(e), 400);
  }
}
