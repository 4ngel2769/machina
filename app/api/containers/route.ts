/** Docker inventory (GET) and a narrow create (POST) for the admin console.
 *  Lifecycle and removal live on the per-container route so a mutation always
 *  names exactly one container. */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin, jsonBody } from '@/lib/api';
import { z } from 'zod';
import { listContainers, dockerAvailable } from '@/lib/host/docker';
import { parseCreate, createContainer } from '@/lib/host/docker-create';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export async function GET(_req: NextRequest) {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;

  const available = await dockerAvailable();
  if (!available) {
    // 'no docker on this host' is a state, not a failure: say it as one.
    return json({ available: false, containers: [], error: null });
  }
  try {
    return json({ available: true, containers: await listContainers(), error: null });
  } catch (error) {
    return json({ available: true, containers: [], error: friendlyError(error) });
  }
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: user, response: denied } = await requireAdmin();
  if (denied) return denied;

  const body = await jsonBody(req, z.object({}).passthrough());
  try {
    const spec = parseCreate(body);
    const id = await createContainer(spec);
    await logAudit({
      actorId: user.id, actorName: user.name,
      action: 'container.create', target: spec.name,
      detail: { image: spec.image, memoryMb: spec.memoryMb, cpus: spec.cpus, ports: spec.ports },
    });
    return json({ ok: true, id, name: spec.name });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}
