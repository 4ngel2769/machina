/**
 * Create a VM: overlay disk, cloud-init seed, domain XML, DHCP lease, then
 * wait for SSH. Every failure path cleans the artifacts it created.
 */
import fs from 'fs';
import net from 'net';
import { rawDb, getDb } from '@/lib/db';
import { instances, plans, images, users } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { decrypt, randToken } from '../crypto';
import { buildSeed } from '../cloudinit';
import {
  domainXml, defineDomain, startDomain, destroyDomain, undefineDomain,
  ensureIpLease,
} from '../driver';
import { createBackedDisk, deleteVolume, copyDisk } from '../disks';
import { now } from '../util';
import { gatewayForNet } from '@/lib/core/usernet';
import { eq } from 'drizzle-orm';
import type { JobCtx } from '../handlers';
import { ignore } from '@/lib/core/ignore';
import { notifyInstance } from '@/lib/services/notify';

type InstanceRow = {
  id: string; user_id: string; plan_id: string; image_id: string; name: string;
  mac: string; ip: string; net_name: string; root_pass_enc: string; vnc_pass: string;
  domain_name: string; status: string;
};

function loadInstance(instanceId: string): InstanceRow {
  const instanceRow = rawDb().prepare(`select * from instances where id=?`).get(instanceId) as
    InstanceRow | undefined;
  if (!instanceRow) throw new Error(`instance row ${instanceId} missing`);
  return instanceRow;
}

async function loadPlanImageUser(instanceRow: InstanceRow) {
  const [plan] = await getDb().select().from(plans).where(eq(plans.id, instanceRow.plan_id));
  const [image] = await getDb().select().from(images).where(eq(images.id, instanceRow.image_id));
  const [user] = await getDb().select().from(users).where(eq(users.id, instanceRow.user_id));
  if (!plan || !image || !user) throw new Error('plan/image/user row missing');
  return { plan, image, user };
}

async function buildDisk(
  instanceRow: InstanceRow,
  planGb: number,
  imageId: string,
  basePath: string,
  copyFromPath: string | undefined,
  log: (m: string) => void,
): Promise<{ volName: string; volPath: string }> {
  if (copyFromPath) {
    log(`cloning disk ${planGb}G from an existing volume`);
    return copyDisk(instanceRow.id, copyFromPath, planGb);
  }
  log(`creating disk ${planGb}G from ${imageId}`);
  return createBackedDisk(instanceRow.id, basePath, planGb);
}

async function writeSeed(
  instanceRow: InstanceRow,
  rootPassword: string,
  log: (m: string) => void,
): Promise<string> {
  const seedIsoPath = `${config.storageDir}/seeds/${instanceRow.id}/seed.iso`;
  log('building cloud-init seed');
  const sshPublicKeys = (
    rawDb().prepare(`select pub_key from ssh_keys where user_id=?`).all(instanceRow.user_id) as { pub_key: string }[]
  ).map((keyRow) => keyRow.pub_key);
  await buildSeed({
    instanceId: instanceRow.id,
    hostname: instanceRow.name,
    rootPassword,
    sshPublicKeys,
    mac: instanceRow.mac,
    ip: instanceRow.ip,
    gateway: gatewayForNet(instanceRow.net_name || config.network),
    netmask: '255.255.255.0',
    dns: ['1.1.1.1', '9.9.9.9'],
    seedIsoPath,
  });
  return seedIsoPath;
}

/** Build and define the domain XML and add the DHCP reservation. Starting it
 *  is the caller's job, so a failed define cannot leave a running guest. */
