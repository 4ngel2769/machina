/**
 * Per-user libvirt NAT networks.
 *
 * Every user gets exactly one private network (`machina-u<idx>`), created
 * lazily on first provision. VMs of the same user share it and can reach each
 * other; different users sit on different /24s and the machina_vnets
 * firewall drops all cross-bridge forwarding, so a guest cannot route to
 * another tenant's VM, the host's services, or the LAN — only out to the
 * internet through its own NAT.
 *
 * The row in user_nets is claimed BEFORE net-define so two concurrent
 * provisions cannot pick the same index; a failed define rolls the row back.
 */
import { rawDb } from '@/lib/db';
import { config, storagePaths } from '@/lib/config';
import { virsh } from '@/lib/core/driver';
import { ignore } from '@/lib/core/ignore';
import fs from 'fs/promises';
import path from 'path';

export type UserNet = {
  userId: string;
  name: string;
  idx: number;
  subnet: string;   // 10.231.<idx>.0/24
  gateway: string;  // 10.231.<idx>.1
  ipRange: string;  // '10.231.<idx>.50 - 10.231.<idx>.250'
};

/** 10.231.0.0/16 gives 256 tenant /24s; .0 and .255 stay unused. */
const POOL_BASE = '10.231';
const MAX_NETS = 250;

function rowToNet(row: {
  user_id: string; name: string; idx: number; subnet: string; gateway: string;
}): UserNet {
  const third = row.subnet.split('.')[2]!;
  return {
    userId: row.user_id,
    name: row.name,
    idx: row.idx,
    subnet: row.subnet,
    gateway: row.gateway,
    ipRange: `${POOL_BASE}.${third}.50 - ${POOL_BASE}.${third}.250`,
  };
}

function netXml(net: UserNet): string {
  // Bridge name is deliberately short: libvirt defaults to virbr-<netname>
  // and IFNAMSIZ caps interface names at 15 chars, which 'virbr-machina-u12'
  // exceeds. The machina_vnets firewall matches the virbr-mu* prefix.
  return `<network>
  <name>${net.name}</name>
  <forward mode='nat'><nat><port start='1024' end='65535'/></nat></forward>
  <bridge name='virbr-mu${net.idx}' stp='on' delay='0'/>
  <ip address='${net.gateway}' netmask='255.255.255.0'>
    <dhcp><range start='${net.ipRange.split('-')[0]!.trim()}' end='${net.ipRange.split('-')[1]!.trim()}'/></dhcp>
  </ip>
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

/** The user's network, creating it on first use. */
export async function ensureUserNet(userId: string): Promise<UserNet> {
  const raw = rawDb();
  const existing = raw.prepare(`select * from user_nets where user_id=?`).get(userId) as
    | { user_id: string; name: string; idx: number; subnet: string; gateway: string }
    | undefined;
  if (existing) {
    // Self-heal: the row can outlive the libvirt definition (manual cleanup,
    // restored DB). Re-define rather than hand the guest a dead network.
    const net = rowToNet(existing);
    await defineNet(net).catch(ignore('user net already defined'));
    return net;
  }

  const maxRow = raw.prepare(`select coalesce(max(idx), 0) as m from user_nets`).get() as { m: number };
  const idx = maxRow.m + 1;
  if (idx > MAX_NETS) throw new Error('user network pool exhausted');

  const candidate: UserNet = {
    userId,
    name: `machina-u${idx}`,
    idx,
    subnet: `${POOL_BASE}.${idx}.0/24`,
    gateway: `${POOL_BASE}.${idx}.1`,
    ipRange: `${POOL_BASE}.${idx}.50 - ${POOL_BASE}.${idx}.250`,
  };

  try {
    raw.prepare(
      `insert into user_nets (user_id, name, idx, subnet, gateway, created_at) values (?, ?, ?, ?, ?, ?)`,
    ).run(userId, candidate.name, idx, candidate.subnet, candidate.gateway, Date.now());
  } catch (insertError) {
    // Lost a race with a concurrent provision for the same user: the other
    // writer's row is the one that counts.
    const won = raw.prepare(`select * from user_nets where user_id=?`).get(userId) as typeof existing;
    if (won) return rowToNet(won);
    throw insertError;
  }

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
