/**
 * Tenant media: list attachable ISOs, attach one to this VM's cdrom, detach.
 *
 * Attachable = the caller's own uploads plus the unowned admin shelf — the
 * same set /api/isos/mine lists. Ownership is re-checked here because a name
 * in a request body is not proof of rights.
 *
 * Live vs stored: attach prefers `change-media` on an existing cdrom (works
 * on a running guest) and falls back to `attach-disk --config` on a stopped
 * one. Detach tries `--live` then `--config`; whichever the domain state
 * rejects is ignored, so the operation is idempotent across both.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireScope, jsonBody } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';
import { getDb, rawDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { virsh } from '@/lib/core/driver';
import { isoPath, listIsos } from '@/lib/host/iso';
import { vmDetail } from '@/lib/host/domains/detail';
import { freeSlot } from '@/lib/host/domains/ops';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';
import fs from 'fs/promises';
import { ignore } from '@/lib/core/ignore';

type Ctx = { params: Promise<{ id: string }> };

async function ownedInstance(id: string, userId: string, role: string) {
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return { inst: null, denied: err('not found', 404) };
  if (inst.userId !== userId && role !== 'admin') return { inst: null, denied: err('forbidden', 403) };
  return { inst, denied: null };
}

/** Attachable ISOs plus the drives currently in the guest, for the media tab. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const scopeDenied = await requireScope('instances:read');
  if (scopeDenied) return scopeDenied;
  const { id } = await ctx.params;
  const { inst, denied } = await ownedInstance(id, user.id, user.role);
  if (denied) return denied;

  try {
    const [isos, detail] = await Promise.all([listIsos(user.id), vmDetail(inst!.domainName)]);
    const drives = detail.disks
      .filter((disk) => disk.device === 'cdrom')
      .map((disk) => ({ target: disk.target, bus: disk.bus, source: disk.source ? disk.source.split('/').pop() ?? disk.source : null }));
    return json({ isos, drives });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

/** The caller may attach an ISO only if it is theirs or on the shared shelf.
 *  listIsos(userId) already implements exactly that filter — registry owner
 *  match or unowned — so reuse it rather than re-deriving the rule. */
async function canAttach(userId: string, role: string, isoName: string): Promise<boolean> {
  if (role === 'admin') return true;
  const visible = await listIsos(userId);
  return visible.some((iso) => iso.name === isoName);
}

async function liveState(domain: string): Promise<boolean> {
  const state = await virsh(['domstate', domain]).catch(() => 'shut off');
  return /running/i.test(state.trim());
}

/** change-media on a running guest; returns true when it took. */
async function liveSwap(domain: string, target: string, file: string): Promise<boolean> {
  try {
    await virsh(['change-media', domain, target, `--eject`]);
    await virsh(['change-media', domain, target, `--insert`, file]);
    return true;
  } catch {
    return false;
  }
}

async function attachIso(inst: { domainName: string }, isoName: string): Promise<string> {
  const file = await isoPath(isoName);
  const st = await fs.stat(file).catch(() => null);
  if (!st?.isFile()) throw new Error('no such iso — refresh the list');
  const detail = await vmDetail(inst.domainName);
  const cdrom = detail.disks.find((disk) => disk.device === 'cdrom');
  const running = await liveState(inst.domainName);

  if (cdrom) {
    if (running && (await liveSwap(inst.domainName, cdrom.target, file))) {
      return `swapped ${isoName} into ${cdrom.target} live`;
    }
    if (!running) {
      await virsh(['detach-disk', inst.domainName, cdrom.target, '--config']).catch(ignore('no stored cdrom to drop'));
    }
  }
  const free = freeSlot(new Set(detail.disks.map((disk) => disk.target)), 'sd');
  if (!free) throw new Error('no free sata slot left');
  await virsh(['attach-disk', inst.domainName, file, free,
    '--type', 'cdrom', '--mode', 'readonly',
    '--driver', 'qemu', '--subdriver', 'raw',
    '--targetbus', 'sata', '--config']);
  return `inserted ${isoName} as ${free} — appears at next start`;
}

async function detachIso(inst: { domainName: string }, target: string): Promise<string> {
  if (!/^sd[a-z]$/.test(target)) throw new Error('media target must look like sda/sdb/…');
  const running = await liveState(inst.domainName);
  if (running) {
    await virsh(['detach-disk', inst.domainName, target, '--live']).catch(ignore('live detach unsupported for this bus'));
  }
  await virsh(['detach-disk', inst.domainName, target, '--config']);
  return `ejected ${target}`;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const scopeDenied = await requireScope('instances:write');
  if (scopeDenied) return scopeDenied;
  const { id } = await ctx.params;
  const { inst, denied } = await ownedInstance(id, user.id, user.role);
  if (denied) return denied;

  const body = await jsonBody(req, z.object({
    action: z.enum(['attach', 'detach']),
    iso: z.string().optional(),
    target: z.string().optional(),
  }));

  try {
    if (body.action === 'attach') {
      const isoName = String(body.iso ?? '');
      if (!(await canAttach(user.id, user.role, isoName))) return err('that iso is not on your shelf', 403);
      const note = await attachIso(inst!, isoName);
      await logAudit({ actorId: user.id, actorName: user.name, action: 'instance.iso.attach', target: id, detail: { iso: isoName } });
      return json({ ok: true, note });
    }
    const note = await detachIso(inst!, String(body.target ?? ''));
    await logAudit({ actorId: user.id, actorName: user.name, action: 'instance.iso.detach', target: id, detail: { target: body.target } });
    return json({ ok: true, note });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export const dynamic = 'force-dynamic';
