/**
 * Run host binaries with a timeout and no shell.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const pexec = promisify(execFile);

/**
 * Host command runner for the admin console.
 *
 * Every write goes through sudo -n (passwordless on this host) because the app
 * runs as an unprivileged user; reads (ip, nmcli device) do not need it. Only
 * the LAST stderr line is thrown: nmcli and virsh put the actual reason there,
 * and earlier lines are banners that would drown it.
 */
export async function run(
  bin: string,
  args: string[],
  opts: { sudo?: boolean; timeout?: number } = {},
): Promise<string> {
  const [b, a] = opts.sudo ? ['sudo', ['-n', bin, ...args]] : [bin, args];
  try {
    const { stdout } = await pexec(b, a, { timeout: opts.timeout ?? 30_000, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    const err = e as { stderr?: string; message?: string; killed?: boolean };
    if (err.killed) throw new Error(`${bin} timed out after ${(opts.timeout ?? 30_000) / 1000}s`);
    const line = String(err.stderr ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    throw new Error(line || err.message || `${bin} failed`);
  }
}

/** Is a binary present on PATH? Cheap capability probe for optional features. */
export async function has(bin: string): Promise<boolean> {
  try {
    await run('sh', ['-c', `command -v ${bin}`]);
    return true;
  } catch {
    return false;
  }
}