async function defineInstanceDomain(
  instanceRow: InstanceRow,
  plan: { vcpu: number; ramMb: number },
  disk: { volPath: string },
  seedIsoPath: string,
  log: (m: string) => void,
): Promise<{ vncSocket: string; vncPass: string }> {
  const vncSocket = `${config.storageDir}/vnc/${instanceRow.id}.vnc`;
  const vncPass = instanceRow.vnc_pass || randToken(4).slice(0, 8);
  const serialPath = `${config.storageDir}/serial/${instanceRow.id}.log`;
  const xml = domainXml({
    domainName: instanceRow.domain_name,
    instanceId: instanceRow.id,
    vcpu: plan.vcpu,
    ramMb: plan.ramMb,
    diskVolPath: disk.volPath,
    seedIsoPath,
    mac: instanceRow.mac,
    vncSocket,
    vncPass,
    serialPath,
    spice: config.spice.enabled,
    network: instanceRow.net_name || config.network,
  });
  log('defining domain');
  // a previous attempt may have left the domain defined (or even running);
  // define is not idempotent, so clear it first
  await destroyDomain(instanceRow.domain_name).catch(ignore('domain may already be gone'));
  await undefineDomain(instanceRow.domain_name).catch(ignore('domain may already be undefined'));
  await defineDomain(xml);
  log('dhcp lease entry');
  await ensureIpLease(instanceRow.mac, instanceRow.ip, instanceRow.net_name || config.network);
  return { vncSocket, vncPass };
}

/** Destroy, undefine, drop the disk and mark the row as errored. */
async function failProvisioning(instanceRow: InstanceRow, disk: { volName: string }): Promise<never> {
  await destroyDomain(instanceRow.domain_name);
  await undefineDomain(instanceRow.domain_name);
  await deleteVolume(disk.volName);
  rawDb().prepare(`update instances set status='error', updated_at=? where id=?`).run(now(), instanceRow.id);
  notifyInstance(instanceRow.user_id, 'error', instanceRow.name, 'provisioning failed — ssh never came up', `/instances/${instanceRow.id}`);
  throw new Error('provisioning timeout: ssh never came up (disk+domain cleaned)');
}

export async function create(job: JobCtx, log: (m: string) => void): Promise<void> {
  if (!job.instanceId) throw new Error('create job missing instanceId');
  const instanceRow = loadInstance(job.instanceId);
  const { plan, image, user } = await loadPlanImageUser(instanceRow);
  const { copyFromPath } = JSON.parse(job.payload || '{}') as { copyFromPath?: string };
  const basePath = image.path ?? '';
  // A clone does not read the base image at all, so a pooled image that has
  // since been removed must not block it.
  if (!copyFromPath && (image.status !== 'ready' || !basePath || !fs.existsSync(basePath))) {
    throw new Error(`image ${image.id} not ready for provisioning`);
  }
  if (user.balanceCents <= 0) throw new Error('balance exhausted; cannot provision');

  const disk = await buildDisk(instanceRow, plan.diskGb, image.id, basePath, copyFromPath, log);
  const seedIsoPath = await writeSeed(instanceRow, decrypt(instanceRow.root_pass_enc), log);
  const { vncSocket, vncPass } = await defineInstanceDomain(instanceRow, plan, disk, seedIsoPath, log);
  log('starting domain');
  await startDomain(instanceRow.domain_name);

  log('waiting for ssh');
  if (!(await waitSsh(instanceRow.ip, 150_000))) await failProvisioning(instanceRow, disk);
  rawDb().prepare(`update instances set status='running', vnc_socket=?, vnc_pass=?, updated_at=? where id=?`)
    .run(vncSocket, vncPass, now(), instanceRow.id);
  notifyInstance(instanceRow.user_id, 'ok', instanceRow.name, 'is running', `/instances/${instanceRow.id}`);
  log('running');
}

/** TCP port-22 wait in guest IP space. */
export function waitSsh(ip: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host: ip, port: 22, timeout: 2500 });
      const clean = (isUp: boolean) => {
        socket.destroy();
        if (isUp) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(attempt, 3000);
      };
      socket.on('connect', () => clean(true));
      socket.on('error', () => clean(false));
      socket.on('timeout', () => clean(false));
    };
    attempt();
  });
}
