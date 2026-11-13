/**
 * Liveness for the platform, for uptime monitoring and HESTIA probes.
 *
 * Unauthenticated on purpose — a monitor cannot hold a session — so it says
 * whether each dependency answers, never how or with what. No versions, no
 * paths, no counts.
 *
 * 200 = healthy or degraded, 503 = unhealthy. A monitor that only checks for
 * 200 is then still right: "up but limping" is up.
 */

import { NextResponse } from 'next/server';
import { statfs } from 'fs/promises';
import { rawDb } from '@/lib/db';
import { run } from '@/lib/host/exec';
import { config } from '@/lib/config';

let libvirtCache: { at: number; ok: boolean } = { at: 0, ok: false };

async function libvirt(): Promise<boolean> {
  if (Date.now() - libvirtCache.at < 10_000) return libvirtCache.ok;
  let isOk = false;
  try {
    await run(config.virshBin, ['-c', config.virshUri, 'version'], { timeout: 6000 });
    isOk = true;
  } catch {
    isOk = false;
  }
  libvirtCache = { at: Date.now(), ok: isOk };
  return isOk;
}

async function diskFreeGb(path: string): Promise<number | null> {
  try {
    const stats = await statfs(path);
    return Math.round((stats.bavail * stats.bsize) / 1024 ** 3);
  } catch {
    return null;
  }
}

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'degraded' | 'down'; note?: string }> = {};

  try {
    rawDb().prepare('select 1').get();
    checks.db = { status: 'ok' };
  } catch {
    checks.db = { status: 'down' };
  }

  checks.libvirt = { status: (await libvirt()) ? 'ok' : 'down' };

  const free = await diskFreeGb(config.storageDir);
  if (free === null) checks.storage = { status: 'down' };
  else if (free < 5) checks.storage = { status: 'degraded', note: 'low free space' };
  else checks.storage = { status: 'ok' };

  const down = Object.values(checks).filter((check) => check.status === 'down').length;
  const degraded = Object.values(checks).some((check) => check.status === 'degraded');
  const status = down > 0 ? 'unhealthy' : degraded ? 'degraded' : 'healthy';

  return NextResponse.json(
    { status, checks, ts: new Date().toISOString() },
    { status: down > 0 ? 503 : 200, headers: { 'cache-control': 'no-store' } },
  );
}
