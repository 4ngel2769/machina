/**
 * Lifecycle handlers: start, stop and delete. Each settles the meter first so
 * a stopped or destroyed VM cannot keep burning credit.
 */
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import {
  startDomain, shutdownDomain, destroyDomain, undefineDomain, domState, removeIpLease,
} from '../driver';
import { deleteVolume, diskVolFromId } from '../disks';
import { settleUser } from '../metering';
import { ensureThrottleState } from '../netmeter';
import { now } from '../util';
import type { JobCtx } from '../handlers';

/** ACPI shutdown, then poll until libvirt reports it off; force after grace. */
export async function shutdownAndWait(
  domainName: string,
  opts: { graceSec: number; forceMessage: string },
  log: (m: string) => void,
): Promise<void> {
  await shutdownDomain(domainName);
  const until = Date.now() + opts.graceSec * 1000;
  for (;;) {
    const st = await domState(domainName);
    if (st && /shut/i.test(st)) return;
    if (Date.now() >= until) {
      log(opts.forceMessage);
      await destroyDomain(domainName);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function start(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string } | undefined;
  if (!row) throw new Error('instance row missing');
  log('starting');
  await startDomain(row.domain_name);
  await ensureThrottleState(row.id, row.domain_name).catch(() => {});
  log('running');
  // heal_count is a provisioning self-heal counter, not a lifecycle one. Leaving
  // it set meant a box that started cleanly still advertised "auto-recovery
  // attempt 1 of 3" on its page long after it was fine.
  rd.prepare(`update instances set status='running', auto_suspended=0, heal_count=0, updated_at=? where id=?`)
    .run(now(), row.id);
}

export async function stop(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string; user_id: string } | undefined;
  if (!row) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { force?: boolean; graceSec?: number };
  log('settle before stop');
  await settleUser(row.user_id).catch(() => {});
  if (payload.force) {
    log('force destroy');
    await destroyDomain(row.domain_name);
  } else {
    log('acpi shutdown');
    await shutdownAndWait(
      row.domain_name,
      { graceSec: payload.graceSec ?? config.limits.shutdownGraceSec, forceMessage: 'grace expired; forcing' },
      log,
    );
  }
  log('stopped');
  rd.prepare(`update instances set status='stopped', auto_suspended=0, heal_count=0, updated_at=? where id=?`)
    .run(now(), row.id);
}

export async function del(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string; user_id: string; mac: string } | undefined;
  if (!row) throw new Error('instance row missing');
  log('settle before delete');
  await settleUser(row.user_id).catch(() => {});
  log('destroy+undefine');
  await destroyDomain(row.domain_name);
  await undefineDomain(row.domain_name);
  await removeIpLease(row.mac).catch(() => {});
  log('delete disk');
  await deleteVolume(diskVolFromId(row.id));
  log('rm seed + vnc socket');
  const fsp = await import('fs/promises');
  await fsp.rm(`${config.storageDir}/seeds/${row.id}`, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(`${config.storageDir}/vnc/${row.id}.vnc`, { force: true }).catch(() => {});
  log('delete rows');
  rd.prepare(`delete from snapshots where instance_id=?`).run(row.id);
  rd.prepare(`delete from instances where id=?`).run(row.id);
  log('deleted');
}
