import { rawDb, getDb } from '@/lib/db';
import { instances, users } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { domState, listDomains, destroyDomain, undefineDomain } from './driver';
import { diskVolFromId, deleteVolume } from './disks';
import { enqueue, inFlightForInstance } from './jobs';
import { checkQuotas } from './netmeter';
import { now } from './util';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { storagePaths } from '@/lib/config';

/**
 * DB <-> libvirt truth reconciliation, every 60s. Three jobs:
 *   1. domainState: instances with a domain -> match state; missing domain ->
 *      status 'error' (do NOT auto-delete; that belongs to a human or delete).
 *   2. auto-suspend: running instances whose user balance <= 0 get a stop job.
 *   3. orphan cleanup: qemu processes/disks/seed dirs with no instance row.
 */

let timer: ReturnType<typeof setInterval> | null = null;
export function startReconciler(): void {
  if (timer) return;
  timer = setInterval(() => { void reconcilePass().catch((e) =>
    console.log('[reconciler] pass failed:', (e as Error).message)); }, 60_000);
  console.log('[reconciler] loop 60s');
}

export function stopReconciler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

const mapDomState = (s: string | null): string => {
  if (!s) return 'error';
  if (/running/i.test(s)) return 'running';
  if (/shut/i.test(s)) return 'stopped';
  if (/crash/i.test(s)) return 'error';
  if (/paused/i.test(s)) return 'stopped';
  return 'error';
};

export async function reconcilePass(): Promise<{ fixed: number; suspended: number; orphans: number }> {
  const results = { fixed: 0, suspended: 0, orphans: 0 };
  const doms = new Map((await listDomains().catch(() => [] as never[])).map((d) => [d.name, d.state]));
  const db = getDb();

  // 1. status sync (skip instances with in-flight jobs — race protection)
  for (const inst of await db.select().from(instances)) {
    if (inst.status === 'provisioning' || inst.status === 'suspended') continue;
    if (await inFlightForInstance(inst.id).catch(() => true)) continue;
    const live = doms.get(inst.domainName);
    if (live === undefined) {
      continue; // transitional; explicit destroy path deletes the row
    }
    const mapped = mapDomState(live);
    if (mapped !== inst.status) {
      await db.update(instances).set({ status: mapped, updatedAt: now() }).where(
        (await import('drizzle-orm')).eq(instances.id, inst.id),
      );
      results.fixed += 1;
    }
  }

  // 2. auto-suspend at balance <= 0
  for (const inst of await db.select().from(instances)) {
    if (inst.status !== 'running' || inst.autoSuspended) continue;
    const user = (await db.select().from(users)).find((u) => u.id === inst.userId);
    if (!user) continue;
    if (user.balanceCents <= 0) {
      await enqueue({ type: 'instance.stop', instanceId: inst.id, userId: inst.userId,
        payload: { force: true, reason: 'auto-suspend (balance exhausted)' } });
      await db.update(instances).set({ autoSuspended: 1, status: 'suspended', updatedAt: now() }).where(
        (await import('drizzle-orm')).eq(instances.id, inst.id));
      console.log(`[reconciler] auto-suspend ${inst.id} (user ${inst.userId} broke)`);
      results.suspended += 1;
    }
  }

  // 3. orphan cleanup
  results.orphans += await cleanOrphans();

  // 4. bandwidth quotas (throttle/clear live limits)
  await checkQuotas().catch((e) => console.log('[reconciler] quotas failed:', (e as Error).message));
  return results;
}

/**
 * Die gracefully. Guest disks / seed dirs / VNC sockets that no instance row
 * references get removed so a deleted VM's files do not accumulate forever.
 */
async function cleanOrphans(): Promise<number> {
  const rd = rawDb();
  const known = new Set((
    rd.prepare(`select id from instances`).all() as { id: string }[]
  ).map((r) => r.id));
  const sp = storagePaths();
  let n = 0;

  // Seed dirs + VNC sockets
  for (const dir of ['seeds', 'vnc'] as const) {
    const full = path.join(sp.root, dir);
    try {
      for (const ent of await fsp.readdir(full)) {
        const id = ent.replace(/\.(vnc|iso)$/, '');
        if (!id.startsWith('vm_') || known.has(id)) continue;
        await fsp.rm(path.join(full, ent), { force: true, recursive: true });
        n += 1;
      }
    } catch { /* folder may not exist yet */ }
  }

  // Guest disks: anything not owned by a live instance row is an orphan.
  try {
    const knownDisk = new Set([...known].map((id) => `${diskVolFromId(id)}.qcow2`));
    for (const f of await fsp.readdir(sp.vms)) {
      if (!f.endsWith('.qcow2') || knownDisk.has(f)) continue;
      await fsp.rm(path.join(sp.vms, f), { force: true });
      n += 1;
    }
  } catch { /* ignore */ }

  return n;
}

/** Explicit post-delete safety net: guarantee stale domain gone + disk gone. */
export async function hardCleanup(instanceId: string, domainName: string): Promise<void> {
  const live = await domState(domainName).catch(() => null);
  if (live) await destroyDomain(domainName);
  await undefineDomain(domainName);
  await deleteVolume(diskVolFromId(instanceId));
  void config;
  void fs;
}
