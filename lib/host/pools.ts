import { virsh } from '@/lib/core/driver';

/**
 * Libvirt storage pools on the host.
 *
 * A libvirt dir pool only re-scans its directory when someone tells it to, so
 * a file placed there by anything other than libvirt is invisible to `virsh
 * vol-list` until a refresh. That is the whole reason this panel exists: after
 * dropping a base image or an ISO in place, refresh is the missing step.
 */

export type Pool = {
  name: string;
  type: string;
  state: 'running' | 'stopped';
  autostart: boolean;
  persistent: boolean;
  path: string;
  capacityMb: number | null;
  allocationMb: number | null;
  availableMb: number | null;
};

/** Pool names reach an argv slot, so they are an allowlist not a free string. */
const POOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function assertPool(name: string): string {
  if (!POOL_NAME.test(name)) throw new Error('invalid pool name');
  return name;
}

/** pool-info humanises units (100.00 GiB, 1.5 MiB, 512 bytes). Normalise. */
function toMb(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^([\d.]+)\s*([KMGTP]?i?B)$/i.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult: Record<string, number> = {
    B: 1 / 1048576, KB: 1 / 1024, KIB: 1 / 1024,
    MB: 1, MIB: 1, GB: 1024, GIB: 1024,
    TB: 1048576, TIB: 1048576, PB: 1073741824, PIB: 1073741824,
  };
  return Math.round(n * (mult[m[2].toUpperCase()] ?? 1));
}

function field(txt: string, key: string): string | undefined {
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(txt)?.[1]?.trim();
}

export async function listPools(): Promise<Pool[]> {
  const names = (await virsh(['pool-list', '--all', '--name']))
    .split('\n').map((s) => s.trim()).filter(Boolean);

  // pool-info and pool-dumpxml are one process each; pools are few, and a
  // failure on one must not blank the table for the others.
  return Promise.all(names.map(async (name): Promise<Pool> => {
    const [info, xml] = await Promise.all([
      virsh(['pool-info', name]).catch(() => ''),
      virsh(['pool-dumpxml', name]).catch(() => ''),
    ]);
    return {
      name,
      type: /<pool\b[^>]*type='([^']*)'/.exec(xml)?.[1] ?? '',
      state: /^running$/i.test(field(info, 'State') ?? '') ? 'running' : 'stopped',
      autostart: /^yes$/i.test(field(info, 'Autostart') ?? ''),
      persistent: /^yes$/i.test(field(info, 'Persistent') ?? ''),
      path: /<path>([^<]*)<\/path>/.exec(xml)?.[1] ?? '',
      capacityMb: toMb(field(info, 'Capacity')),
      allocationMb: toMb(field(info, 'Allocation')),
      availableMb: toMb(field(info, 'Available')),
    };
  }));
}

export async function refreshPool(name: string): Promise<string> {
  assertPool(name);
  await virsh(['pool-refresh', name]);
  return `${name} rescanned`;
}
