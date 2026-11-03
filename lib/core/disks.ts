import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { storagePaths, config } from '@/lib/config';

const pexec = promisify(execFile);

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
