/**
 * Guest networking identity: a MAC derived from the instance id, the IPv4
 * allocator, and the DHCP reservations the NAT network carries. This is the
 * only file that knows a MAC is a hash of a name and an IP is the lowest free
 * address in a range.
 */
import { config } from '@/lib/config';
import { virsh } from './exec';

export function macFromId(id: string): string {
  // Deterministic, collision-safe for our scale: 52:54:00:XX:XX:XX from an
  // FNV-1a hash OF THE CHARACTER CODES.
  //
  // BUG THIS FIXES: the loop iterated `for (const c of id)` but never used `c`,
  // so the hash only depended on id.length. Every instance id has the same
  // length ('vm_' + 16 hex), so EVERY VM was handed the identical MAC. They
  // collided on the bridge, only one could take an address, and the rest hung
  // in systemd-networkd-wait-online until the SSH timeout killed provisioning.
  // Math.imul keeps the multiply in 32-bit; a plain `*` loses precision above
  // 2^53 and silently collides even sooner.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  h = (h ^ (id.length * 31)) >>> 0;
  const b2 = (h & 0xff).toString(16).padStart(2, '0');
  const b1 = ((h >> 8) & 0xff).toString(16).padStart(2, '0');
  const b0 = ((h >> 16) & 0xff).toString(16).padStart(2, '0');
  return `52:54:00:${b0}:${b1}:${b2}`;
}

/**
 * Allocate the lowest free IPv4 in config.ipRange that no row in `taken` uses.
 * Caller passes the set of IPs already claimed.
 */
export class IpAllocator {
  private taken: Set<string>;
  constructor(taken: string[]) {
    this.taken = new Set(taken);
  }
  next(): string | null {
    const [start, end] = config.ipRange.split('-').map((s) => s.trim());
    const s4 = start.split('.').map((n) => parseInt(n, 10));
    const e4 = end.split('.').map((n) => parseInt(n, 10));
    const toInt = (a: number[]) => ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
    let cur = toInt(s4);
    const stop = toInt(e4);
    const base = s4.slice(0, 3).join('.');
    while (cur <= stop) {
      const ip = `${base}.${cur & 0xff}`;
      if (!this.taken.has(ip)) return ip;
      const last = cur & 0xff;
      if (last === 255) return null;
      cur++;
    }
    return null;
  }
}

export async function ensureIpLease(mac: string, ip: string): Promise<void> {
  try {
    // A retried provisioning reuses the same MAC, and a previous attempt leaves
    // its reservation behind. net-update then refuses with "there is an
    // existing dhcp host entry ... that matches" and the whole create logs a
    // scary error even though the lease is exactly what we wanted.
    const xml = await virsh(['net-dumpxml', config.network, '--inactive']);
    const existing = new RegExp(`<host mac='${mac}'[^>]*ip='([^']+)'`);
    const m = xml.match(existing);
    if (m && m[1] === ip) return;
    if (m) await removeIpLease(mac);
    await virsh(['net-update', config.network, 'add', 'ip-dhcp-host', `<host mac='${mac}' ip='${ip}'/>`, '--config']);
  } catch (e) {
    // Not fatal: cloud-init sets a static IP anyway. DHCP entry is belt+braces.
    console.log(`[driver] dhcp lease update failed (non-fatal): ${(e as Error).message}`);
  }
}

export async function removeIpLease(mac: string): Promise<void> {
  // Live and persistent config are separate stores and either may hold the
  // entry, so each verb is attempted on its own: passing --config --live makes
  // virsh abort on the first store that does not have it, silently leaving the
  // other one behind.
  for (const scope of ['--live', '--config'] as const) {
    try {
      await virsh(['net-update', config.network, 'delete', 'ip-dhcp-host', `<host mac='${mac}'/>`, scope]);
    } catch {
      /* not present in this scope */
    }
  }
}
