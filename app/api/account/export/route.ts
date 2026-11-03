import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { instances, sshKeys, ledger } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const db = getDb();
  const rd = rawDb();
  const myInsts = await db.select().from(instances).where(eq(instances.userId, user.id));
  const myKeys = await db.select().from(sshKeys).where(eq(sshKeys.userId, user.id));
  const myLedger = await db.select().from(ledger).where(eq(ledger.userId, user.id));
  const payload = {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, name: user.name, role: user.role },
    instances: myInsts.map((i) => ({ ...i, rootPassEnc: undefined, vncPass: undefined })),
    sshKeys: myKeys,
    ledger: myLedger,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="machina-export-${user.name}.json"` },
  });
}

export const dynamic = 'force-dynamic';
