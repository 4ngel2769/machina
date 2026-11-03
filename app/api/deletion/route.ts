import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { requireAdmin, json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { instances, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { now } from '@/lib/core/util';
import { newId } from '@/lib/core/crypto';
import { enqueue } from '@/lib/core/jobs';
import { logAudit } from '@/lib/services/audit';

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const db = getDb();
  const rd = rawDb();
  const rows = user.role === 'admin'
    ? rd.prepare(`select * from deletion_requests order by requested_at asc`).all()
    : rd.prepare(`select * from deletion_requests where user_id=?`).all(user.id);
  return json(rows);
}

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  if (user.role === 'admin') return err('admins do not self-delete via this endpoint', 400);
  const rd = rawDb();
  const pending = rd.prepare(`select 1 from deletion_requests where user_id=? and status='pending'`).get(user.id);
  if (pending) return err('a deletion request is already pending', 409);
  const id = newId('del_');
  rawDb().prepare(`insert into deletion_requests (id,user_id,status,requested_at) values (?,?,?,?)`).run(id, user.id, 'pending', now());
  await logAudit({ actorId: user.id, actorName: user.name, action: 'gdpr.delete.request', target: id });
  return json({ id, status: 'pending' }, 201);
}

export const dynamic = 'force-dynamic';
