/**
 * Boot-time image quarantine.
 *
 * A qcow2 with no BIOS bootloader (UEFI-only builds such as Alpine's
 * `*-uefi-cloudinit-*`) cannot be booted by our SeaBIOS guests: the domain
 * starts, prints nothing to serial, and dies on the SSH timeout. That failure
 * is indistinguishable from a slow boot unless you diff the MBR, so check it
 * once at boot and refuse to serve an image that cannot possibly boot.
 */
import { rawDb } from '@/lib/db';
import { ignore } from '@/lib/core/ignore';

/** MBR signature present and not a GPT disk with no BIOS boot code. */
function hasBiosBootloader(buf: Buffer): boolean {
  if (buf.length < 512) return false;
  if (buf[510] !== 0x55 || buf[511] !== 0xaa) return false;
  return !(buf[0] === 0 && buf[1] === 0 && buf[2] === 0);
}

/** Stage the first sector on disk and inspect it. Throws when unreadable. */
async function readMbr(file: string, imageId: string, pid: number): Promise<Buffer> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const os = await import('os');
  const path = await import('path');
  const fsp = await import('fs/promises');
  const pexec = promisify(execFile);
  // qemu-img dd writes binary to a real file reliably; /dev/stdout gives us
  // nothing usable through execFile, so stage the MBR on disk.
  const mbrPath = path.join(os.tmpdir(), `machina-mbr-${pid}-${imageId}.bin`);
  await pexec('qemu-img', ['dd', `if=${file}`, `of=${mbrPath}`, 'bs=512', 'count=1'], { maxBuffer: 4096 });
  const mbr = await fsp.readFile(mbrPath);
  await fsp.rm(mbrPath, { force: true }).catch(ignore('temp file may not exist'));
  return mbr;
}

export async function auditImageBootability(): Promise<void> {
  try {
    const { storagePaths } = await import('@/lib/config');
    const raw = rawDb();
    const storage = storagePaths();
    const rows = raw.prepare(`select id, path, status from images where status='ready'`).all() as
      { id: string; path: string; status: string }[];
    for (const imageRow of rows) {
      const file = imageRow.path || `${storage.images}/${imageRow.id}.qcow2`;
      let isBootable: boolean;
      try {
        isBootable = hasBiosBootloader(await readMbr(file, imageRow.id, process.pid));
      } catch {
        continue; // unreadable: leave it alone rather than disable a good image
      }
      if (isBootable) continue;
      raw.prepare(`update images set status='broken', failure=? where id=?`)
        .run('image has no BIOS bootloader (UEFI-only build) — not bootable on this host', imageRow.id);
      console.log(`[worker] image ${imageRow.id} marked broken: no BIOS bootloader`);
    }
  } catch (auditError) {
    console.log(`[worker] image bootability audit skipped: ${(auditError as Error).message}`);
  }
}
