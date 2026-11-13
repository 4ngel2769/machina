/**
 * qcow2 overlay creation and disk helpers.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { storagePaths, config } from '@/lib/config';

const pexec = promisify(execFile);

/** qemu-img as root: libvirt chowns a running domain's disk to libvirt-qemu, so
 *  the service user may not be able to read the source overlay. */
async function qemu(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await pexec('sudo', ['-n', config.qemuImgBin, ...args], {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Single source of truth for the guest disk's pool/volume name. Create,
 * destroy and resize must all derive the name from the SAME slice, or delete
 * will rm air. vm_<16hex> -> slice(3,16) = 13 hex chars.
 */
export function diskVolFromId(instanceId: string): string {
  return `${config.domainPrefix}${instanceId.slice(3, 16)}-disk`;
}

/**
 * Guest disk creation. Base images are plain qcow2 files inside the images
 * pool dir (a libvirt dir pool scans files — no volume XML needed), so the
 * guest disk is a qemu-img overlay on the absolute base path, and we surface
 * it to libvirt tooling with pool-refresh (vol-create refuses to touch an
 * existing file).
 */
export async function createBackedDisk(
  instanceId: string,
  baseImagePath: string,
  diskGb: number,
): Promise<{ volName: string; volPath: string }> {
  const sp = storagePaths();
  const volName = diskVolFromId(instanceId);
  const volPath = `${sp.vms}/${volName}.qcow2`;

  // qemu-img create refuses to touch an existing path, and a leftover file
  // from an interrupted attempt then fails every retry with "Permission
  // denied" (libvirt may have chowned it). Clear it first, idempotently.
  await fs.rm(volPath, { force: true }).catch(() => {});

  // The overlay records the absolute base path + explicit backing format
  // (avoids probing, and survives pool-relative path assumptions).
  await pexec(config.qemuImgBin, [
    'create', '-f', 'qcow2',
    '-b', baseImagePath, '-F', 'qcow2',
    volPath,
    `${diskGb}G`,
  ], { timeout: 60_000 });

  await pexec(config.virshBin, ['-c', config.virshUri, 'pool-refresh', config.vmsPool], { timeout: 30_000 }).catch((e) => {
    // Non-fatal: the domain XML references the file by absolute path anyway.
    console.log(`[disks] pool-refresh failed (non-fatal): ${(e as Error).message}`);
  });
  return { volName, volPath };
}

/**
 * Clone an existing overlay into a standalone disk for a new instance.
 *
 * `qemu-img convert` copies allocated blocks only, so a 40 GB overlay holding
 * 2 GB of data finishes in seconds. Deliberately a full copy rather than an
 * overlay-on-an-overlay: a chained clone silently breaks the day the source VM
 * is deleted, and "my clone stopped booting when I deleted the original" is not
 * a support conversation worth having.
 */
export async function copyDisk(
  instanceId: string,
  sourcePath: string,
  diskGb: number,
): Promise<{ volName: string; volPath: string }> {
  const sp = storagePaths();
  const src = path.resolve(sourcePath);
  // The source always arrives from an instance row, never from a request body,
  // but a path that escaped the pools would still be a read of arbitrary files.
  const pools = [path.resolve(sp.vms), path.resolve(sp.images)];
  if (!pools.some((pool) => src.startsWith(`${pool}${path.sep}`))) {
    throw new Error('clone source is outside the storage pools');
  }
  const st = await fs.stat(src).catch(() => null);
  if (!st?.isFile()) throw new Error('clone source disk is missing');

  const diskInfo = JSON.parse(await qemu(['info', '--output=json', '-U', src])) as { 'virtual-size'?: number };
  const sourceGb = Number(diskInfo['virtual-size'] ?? 0) / 1e9;
  if (sourceGb > diskGb + 0.5) {
    throw new Error(`source disk is ${Math.ceil(sourceGb)} GB, larger than the ${diskGb} GB target plan`);
  }

  const volName = diskVolFromId(instanceId);
  const volPath = `${sp.vms}/${volName}.qcow2`;
  const partPath = `${volPath}.part`;
  await fs.rm(partPath, { force: true }).catch(() => {});
  await fs.rm(volPath, { force: true }).catch(() => {});
  try {
    await qemu(['convert', '-U', '-O', 'qcow2', src, partPath], 30 * 60_000);
    // Grow to the target plan so the guest's cloud-init growpart has room; a
    // clone into the same plan is a no-op.
    if (diskGb > sourceGb + 0.5) await qemu(['resize', partPath, `${diskGb}G`], 120_000);
    await fs.rename(partPath, volPath);
  } catch (e) {
    await fs.rm(partPath, { force: true }).catch(() => {});
    throw e;
  }

  await pexec(config.virshBin, ['-c', config.virshUri, 'pool-refresh', config.vmsPool], { timeout: 30_000 }).catch((e) => {
    console.log(`[disks] pool-refresh failed (non-fatal): ${(e as Error).message}`);
  });
  return { volName, volPath };
}

export async function deleteVolume(volName: string): Promise<void> {
  const file = `${volName}.qcow2`;
  const sp = storagePaths();
  try {
    await pexec(config.virshBin, ['-c', config.virshUri, 'vol-delete', file, '--pool', config.vmsPool]);
  } catch (e) {
    console.log(`[disks] vol-delete ${file}: ${(e as Error).message}`);
  }
  // Always rm as backstop — an overlapping pool registration must never leave
  // a 40 GB file behind because virsh disagreed about the name.
  await fs.rm(`${sp.vms}/${file}`, { force: true }).catch(() => {});
}

export async function volResize(volName: string, newGb: number): Promise<void> {
  const volPath = `${storagePaths().vms}/${volName}.qcow2`;
  await pexec(config.qemuImgBin, ['resize', volPath, `${newGb}G`]);
}

/** Backward-compat re-export: old callers imported volumePath from driver. */
export { virsh } from './driver';
