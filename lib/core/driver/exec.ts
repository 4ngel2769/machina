/**
 * One place that spells the libvirt connection URI, the executable paths and
 * the timeout for every host call. Nothing here knows about machina's schema.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '@/lib/config';

/** Promisified execFile, shared so every host call uses the same wrapper. */
export const runBinary = promisify(execFile);

export async function virsh(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await runBinary(config.virshBin, ['-c', config.virshUri, ...args], {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function geniso(outPath: string, dir: string): Promise<void> {
  await runBinary(config.genisoBin, [
    '-output', outPath,
    '-volid', 'cidata',
    '-joliet',
    '-rock',
    'user-data', 'meta-data', 'network-config',
  ], { cwd: dir, timeout: 30_000 });
}
