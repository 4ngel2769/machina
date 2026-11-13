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
import { eq } from 'drizzle-orm';
import type { JobCtx } from '../handlers';

type InstanceRow = {
  id: string; user_id: string; plan_id: string; image_id: string; name: string;
  mac: string; ip: string; root_pass_enc: string; vnc_pass: string;
  domain_name: string; status: string;
};

function loadInstance(instanceId: string): InstanceRow {
  const inst = rawDb().prepare(`select * from instances where id=?`).get(instanceId) as
    InstanceRow | undefined;
  if (!inst) throw new Error(`instance row ${instanceId} missing`);
  return inst;
}

async function loadPlanImageUser(inst: InstanceRow) {
  const [plan] = await getDb().select().from(plans).where(eq(plans.id, inst.plan_id));
  const [image] = await getDb().select().from(images).where(eq(images.id, inst.image_id));
  const [user] = await getDb().select().from(users).where(eq(users.id, inst.user_id));
  if (!plan || !image || !user) throw new Error('plan/image/user row missing');
  return { plan, image, user };
}

async function buildDisk(
  inst: InstanceRow,
  planGb: number,
  imageId: string,
  basePath: string,
  copyFromPath: string | undefined,
  log: (m: string) => void,
): Promise<{ volName: string; volPath: string }> {
  if (copyFromPath) {
    log(`cloning disk ${planGb}G from an existing volume`);
    return copyDisk(inst.id, copyFromPath, planGb);
  }
  log(`creating disk ${planGb}G from ${imageId}`);
  return createBackedDisk(inst.id, basePath, planGb);
}

async function writeSeed(
  inst: InstanceRow,
  rootPassword: string,
  log: (m: string) => void,
): Promise<string> {
  const seedIsoPath = `${config.storageDir}/seeds/${inst.id}/seed.iso`;
  log('building cloud-init seed');
  const sshPublicKeys = (
    rawDb().prepare(`select pub_key from ssh_keys where user_id=?`).all(inst.user_id) as { pub_key: string }[]
  ).map((r) => r.pub_key);
  await buildSeed({
    instanceId: inst.id,
    hostname: inst.name,
    rootPassword,
    sshPublicKeys,
    mac: inst.mac,
    ip: inst.ip,
    gateway: config.gateway,
    netmask: '255.255.255.0',
    dns: ['1.1.1.1', '9.9.9.9'],
    seedIsoPath,
  });
  return seedIsoPath;
}

/** Build and define the domain XML and add the DHCP reservation. Starting it
 *  is the caller's job, so a failed define cannot leave a running guest. */
async function defineInstanceDomain(
  inst: InstanceRow,
  plan: { vcpu: number; ramMb: number },
  disk: { volPath: string },
  seedIsoPath: string,
  log: (m: string) => void,
): Promise<{ vncSocket: string; vncPass: string }> {
  const vncSocket = `${config.storageDir}/vnc/${inst.id}.vnc`;
  const vncPass = inst.vnc_pass || randToken(4).slice(0, 8);
  const serialPath = `${config.storageDir}/serial/${inst.id}.log`;
  const goXml = domainXml({
    domainName: inst.domain_name,
    instanceId: inst.id,
    vcpu: plan.vcpu,
    ramMb: plan.ramMb,
    diskVolPath: disk.volPath,
    seedIsoPath,
    mac: inst.mac,
    vncSocket,
    vncPass,
    serialPath,
    spice: config.spice.enabled,
  });
  log('defining domain');
  // a previous attempt may have left the domain defined (or even running);
  // define is not idempotent, so clear it first
  await destroyDomain(inst.domain_name).catch(() => {});
  await undefineDomain(inst.domain_name).catch(() => {});
  await defineDomain(goXml);
  log('dhcp lease entry');
  await ensureIpLease(inst.mac, inst.ip);
  return { vncSocket, vncPass };
}

/** Destroy, undefine, drop the disk and mark the row as errored. */
async function failProvisioning(inst: InstanceRow, disk: { volName: string }): Promise<never> {
  await destroyDomain(inst.domain_name);
  await undefineDomain(inst.domain_name);
  await deleteVolume(disk.volName);
  rawDb().prepare(`update instances set status='error', updated_at=? where id=?`).run(now(), inst.id);
  throw new Error('provisioning timeout: ssh never came up (disk+domain cleaned)');
}

export async function create(job: JobCtx, log: (m: string) => void): Promise<void> {
  if (!job.instanceId) throw new Error('create job missing instanceId');
  const inst = loadInstance(job.instanceId);
  const { plan, image, user } = await loadPlanImageUser(inst);
  const { copyFromPath } = JSON.parse(job.payload || '{}') as { copyFromPath?: string };
  const basePath = image.path ?? '';
  // A clone does not read the base image at all, so a pooled image that has
  // since been removed must not block it.
  if (!copyFromPath && (image.status !== 'ready' || !basePath || !fs.existsSync(basePath))) {
    throw new Error(`image ${image.id} not ready for provisioning`);
  }
  if (user.balanceCents <= 0) throw new Error('balance exhausted; cannot provision');

  const disk = await buildDisk(inst, plan.diskGb, image.id, basePath, copyFromPath, log);
  const seedIsoPath = await writeSeed(inst, decrypt(inst.root_pass_enc), log);
  const { vncSocket, vncPass } = await defineInstanceDomain(inst, plan, disk, seedIsoPath, log);
  log('starting domain');
  await startDomain(inst.domain_name);

  log('waiting for ssh');
  if (!(await waitSsh(inst.ip, 150_000))) await failProvisioning(inst, disk);
  rawDb().prepare(`update instances set status='running', vnc_socket=?, vnc_pass=?, updated_at=? where id=?`)
    .run(vncSocket, vncPass, now(), inst.id);
  log('running');
}

/** TCP port-22 wait in guest IP space. */
export function waitSsh(ip: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const s = net.connect({ host: ip, port: 22, timeout: 2500 });
      const clean = (up: boolean) => {
        s.destroy();
        if (up) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(attempt, 3000);
      };
      s.on('connect', () => clean(true));
      s.on('error', () => clean(false));
      s.on('timeout', () => clean(false));
    };
    attempt();
  });
}
