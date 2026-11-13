/** One host VM: detail, live counters, and every edit the admin console makes. */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { logAudit } from '@/lib/services/audit';
import { vmDetail, applyVmOp, undefineVm, type VmOp } from '@/lib/host/domains';
import { virsh, listSnapshots, createSnapshot, revertSnapshot, deleteSnapshot } from '@/lib/core/driver';
import { friendlyError } from '@/lib/core/errors';

type Live = {
  cpuSec: number; memMb: number; maxMemMb: number;
  nets: { name: string; rxBytes: number; txBytes: number }[];
  blocks: { name: string; rdBytes: number; wrBytes: number }[];
};

type ByteMaps = {
  nets: Map<string, { rxBytes: number; txBytes: number }>;
  blocks: Map<string, { rdBytes: number; wrBytes: number }>;
};

/** Fold one domstats line into the accumulator it belongs to. */
function foldStat(out: Live, maps: ByteMaps, key: string, n: number) {
  if (key === 'cpu.time') { out.cpuSec = n / 1e9; return; }
  if (key === 'balloon.current') { out.memMb = Math.round(n / 1024); return; }
  if (key === 'balloon.maximum') { out.maxMemMb = Math.round(n / 1024); return; }
  const net = key.match(/^net\.(\d+)\.(rx|tx)\.bytes$/);
  if (net) {
    const cur = maps.nets.get(net[1]) ?? { rxBytes: 0, txBytes: 0 };
    if (net[2] === 'rx') cur.rxBytes = n; else cur.txBytes = n;
    maps.nets.set(net[1], cur);
    return;
  }
  const blk = key.match(/^block\.(\d+)\.(rd|wr)\.bytes$/);
  if (blk) {
    const cur = maps.blocks.get(blk[1]) ?? { rdBytes: 0, wrBytes: 0 };
    if (blk[2] === 'rd') cur.rdBytes = n; else cur.wrBytes = n;
    maps.blocks.set(blk[1], cur);
  }
}

async function liveStats(name: string): Promise<Live> {
  const out: Live = { cpuSec: 0, memMb: 0, maxMemMb: 0, nets: [], blocks: [] };
  const maps: ByteMaps = { nets: new Map(), blocks: new Map() };
  const txt = await virsh(['domstats', name, '--cpu-total', '--balloon', '--interface', '--block']).catch(() => '');
  for (const line of txt.split('\n')) {
    const [k, v] = line.trim().split('=');
    if (!k || v === undefined) continue;
    foldStat(out, maps, k, Number(v));
  }
  out.nets = [...maps.nets].map(([name2, v]) => ({ name: name2, ...v }));
  out.blocks = [...maps.blocks].map(([name2, v]) => ({ name: name2, ...v }));
  return out;
}

export async function GET(req: NextRequest) {
  const { response: e } = await requireAdmin();
  if (e) return e;
  const name = req.nextUrl.searchParams.get('name') ?? '';
  try {
    const [detail, live, snaps, hyper] = await Promise.all([
      vmDetail(name),
      liveStats(name),
      listSnapshots(name).catch(() => []),
      virsh(['dominfo', name]).catch(() => ''),
    ]);
    return json({ vm: detail, live, snapshots: snaps, dominfo: hyper });
  } catch (x) {
    return err(friendlyError(x), 400);
  }
}

type Admin = { id: string; name: string };
type VmBody = Record<string, unknown> & { name?: string };

/** Snapshot ops have their own invariants (nested deletes, paused-after-revert),
 *  so they dispatch before the generic domain-edit path. */
async function snapshotOp(body: VmBody, name: string, admin: Admin) {
  const snap = String(body.snapName ?? '');
  if (body.op === 'snapshotCreate') {
    const label = snap || `snap-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;
    await createSnapshot(name, label);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.snapshotCreate', target: name, detail: { snap: label } });
    return json({ ok: true, result: 'snapshot created' });
  }
  if (body.op === 'snapshotRevert') {
    await revertSnapshot(name, snap);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.snapshotRevert', target: name, detail: { snap: body.snapName } });
    return json({ ok: true, result: 'reverted (the VM may be left paused)' });
  }
  if (body.op === 'snapshotDelete') {
    await deleteSnapshot(name, snap);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.snapshotDelete', target: name, detail: { snap: body.snapName } });
    return json({ ok: true, result: 'snapshot deleted' });
  }
  return null;
}

async function undefineOp(name: string, admin: Admin) {
  await undefineVm(name);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.undefine', target: name, detail: null });
  return json({ ok: true, result: 'definition removed' });
}

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const { user: admin, response: e } = await requireAdmin();
  if (e) return e;
  const body = (await req.json().catch(() => ({}))) as VmBody;
  const name = String(body.name ?? '');
  try {
    const snap = await snapshotOp(body, name, admin);
    if (snap) return snap;
    if (body.op === 'undefine') return await undefineOp(name, admin);
    const op = body as unknown as VmOp;
    const result = await applyVmOp(name, op);
    await logAudit({
      actorId: admin.id, actorName: admin.name, action: `host.vm.${body.op}`,
      target: name, detail: body as Record<string, unknown>,
    });
    return json({ ok: true, result });
  } catch (x) {
    return err(friendlyError(x), 400);
  }
}
