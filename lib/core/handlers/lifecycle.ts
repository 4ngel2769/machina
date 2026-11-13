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
import { ignore } from '@/lib/core/ignore';
import { notifyInstance } from '@/lib/services/notify';

/** ACPI shutdown, then poll until libvirt reports it off; force after grace. */
export async function shutdownAndWait(
  domainName: string,
  opts: { graceSec: number; forceMessage: string },
  log: (m: string) => void,
): Promise<void> {
  await shutdownDomain(domainName);
  const deadline = Date.now() + opts.graceSec * 1000;
  for (;;) {
    const state = await domState(domainName);
    if (state && /shut/i.test(state)) return;
    if (Date.now() >= deadline) {
      log(opts.forceMessage);
      await destroyDomain(domainName);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

export async function start(job: JobCtx, log: (m: string) => void): Promise<void> {
  const raw = rawDb();
  const instanceRow = raw.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string; name: string; user_id: string } | undefined;
  if (!instanceRow) throw new Error('instance row missing');
  log('starting');
  await startDomain(instanceRow.domain_name);
  await ensureThrottleState(instanceRow.id, instanceRow.domain_name).catch(ignore('throttle state is rebuilt lazily'));
  log('running');
  // heal_count is a provisioning self-heal counter, not a lifecycle one. Leaving
  // it set meant a box that started cleanly still advertised "auto-recovery
  // attempt 1 of 3" on its page long after it was fine.
  raw.prepare(`update instances set status='running', auto_suspended=0, heal_count=0, updated_at=? where id=?`)
    .run(now(), instanceRow.id);
  notifyInstance(instanceRow.user_id, 'ok', instanceRow.name, 'started', `/instances/${instanceRow.id}`);
}

export async function stop(job: JobCtx, log: (m: string) => void): Promise<void> {
  const raw = rawDb();
  const instanceRow = raw.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string; user_id: string; name: string } | undefined;
  if (!instanceRow) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { force?: boolean; graceSec?: number };
  log('settle before stop');
  await settleUser(instanceRow.user_id).catch(ignore('settle retries on the next tick'));
  if (payload.force) {
    log('force destroy');
    await destroyDomain(instanceRow.domain_name);
  } else {
    log('acpi shutdown');
    await shutdownAndWait(
      instanceRow.domain_name,
      { graceSec: payload.graceSec ?? config.limits.shutdownGraceSec, forceMessage: 'grace expired; forcing' },
      log,
    );
  }
  log('stopped');
  raw.prepare(`update instances set status='stopped', auto_suspended=0, heal_count=0, updated_at=? where id=?`)
    .run(now(), instanceRow.id);
  notifyInstance(instanceRow.user_id, 'info', instanceRow.name, 'stopped', `/instances/${instanceRow.id}`);
}

export async function del(job: JobCtx, log: (m: string) => void): Promise<void> {
  const raw = rawDb();
  const instanceRow = raw.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string; user_id: string; mac: string; net_name: string; name: string } | undefined;
  if (!instanceRow) throw new Error('instance row missing');
  log('settle before delete');
  await settleUser(instanceRow.user_id).catch(ignore('settle retries on the next tick'));
  log('destroy+undefine');
  await destroyDomain(instanceRow.domain_name);
  await undefineDomain(instanceRow.domain_name);
  await removeIpLease(instanceRow.mac, instanceRow.net_name || undefined).catch(ignore('lease may already be gone'));
  log('delete disk');
  await deleteVolume(diskVolFromId(instanceRow.id));
  log('rm seed + vnc socket');
  const fsp = await import('fs/promises');
  await fsp.rm(`${config.storageDir}/seeds/${instanceRow.id}`, { recursive: true, force: true }).catch(ignore('seed dir may not exist'));
  await fsp.rm(`${config.storageDir}/vnc/${instanceRow.id}.vnc`, { force: true }).catch(ignore('socket may not exist'));
  log('delete rows');
  raw.prepare(`delete from snapshots where instance_id=?`).run(instanceRow.id);
  raw.prepare(`delete from instances where id=?`).run(instanceRow.id);
  notifyInstance(instanceRow.user_id, 'warn', instanceRow.name, 'was deleted', '/instances');
  log('deleted');
}
