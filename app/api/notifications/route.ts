/**
 * The caller's notification feed: list, mark read, mark all read.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation, jsonBody, requireScope } from '@/lib/api';
import { z } from 'zod';
import { listNotifications, unreadCount, markRead, markAllRead } from '@/lib/services/notify';

export async function GET() {
  const denied = await requireScope('notifications:read');
  if (denied) return denied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  return json({ ok: true, items: listNotifications(user.id), unread: unreadCount(user.id) });
}

const actionSchema = z.object({
  op: z.string().optional(),
  id: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const denied = await requireScope('notifications:write');
  if (denied) return denied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const body = await jsonBody(req, actionSchema);
  if (body.op === 'read-all') return json({ ok: true, marked: markAllRead(user.id) });
  if (body.op === 'read' && body.id) {
    return markRead(user.id, body.id) ? json({ ok: true }) : err('not found', 404);
  }
  return err('op must be read|read-all');
}

export const dynamic = 'force-dynamic';
