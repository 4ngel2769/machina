/**
 * Per-user libvirt NAT networks.
 *
 * Every user gets exactly one private network (`machina-u<idx>`), created
 * lazily on first provision. VMs of the same user share it and can reach each
 * other; different users sit on different subnets and the machina_vnets
 * firewall drops all cross-bridge forwarding, so a guest cannot route to
 * another tenant's VM, the host's services, or the LAN — only out to the
 * internet through its own NAT.
 *
 * The subnet is USER-PICKED (see usernetpick.ts): IPv4 from RFC 6598
 * 100.64.0.0/10, IPv6 /64 from fd7a:115c:a1e0::/48. Rows written before the
 * picker existed keep their legacy 10.231.x subnet — the columns are NULL and
 * rowToNet falls back to the old derivation. Once a user has any instance the
 * pick is locked, because the guest's address is baked into its seed ISO.
 *
 * The row in user_nets is claimed BEFORE net-define so two concurrent
 * provisions cannot pick the same index or subnet; a failed define rolls the
 * row back.
 */
import { rawDb } from '@/lib/db';
import { config, storagePaths } from '@/lib/config';
import { virsh } from '@/lib/core/driver';
import { ignore } from '@/lib/core/ignore';
import { resolvePick, v4DhcpRange, v4Gateway, v4PrefixBits, v6Gateway, type UserNetRow } from '@/lib/core/usernetpick';
import fs from 'fs/promises';
import path from 'path';

export type UserNet = {
  userId: string;
  name: string;
  idx: number;
  subnet: string;    // v4 CIDR actually in use, e.g. '100.77.4.0/24' or legacy '10.231.7.0/24'
  gateway: string;   // first usable v4 address
  ipRange: string;   // 'a.b.c.d.50 - a.b.c.d.250'
  v6Subnet: string | null;  // 'fd7a:115c:a1e0:<h>::/64' or null on legacy rows
  v6Gateway: string | null; // 'fd7a:115c:a1e0:<h>::1'
};

/** Legacy pool for rows that predate the picker: 10.231.0.0/16, .0/.255 free. */
const LEGACY_BASE = '10.231';
const MAX_NETS = 250;

/** Derive the v4 pieces from whatever subnet the row carries. */
function v4Parts(subnet: string): { gateway: string; ipRange: string } {
  if (subnet.startsWith(`${LEGACY_BASE}.`)) {
    const third = subnet.split('.')[2]!;
    return {
      gateway: `${LEGACY_BASE}.${third}.1`,
      ipRange: `${LEGACY_BASE}.${third}.50 - ${LEGACY_BASE}.${third}.250`,
    };
  }
  const cidr = subnet.includes('/') ? subnet : `${subnet}/24`;
  const dhcp = v4DhcpRange(cidr);
  return { gateway: v4Gateway(cidr), ipRange: `${dhcp.start} - ${dhcp.end}` };
}

/** Public shape of a user_nets row for API responses (same as rowToNet,
 *  exported so routes don't re-derive the legacy fallback). */
export function rowToNetPublic(row: UserNetRow): UserNet {
  return rowToNet(row);
}

function rowToNet(row: UserNetRow): UserNet {
  const v4 = row.v4_subnet ?? `${LEGACY_BASE}.${row.idx}.0/24`;
  const v6 = row.v6_subnet;
  const parts = v4Parts(v4);
  return {
    userId: row.user_id,
    name: row.name,
    idx: row.idx,
    subnet: v4,
    gateway: parts.gateway,
    ipRange: parts.ipRange,
    v6Subnet: v6,
    v6Gateway: v6 ? v6Gateway(v6) : null,
  };
}

function netXml(net: UserNet): string {
  // Bridge name is deliberately short: libvirt defaults to virbr-<netname>
  // and IFNAMSIZ caps interface names at 15 chars, which 'virbr-machina-u12'
  // exceeds. The machina_vnets firewall matches the virbr-mu* prefix.
  const prefix = v4PrefixBits(net.subnet);
  const netmask = prefix === 24 ? '255.255.255.0' : undefined;
  const ipAttrs = netmask
    ? `address='${net.gateway}' netmask='${netmask}'`
    : `address='${net.gateway}' prefix='${prefix}'`;
  const v6 = net.v6Subnet && net.v6Gateway
    ? `\n  <ip family='ipv6' address='${net.v6Gateway}' prefix='64'/>`
    : '';
  return `<network>
  <name>${net.name}</name>
  <forward mode='nat'><nat><port start='1024' end='65535'/></nat></forward>
  <bridge name='virbr-mu${net.idx}' stp='on' delay='0'/>
  <ip ${ipAttrs}>
    <dhcp><range start='${net.ipRange.split('-')[0]!.trim()}' end='${net.ipRange.split('-')[1]!.trim()}'/></dhcp>
  </ip>${v6}
</network>`;
}

