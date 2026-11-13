/**
 * Job failures reach users on the instance page, so raw tool output
 * ("Command failed: virsh -c qemu:///system define /mnt/8tbv1/...") is
 * useless to them — and leaks host paths. Map known failure shapes to a short
 * human sentence and never show more than one line.
 */

const RULES: [RegExp, string][] = [
  [/already exists with uuid/i, 'a stale VM definition from an earlier attempt was in the way (auto-recovering)'],
  [/Permission denied/i, 'the host rejected a storage write — check disk ownership and free space'],
  [/No space left on device/i, 'the host disk is full'],
  [/provisioning timeout|never came up/i, 'the VM did not finish booting in time'],
  [/ssh never came up/i, 'the VM did not answer SSH in time'],
  [/Could not find image|base image/i, 'the OS image is missing on the host'],
  [/No such file or directory/i, 'a required host file was missing'],
  [/domain .* is not running/i, 'the VM was not running when the job ran'],
  [/job is locked|single-flight/i, 'another job was still running'],
  [/ENOSPC/i, 'the host disk is full'],
  [/ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i, 'the host could not reach the download mirror'],
  [/image.*(failed|hash|mismatch)/i, 'the OS image failed verification'],
  [/snapshot limit reached/i, 'you have hit the snapshot limit — delete one before taking another'],
  [/not enough free space on the host/i, 'the host is low on disk space, so snapshots are paused'],
  [/disk has grown to/i, 'the disk outgrew its plan size, so snapshots are paused'],
  [/newer snapshots made on top of it/i, 'that snapshot has newer ones on top of it — delete those first'],
  [/newer snapshot.* on top of it/i, 'that snapshot has newer ones on top of it — delete those first'],
  [/no snapshot named/i, 'that snapshot no longer exists'],
  [/snapshot names must be/i, 'use a simple name: lowercase letters, digits and dashes'],
];

function matchRule(msg: string): string | null {
  for (const [re, nice] of RULES) {
    if (re.test(msg)) return nice;
  }
  return null;
}

/** execFile puts the INVOCATION on line 1 and the actual error on line 2. */
function isInvocationLine(line: string): boolean {
  return /^(Command failed:|virsh\b|qemu-img\b|genisoimage\b|ssh\b|curl\b)/i.test(line);
}

/**
 * The most informative line of the raw output. The old fallback took line 1,
 * so a failed `virsh shutdown` surfaced to the user as the literal command
 * string — telling them nothing and printing a host path. Prefer the second
 * line whenever the first is only a command.
 */
function firstReadableLine(msg: string): string {
  const lines = msg.split('\n').map((s) => s.trim()).filter(Boolean);
  let first = lines[0] ?? msg;
  if (lines.length > 1 && isInvocationLine(first)) first = lines[1];
  return first.replace(/^Command failed:\s*/i, '').replace(/\s+/g, ' ').trim();
}

export function friendlyError(raw: unknown): string {
  const msg = String((raw as Error)?.message ?? raw ?? '').trim();
  if (!msg) return 'unknown error';
  const known = matchRule(msg);
  if (known) return known;
  const first = firstReadableLine(msg);
  if (first.length > 160) return `${first.slice(0, 157)}…`;
  return first;
}

/** Progress lines a user can actually read from a create-job log. */
const STEP_MAP: [RegExp, string][] = [
  [/creating disk/i, 'creating the disk'],
  [/building cloud-init seed/i, 'writing cloud-init'],
  [/defining domain/i, 'registering the VM'],
  [/dhcp lease/i, 'reserving an IP'],
  [/starting domain/i, 'starting the VM'],
  [/waiting for ssh/i, 'waiting for SSH (this takes 30–90s)'],
  [/settle before/i, 'settling billing'],
  [/syncing|synced/i, 'downloading the OS image'],
  [/destroy\+undefine/i, 'destroying the VM'],
  [/rm seed/i, 'cleaning up'],
  // snapshot steps
  [/snapshot taken/i, 'snapshot saved'],
  [/freezing disk|snapshotting disk/i, 'writing the snapshot'],
  [/recording snapshot/i, 'recording the snapshot'],
  [/reverting disk to/i, 'rolling the disk back'],
  [/clean revert/i, 'clean revert: shutting down first'],
  [/restarting instance/i, 'starting the instance again'],
  [/guest ignored ACPI/i, 'guest ignored the shutdown request; forced off'],
  [/deleting snapshot/i, 'deleting the snapshot'],
  [/settle before revert/i, 'settling billing before rollback'],
];

export function friendlyStep(log: string): string {
  const lines = String(log ?? '').split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/^\[[^\]]+\]\s*/, '');
    for (const [re, nice] of STEP_MAP) if (re.test(line)) return nice;
  }
  return lines.length ? 'working' : '';
}
