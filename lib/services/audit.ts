import { getDb } from '@/lib/db';
import { audit } from '@/lib/db/schema';
import { newId } from '@/lib/core/crypto';

/** Fire-and-forget audit rows; failures never break the caller. */
export async function logAudit(input: {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  target?: string | null;
  detail?: Record<string, unknown> | string | null;
}): Promise<void> {
  try {
    await getDb().insert(audit).values({
      id: newId('aud_'),
      ts: Date.now(),
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      target: input.target ?? null,
      detail: typeof input.detail === 'string' ? input.detail : input.detail ? JSON.stringify(input.detail) : null,
    });
  } catch (e) {
    console.log('[audit] write failed:', (e as Error).message);
  }
}
