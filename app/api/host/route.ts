/**
 * Host inventory for the admin console. Admin-only: this exposes every domain
 * and interface on the machine, including ones that do not belong to machina.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { listVms } from '@/lib/host/domains';
import { listNetworks, bridges } from '@/lib/host/networks';
import { listIfaces } from '@/lib/host/ifaces';
import { listPools, refreshPool } from '@/lib/host/pools';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';
import { jsonBody } from '@/lib/api';
import { z } from 'zod';
const hostBodySchema = z.object({ op: z.string().optional(), name: z.string().optional() }).passthrough();
import os from 'os';
import fs from 'fs';

/** Host actions land in the shared audit table under host.*, so the log tab is
 *  just a filtered read of the stream every other admin action already uses. */
function hostLog(): { rows: unknown[] } {
  const rows = rawDb().prepare(
    `select id, ts, actor_name, action, target, detail from audit
     where action like 'host.%' order by ts desc limit 200`,
  ).all();
  return { rows };
}

/** Opt-in sections: interface traffic series and pool info are expensive
 *  enough that the page asks for them only when their tab is open. */
async function optionalSections(req: NextRequest, nets: unknown) {
  const wantIfaces = Boolean(req.nextUrl.searchParams.get('ifaces'));
  const wantPools = Boolean(req.nextUrl.searchParams.get('pools'));
  const ifaces = wantIfaces && Array.isArray(nets)
    ? await listIfaces(bridges(nets)).catch(() => [])
    : [];
  const pools = wantPools ? await listPools().catch(() => []) : [];
  return { ifaces, pools };
}

/** /proc/meminfo MemTotal excludes firmware-reserved pages, which is the
 *  number worth showing for "how much RAM can I hand a VM". */
function memTotalMb() {
  try {
    const kb = Number(/MemTotal:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? 0);
    return kb / 1024;
  } catch {
    return os.totalmem() / 1048576;
  }
}

export async function GET(req: NextRequest) {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  if (req.nextUrl.searchParams.get('log')) return json(hostLog());

  const [vms, nets] = await Promise.all([
    listVms().catch((err) => ({ error: (err as Error).message }) as never),
    listNetworks().catch((err) => ({ error: (err as Error).message }) as never),
  ]);
  const { ifaces, pools } = await optionalSections(req, nets);

  const insts = rawDb().prepare(
    `select i.domain_name, i.id, i.plan_id, i.mac, i.ip, u.id uid, u.name uname, u.role urole, u.balance_cents
     from instances i left join users u on u.id=i.user_id`,
  ).all() as { domain_name: string; id: string; plan_id: string; mac: string; ip: string; uid: string | null; uname: string | null; urole: string | null; balance_cents: number }[];

  const users = rawDb().prepare(`select id, name, role, balance_cents from users order by name`).all();

  return json({
    vms: Array.isArray(vms) ? vms : [],
    vmsError: Array.isArray(vms) ? null : (vms as { error: string }).error,
    networks: Array.isArray(nets) ? nets : [],
    networksError: Array.isArray(nets) ? null : (nets as { error: string }).error,
    interfaces: ifaces,
    pools,
    instances: insts,
    users,
    host: {
      hostname: os.hostname(),
      cpus: os.cpus().length,
      load: os.loadavg(),
      memTotalMb: Math.round(memTotalMb() || os.totalmem() / 1048576),
      memFreeMb: Math.round(os.freemem() / 1048576),
      uptimeSec: Math.round(os.uptime()),
      release: os.release(),
    },
  });
}

async function poolRefresh(name: string, admin: { id: string; name: string }) {
  try {
    const result = await refreshPool(name);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.pool.refresh', target: name, detail: null });
    return json({ ok: true, result });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;
  const body = await jsonBody(req, hostBodySchema);
  if (body.op === 'log') return json(hostLog());
  if (body.op === 'poolRefresh') return poolRefresh(String(body.name ?? ''), admin);
  return err('unknown operation');
}