async function defineNet(net: UserNet): Promise<void> {
  const xmlPath = path.join(storagePaths().tmp, `usernet-${net.name}-${Date.now()}.xml`);
  await fs.mkdir(path.dirname(xmlPath), { recursive: true });
  await fs.writeFile(xmlPath, netXml(net), 'utf8');
  try {
    await virsh(['net-define', xmlPath]);
    await virsh(['net-start', net.name]).catch(ignore('user net may already be active'));
    await virsh(['net-autostart', net.name]).catch(ignore('autostart may already be set'));
  } finally {
    await fs.rm(xmlPath, { force: true }).catch(ignore('temp xml may not exist'));
  }
}

/** Insert one candidate row. Returns 'mine' on success, 'retry' when another
 *  user took the idx or subnet (unique-name/subnet collision), and throws
 *  anything else — a locked DB or disk-full must not be retried as a race. */
function claimRow(raw: ReturnType<typeof rawDb>, userId: string, proposal: UserNet, pick: { v4: string; v6: string }): 'mine' | 'retry' {
  try {
    raw.prepare(
      `insert into user_nets (user_id, name, idx, subnet, gateway, v4_subnet, v6_subnet, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, proposal.name, proposal.idx, proposal.subnet, proposal.gateway, pick.v4, pick.v6, Date.now());
    return 'mine';
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code.startsWith('SQLITE_CONSTRAINT')) return 'retry';
    throw error;
  }
}

/** The row a concurrent same-user provision already wrote, if any. */
function wonRow(raw: ReturnType<typeof rawDb>, userId: string): UserNet | null {
  const won = raw.prepare(`select * from user_nets where user_id=?`).get(userId) as UserNetRow | undefined;
  return won ? rowToNet(won) : null;
}

/** Claim a free index AND subnet pair, retrying on either collision. */
function claimNet(raw: ReturnType<typeof rawDb>, userId: string): { net: UserNet; pick: { v4: string; v6: string } } {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const maxRow = raw.prepare(`select coalesce(max(idx), 0) as m from user_nets`).get() as { m: number };
    const idx = maxRow.m + 1;
    if (idx > MAX_NETS) throw new Error('user network pool exhausted');
    // resolvePick auto-assigns the lowest free blocks; on a lost race the
    // unique index rejects and we loop with a fresh pair.
    const pick = resolvePick(raw, null);
    const parts = v4Parts(pick.v4);
    const proposal: UserNet = {
      userId,
      name: `machina-u${idx}`,
      idx,
      subnet: pick.v4,
      gateway: parts.gateway,
      ipRange: parts.ipRange,
      v6Subnet: pick.v6,
      v6Gateway: v6Gateway(pick.v6),
    };
    if (claimRow(raw, userId, proposal, pick) === 'mine') return { net: proposal, pick };
    const won = wonRow(raw, userId);
    if (won) return { net: won, pick: { v4: won.subnet, v6: won.v6Subnet ?? '' } };
  }
  throw new Error('user network pool exhausted');
}

/** The user's network, creating it on first use. */
export async function ensureUserNet(userId: string): Promise<UserNet> {
  const raw = rawDb();
  const existing = raw.prepare(`select * from user_nets where user_id=?`).get(userId) as UserNetRow | undefined;
  if (existing) {
    // Self-heal: the row can outlive the libvirt definition (manual cleanup,
    // restored DB). Re-define rather than hand the guest a dead network.
    const net = rowToNet(existing);
    await defineNet(net).catch(ignore('user net already defined'));
    return net;
  }

  const { net: candidate } = claimNet(raw, userId);

  try {
    await defineNet(candidate);
  } catch (defineError) {
    // Roll the claim back so the next attempt gets a clean index instead of
    // a row pointing at a network that does not exist.
    raw.prepare(`delete from user_nets where user_id=?`).run(userId);
    throw defineError;
  }
  return candidate;
}

/** Gateway for an instance's network; machina0 keeps the configured gateway. */
export function gatewayForNet(netName: string): string {
  if (netName === config.network) return config.gateway;
  const row = rawDb().prepare(`select gateway from user_nets where name=?`).get(netName) as
    { gateway: string } | undefined;
  return row?.gateway ?? config.gateway;
}
