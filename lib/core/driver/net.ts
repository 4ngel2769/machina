/**
 * Guest networking identity: a MAC derived from the instance id, the IPv4
 * allocator, and the DHCP reservations the NAT network carries. This is the
 * only file that knows a MAC is a hash of a name and an IP is the lowest free
 * address in a range.
 */
import { config } from '@/lib/config';
import { virsh } from './exec';
import { logInfo } from '@/lib/core/log';

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
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193) >>> 0;
  }
  hash = (hash ^ (id.length * 31)) >>> 0;
  const octet2 = (hash & 0xff).toString(16).padStart(2, '0');
  const octet1 = ((hash >> 8) & 0xff).toString(16).padStart(2, '0');
  const octet0 = ((hash >> 16) & 0xff).toString(16).padStart(2, '0');
  return `52:54:00:${octet0}:${octet1}:${octet2}`;
}

/**
 * Allocate the lowest free IPv4 in `range` (default config.ipRange) that no
 * row in `taken` uses. Caller passes the set of IPs already claimed — scoped
 * to one network, since the same address is legitimately reused across
 * different user subnets.
 */
export class IpAllocator {
  private taken: Set<string>;
  private range: string;
  constructor(taken: string[], range: string = config.ipRange) {
    this.taken = new Set(taken);
    this.range = range;
  }
  next(): string | null {
    const [start, end] = this.range.split('-').map((part) => part.trim());
    const startOctets = start.split('.').map((octet) => parseInt(octet, 10));
    const endOctets = end.split('.').map((octet) => parseInt(octet, 10));
    const toInt = (octets: number[]) => ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    let current = toInt(startOctets);
    const stop = toInt(endOctets);
    const base = startOctets.slice(0, 3).join('.');
    while (current <= stop) {
      const ip = `${base}.${current & 0xff}`;
      if (!this.taken.has(ip)) return ip;
      const lastOctet = current & 0xff;
      if (lastOctet === 255) return null;
      current++;
    }
    return null;
  }
}

export async function ensureIpLease(mac: string, ip: string, network: string = config.network): Promise<void> {
  try {
    // A retried provisioning reuses the same MAC, and a previous attempt leaves
    // its reservation behind. net-update then refuses with "there is an
    // existing dhcp host entry ... that matches" and the whole create logs a
    // scary error even though the lease is exactly what we wanted.
    const xml = await virsh(['net-dumpxml', network, '--inactive']);
    const existing = new RegExp(`<host mac='${mac}'[^>]*ip='([^']+)'`);
    const match = xml.match(existing);
    if (match && match[1] === ip) return;
    if (match) await removeIpLease(mac, network);
    await virsh(['net-update', network, 'add', 'ip-dhcp-host', `<host mac='${mac}' ip='${ip}'/>`, '--config']);
  } catch (leaseError) {
    // Not fatal: cloud-init sets a static IP anyway. DHCP entry is belt+braces.
    logInfo(`[driver] dhcp lease update failed (non-fatal): ${(leaseError as Error).message}`);
  }
}

export async function removeIpLease(mac: string, network: string = config.network): Promise<void> {
  // Live and persistent config are separate stores and either may hold the
  // entry, so each verb is attempted on its own: passing --config --live makes
  // virsh abort on the first store that does not have it, silently leaving the
  // other one behind.
  for (const scope of ['--live', '--config'] as const) {
    try {
      await virsh(['net-update', network, 'delete', 'ip-dhcp-host', `<host mac='${mac}'/>`, scope]);
    } catch {
      /* not present in this scope */
    }
  }
}
