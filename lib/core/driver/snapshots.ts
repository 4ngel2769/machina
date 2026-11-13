/**
 * Internal qcow2 snapshots: list, create, revert, delete. libvirt's
 * snapshot-delete removes a whole subtree without warning, so the guards here
 * are data-loss prevention, not convenience.
 */
import { virsh } from './exec';
import { isDomainRunning } from './domains';

/**
 * Snapshot names reach libvirt as an XML attribute and end up on a command
 * line, so the whitelist is the security boundary, not a style choice:
 * lowercase alphanumerics and dashes only, 1..40 chars, must start with a
 * letter or digit. That excludes quotes, angle brackets, spaces, slashes,
 * newlines and every shell metacharacter in one step.
 */
export const SNAPSHOT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type DomSnapshot = {
  name: string;
  description: string;
  state: string; // disk | running | quiesced
  isCurrent: boolean;
  /** Bytes this snapshot ADDED to the disk, as virsh reports it. */
  sizeBytes: number;
  createdAt: number;
};

/** Reject anything that is not a plain label, before it reaches libvirt. */
export function assertSnapshotName(name: string): string {
  const n = String(name ?? '').trim().toLowerCase();
  if (!SNAPSHOT_NAME_RE.test(n)) {
    throw new Error(
      'snapshot names must be 1-40 characters of lowercase letters, digits and dashes',
    );
  }
  return n;
}

/** Table header, the dashes rule, and blank lines are not snapshots. */
function isSnapshotHeader(t: string): boolean {
  return !t || /^-+$/.test(t) || /^Name\s/.test(t);
}

/** Date.parse or 0. libvirt sometimes prints a cell it cannot be parsed from. */
function parseCreatedAt(cell: string | undefined): number {
  if (!cell) return 0;
  const parsed = Date.parse(cell.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** One row of `virsh snapshot-list`, or null for headers, rules and blanks. */
function parseSnapshotRow(line: string): DomSnapshot | null {
  const t = line.trim();
  if (isSnapshotHeader(t)) return null;
  const cols = t.split(/\s{2,}/);
  const name = (cols[0] ?? '').trim();
  if (!name || !SNAPSHOT_NAME_RE.test(name.toLowerCase())) return null;
  return {
    name,
    description: '',
    state: (cols[2] ?? '').trim() || 'disk',
    isCurrent: false,
    // libvirt 10 reports no per-snapshot disk delta here. Leave it 0 rather
    // than fabricate one; the panel reports real cumulative disk use.
    sizeBytes: 0,
    createdAt: parseCreatedAt(cols[1]),
  };
}

/** `current` and the description live in the per-snapshot form, not the table. */
async function fillSnapshotInfo(domainName: string, row: DomSnapshot): Promise<void> {
  try {
    const info = await virsh(
      ['snapshot-info', domainName, '--snapshotname', row.name], 20_000,
    );
    const cur = /^Current:\s+(\S+)/mi.exec(info);
    row.isCurrent = cur ? /^yes$/i.test(cur[1]) : false;
    const ds = /Description:\s*(.*)/i.exec(info);
    if (ds && ds[1].trim()) row.description = ds[1].trim();
  } catch {
    // One unreadable snapshot must not hide the rest of the list.
  }
}

/**
 * List a domain's snapshots. Parses `virsh snapshot-list` (one line per
 * snapshot, tabs separating name/state/parent time) and cross-checks the
 * default/parent flag so `current` is honest.
 *
 * The human-readable table is the ONLY source of creation time on libvirt
 * 10.0: `snapshot-list --name` gives names with no timestamps, and
 * `snapshot-info <dom>` without a name is an error ("--snapshotname or
 * --current is required"). Columns are separated by runs of spaces.
 */
export async function listSnapshots(domainName: string): Promise<DomSnapshot[]> {
  const table = await virsh(['snapshot-list', domainName], 30_000);
  const rows = table
    .split('\n')
    .map(parseSnapshotRow)
    .filter((row): row is DomSnapshot => row !== null);
  for (const row of rows) await fillSnapshotInfo(domainName, row);
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

/**
 * Create an INTERNAL snapshot (metadata stored inside the qcow2 overlay).
 * `--atomic` is only valid on a shut-off domain: it stages the snapshot in a
 * temp file and renames, which libvirt refuses for a live guest.
 */
export async function createSnapshot(
  domainName: string,
  name: string,
  description = '',
): Promise<void> {
  const snap = assertSnapshotName(name);
  const live = await isDomainRunning(domainName);
  const args = ['snapshot-create-as', domainName, snap];
  if (!live) args.push('--atomic');
  if (description) args.push('--description', description.slice(0, 200));
  await virsh(args, 300_000); // large disks: a snapshot is not instant
}

/** Revert the disk to a snapshot. Refuses unless the snapshot exists. */
export async function revertSnapshot(domainName: string, name: string): Promise<void> {
  const snap = assertSnapshotName(name);
  const names = (await listSnapshots(domainName)).map((s) => s.name);
  if (!names.includes(snap)) throw new Error(`no snapshot named "${snap}"`);
  await virsh(['snapshot-revert', domainName, snap], 600_000);
}

/** Newer snapshots stacked on this one, or null when `snapshot-info` fails.
 *  Null must never be read as "safe to delete". */
async function descendantsOf(domainName: string, snap: string): Promise<number | null> {
  try {
    const info = await virsh(
      ['snapshot-info', domainName, '--snapshotname', snap], 20_000,
    );
    const children = /^Children:\s+(\d+)/mi.exec(info);
    const descendants = /^Descendants:\s+(\d+)/mi.exec(info);
    return Math.max(Number(children?.[1] ?? 0), Number(descendants?.[1] ?? 0));
  } catch {
    return null;
  }
}

/** Translate libvirt's "not found" into the same sentence the guard uses. */
async function deleteSnapshotOrTranslate(domainName: string, snap: string): Promise<void> {
  try {
    await virsh(['snapshot-delete', domainName, snap], 120_000);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (/not found|no such/i.test(msg)) throw new Error(`no snapshot named "${snap}"`);
    throw e;
  }
}

/**
 * Delete one snapshot, refusing when it has descendants.
 *
 * libvirt 10's `snapshot-delete` takes the whole subtree with it and says
 * nothing: deleting the oldest snapshot of three silently destroyed the other
 * two. For a rented VM that is data loss the tenant never asked for and never
 * saw, so check the child count first and make the user delete newest-first.
 */
export async function deleteSnapshot(domainName: string, name: string): Promise<void> {
  const snap = assertSnapshotName(name);
  const listed = (await listSnapshots(domainName)).map((s) => s.name);
  if (!listed.includes(snap)) throw new Error(`no snapshot named "${snap}"`);
  const descendants = await descendantsOf(domainName, snap);
  if (descendants) {
    throw new Error(
      `"${snap}" has ${descendants} newer snapshot${descendants === 1 ? '' : 's'} on top of it — delete ${descendants === 1 ? 'that one' : 'those'} first`,
    );
  }
  await deleteSnapshotOrTranslate(domainName, snap);
}
