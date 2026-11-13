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

export async function GET(req: NextRequest) {
  const { response: e } = await requireAdmin();
  if (e) return e;
  if (req.nextUrl.searchParams.get('log')) return json(hostLog());

  const [vms, nets] = await Promise.all([
    listVms().catch((x) => ({ error: (x as Error).message }) as never),
    listNetworks().catch((x) => ({ error: (x as Error).message }) as never),
  ]);
  // Interfaces carry a 60-point traffic series each; ~90 of them is a couple of
  // hundred KB per poll, and only the interfaces tab draws it.
  const wantIfaces = Boolean(req.nextUrl.searchParams.get('ifaces'));
  const ifaces = wantIfaces && Array.isArray(nets)
    ? await listIfaces(bridges(nets)).catch(() => [])
    : [];
  // pool-info is one process per pool, so it is opt-in like the interface table.
  const wantPools = Boolean(req.nextUrl.searchParams.get('pools'));
  const pools = wantPools ? await listPools().catch(() => []) : [];

  const insts = rawDb().prepare(
    `select i.domain_name, i.id, i.plan_id, i.mac, i.ip, u.id uid, u.name uname, u.role urole, u.balance_cents
     from instances i left join users u on u.id=i.user_id`,
  ).all() as { domain_name: string; id: string; plan_id: string; mac: string; ip: string; uid: string | null; uname: string | null; urole: string | null; balance_cents: number }[];

  const users = rawDb().prepare(`select id, name, role, balance_cents from users order by name`).all();

  // /proc/meminfo MemTotal excludes firmware-reserved pages, which is the number
  // worth showing for "how much RAM can I hand a VM".
  let totalMem = 0;
  try { totalMem = Number(/MemTotal:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? 0) / 1024; } catch { /* fall back to os.totalmem */ }

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
      memTotalMb: Math.round(totalMem || os.totalmem() / 1048576),
      memFreeMb: Math.round(os.freemem() / 1048576),
      uptimeSec: Math.round(os.uptime()),
      release: os.release(),
    },
  });
}

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const { user: admin, response: e } = await requireAdmin();
  if (e) return e;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.op === 'log') return json(hostLog());
  if (body.op === 'poolRefresh') {
    try {
      const result = await refreshPool(String(body.name ?? ''));
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.pool.refresh', target: String(body.name ?? ''), detail: null });
      return json({ ok: true, result });
    } catch (x) {
      return err(friendlyError(x), 400);
    }
  }
  return err('unknown operation');
}
