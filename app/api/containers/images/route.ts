/** Docker image inventory (GET), pull (POST) and remove (DELETE). */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin, jsonBody } from '@/lib/api';
import { z } from 'zod';
import { listImages, pullImage, removeImage } from '@/lib/host/docker-images';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export async function GET() {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  try {
    return json({ images: await listImages() });
  } catch (error) {
    return err(friendlyError(error), 502);
  }
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user, response: denied } = await requireAdmin();
  if (denied) return denied;
  const body = await jsonBody(req, z.object({ image: z.unknown().optional() }));
  try {
    const image = String(body.image ?? '').trim();
    const pulled = await pullImage(image);
    await logAudit({ actorId: user.id, actorName: user.name, action: 'image.pull', target: pulled, detail: { image } });
    return json({ ok: true, image: pulled });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export async function DELETE(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user, response: denied } = await requireAdmin();
  if (denied) return denied;
  // ref travels in the query string: DELETE bodies are legal but flaky through
  // proxies, and the reference is already validated inside removeImage.
  const ref = (req.nextUrl.searchParams.get('ref') ?? '').trim();
  if (!ref) return err('ref required', 400);
  try {
    const removed = await removeImage(ref);
    await logAudit({ actorId: user.id, actorName: user.name, action: 'image.remove', target: ref, detail: {} });
    return json({ ok: true, removed });
  } catch (error) {
    return err(friendlyError(error), 409);
  }
}
