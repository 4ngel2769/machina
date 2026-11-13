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

async function liveStats(name: string): Promise<Live> {
  const out: Live = { cpuSec: 0, memMb: 0, maxMemMb: 0, nets: [], blocks: [] };
  const txt = await virsh(['domstats', name, '--cpu-total', '--balloon', '--interface', '--block']).catch(() => '');
  const nets = new Map<string, { rxBytes: number; txBytes: number }>();
  const blocks = new Map<string, { rdBytes: number; wrBytes: number }>();
  for (const line of txt.split('\n')) {
    const [k, v] = line.trim().split('=');
    if (!k || v === undefined) continue;
    const n = Number(v);
    if (k === 'cpu.time') out.cpuSec = n / 1e9;
    if (k === 'balloon.current') out.memMb = Math.round(n / 1024);
    if (k === 'balloon.maximum') out.maxMemMb = Math.round(n / 1024);
    let m = k.match(/^net\.(\d+)\.(rx|tx)\.bytes$/);
    if (m) {
      const key = m[1];
      const cur = nets.get(key) ?? { rxBytes: 0, txBytes: 0 };
      if (m[2] === 'rx') cur.rxBytes = n; else cur.txBytes = n;
      nets.set(key, cur);
    }
    m = k.match(/^block\.(\d+)\.(rd|wr)\.bytes$/);
    if (m) {
      const key = m[1];
      const cur = blocks.get(key) ?? { rdBytes: 0, wrBytes: 0 };
      if (m[2] === 'rd') cur.rdBytes = n; else cur.wrBytes = n;
      blocks.set(key, cur);
    }
  }
  out.nets = [...nets].map(([name2, v]) => ({ name: name2, ...v }));
  out.blocks = [...blocks].map(([name2, v]) => ({ name: name2, ...v }));
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

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const { user: admin, response: e } = await requireAdmin();
  if (e) return e;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & { name?: string };
  const name = String(body.name ?? '');
  try {
    // Snapshot operations live next to the domain edits because they are the
    // only ones with their own invariants (nested deletes, paused-after-revert).
    if (body.op === 'snapshotCreate') {
      const snap = String(body.snapName ?? '') || `snap-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;
      await createSnapshot(name, snap);
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.snapshotCreate', target: name, detail: { snap } });
      return json({ ok: true, result: 'snapshot created' });
    }
    if (body.op === 'snapshotRevert') {
      await revertSnapshot(name, String(body.snapName ?? ''));
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.snapshotRevert', target: name, detail: { snap: body.snapName } });
      return json({ ok: true, result: 'reverted (the VM may be left paused)' });
    }
    if (body.op === 'snapshotDelete') {
      await deleteSnapshot(name, String(body.snapName ?? ''));
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.snapshotDelete', target: name, detail: { snap: body.snapName } });
      return json({ ok: true, result: 'snapshot deleted' });
    }
    if (body.op === 'undefine') {
      await undefineVm(name);
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.vm.undefine', target: name, detail: null });
      return json({ ok: true, result: 'definition removed' });
    }

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
