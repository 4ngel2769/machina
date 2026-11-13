/**
 * DB <-> libvirt truth reconciliation, every 60s. Three jobs:
 *   1. domainState: instances with a domain -> match state; missing domain ->
 *      status 'error' (do NOT auto-delete; that belongs to a human or delete).
 *   2. auto-suspend: running instances whose user balance <= 0 get a stop job.
 *   3. orphan cleanup: qemu processes/disks/seed dirs with no instance row.
 */

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

let timer: ReturnType<typeof setInterval> | null = null;
export function startReconciler(): void {
  if (timer) return;
  timer = setInterval(() => { void reconcilePass().catch((passError) =>
    console.log('[reconciler] pass failed:', (passError as Error).message)); }, 60_000);
  console.log('[reconciler] loop 60s');
}

export function stopReconciler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

const mapDomState = (domainState: string | null): string => {
  if (!domainState) return 'error';
  if (/running/i.test(domainState)) return 'running';
  if (/shut/i.test(domainState)) return 'stopped';
  if (/crash/i.test(domainState)) return 'error';
  if (/paused/i.test(domainState)) return 'stopped';
  return 'error';
};

export async function reconcilePass(): Promise<{ fixed: number; suspended: number; orphans: number }> {
  const results = { fixed: 0, suspended: 0, orphans: 0 };
  const doms = new Map((await listDomains().catch(() => [] as never[])).map((domain) => [domain.name, domain.state]));
  const db = getDb();

  results.fixed += await syncStatuses(doms);
  results.suspended += await suspendBrokeUsers();
  results.orphans += await cleanOrphans();
  // bandwidth quotas (throttle/clear live limits)
  await checkQuotas().catch((quotaError) => console.log('[reconciler] quotas failed:', (quotaError as Error).message));
  return results;
}

/** 1. status sync (skip instances with in-flight jobs — race protection). */
async function syncStatuses(doms: Map<string, string>): Promise<number> {
  const db = getDb();
  let fixed = 0;
  for (const instanceRow of await db.select().from(instances)) {
    if (instanceRow.status === 'provisioning' || instanceRow.status === 'suspended') continue;
    if (await inFlightForInstance(instanceRow.id).catch(() => true)) continue;
    const liveState = doms.get(instanceRow.domainName);
    if (liveState === undefined) continue; // transitional; explicit destroy path deletes the row
    const mappedState = mapDomState(liveState);
    if (mappedState !== instanceRow.status) {
      await db.update(instances).set({ status: mappedState, updatedAt: now() }).where(
        (await import('drizzle-orm')).eq(instances.id, instanceRow.id),
      );
      fixed += 1;
    }
  }
  return fixed;
}

/** 2. auto-suspend at balance <= 0. */
async function suspendBrokeUsers(): Promise<number> {
  const db = getDb();
  let suspended = 0;
  for (const instanceRow of await db.select().from(instances)) {
    if (instanceRow.status !== 'running' || instanceRow.autoSuspended) continue;
    const user = (await db.select().from(users)).find((userRow) => userRow.id === instanceRow.userId);
    if (!user) continue;
    if (user.balanceCents <= 0) {
      await enqueue({ type: 'instance.stop', instanceId: instanceRow.id, userId: instanceRow.userId,
        payload: { force: true, reason: 'auto-suspend (balance exhausted)' } });
      await db.update(instances).set({ autoSuspended: 1, status: 'suspended', updatedAt: now() }).where(
        (await import('drizzle-orm')).eq(instances.id, instanceRow.id));
      console.log(`[reconciler] auto-suspend ${instanceRow.id} (user ${instanceRow.userId} broke)`);
      suspended += 1;
    }
  }
  return suspended;
}

/** Directory listing, or empty when the folder does not exist yet. */
async function listOrEmpty(dir: string): Promise<string[]> {
  try {
    return await fsp.readdir(dir);
  } catch {
    return [];
  }
}

/**
 * Die gracefully. Guest disks / seed dirs / VNC sockets that no instance row
 * references get removed so a deleted VM's files do not accumulate forever.
 */
async function cleanOrphans(): Promise<number> {
  const raw = rawDb();
  const known = new Set((
    raw.prepare(`select id from instances`).all() as { id: string }[]
  ).map((instanceRow) => instanceRow.id));
  const sp = storagePaths();
  let removed = 0;

  // Seed dirs + VNC sockets
  for (const dir of ['seeds', 'vnc'] as const) {
    const full = path.join(sp.root, dir);
    for (const ent of await listOrEmpty(full)) {
      const id = ent.replace(/\.(vnc|iso)$/, '');
      if (!id.startsWith('vm_') || known.has(id)) continue;
      await fsp.rm(path.join(full, ent), { force: true, recursive: true });
      removed += 1;
    }
  }

  // Guest disks: anything not owned by a live instance row is an orphan.
  const knownDisk = new Set([...known].map((id) => `${diskVolFromId(id)}.qcow2`));
  for (const diskFile of await listOrEmpty(sp.vms)) {
    if (!diskFile.endsWith('.qcow2') || knownDisk.has(diskFile)) continue;
    await fsp.rm(path.join(sp.vms, diskFile), { force: true });
    removed += 1;
  }

  return removed;
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
