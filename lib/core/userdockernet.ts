/**
 * Per-user docker bridge networks for tenant containers.
 *
 * Same shape as lib/core/usernet.ts (the libvirt equivalent): one private
 * bridge per user, created lazily, claimed in user_dockernets BEFORE the
 * docker network exists so two concurrent creates cannot pick the same
 * index. Subnets come from 10.240.0.0/16 — outside docker's default
 * 172.17-31 pools and outside the libvirt 10.231.x tenant range, and the
 * host's existing 10.0.x.x compose networks.
 *
 * Isolation is structural: docker bridges are L2 islands. Two tenants on
 * different machina-cu<idx> networks cannot route to each other at all —
 * there is no gateway path between bridges — while containers on the same
 * user's network reach each other by name.
 */
import { rawDb } from '@/lib/db';
import { run } from '@/lib/host/exec';
import { ignore } from '@/lib/core/ignore';

export type UserDockernet = {
  userId: string;
  name: string;      // machina-cu<idx>
  idx: number;
  subnet: string;    // 10.240.<idx>.0/24
};

/** 10.240.0.0/16 gives 256 tenant /24s; .0 and .255 stay unused. */
const POOL_BASE = '10.240';
const MAX_NETS = 250;

function rowToNet(row: { user_id: string; name: string; idx: number; subnet: string }): UserDockernet {
  return { userId: row.user_id, name: row.name, idx: row.idx, subnet: row.subnet };
}

async function defineNet(net: UserDockernet): Promise<void> {
  // --internal would cut egress too; tenants need outbound internet, so a
  // normal bridge with NAT (docker's default) is correct. Internal=false.
  await run('docker', [
    'network', 'create',
    '--driver', 'bridge',
    '--subnet', net.subnet,
    '--label', 'machina.usernet=1',
    net.name,
  ], { timeout: 30_000 });
}

/** The user's docker network, creating it on first use. */
export async function ensureUserDockernet(userId: string): Promise<UserDockernet> {
  const raw = rawDb();
  const existing = raw.prepare(`select * from user_dockernets where user_id=?`).get(userId) as
    | { user_id: string; name: string; idx: number; subnet: string }
    | undefined;
  if (existing) {
    const net = rowToNet(existing);
    // Self-heal: the row can outlive the docker network (prune, restore).
    await run('docker', ['network', 'inspect', net.name], { timeout: 10_000 })
      .catch(() => defineNet(net));
    return net;
  }

  const maxRow = raw.prepare(`select coalesce(max(idx), 0) as m from user_dockernets`).get() as { m: number };
  const idx = maxRow.m + 1;
  if (idx > MAX_NETS) throw new Error('container network pool exhausted');

  const candidate: UserDockernet = {
    userId,
    name: `machina-cu${idx}`,
    idx,
    subnet: `${POOL_BASE}.${idx}.0/24`,
  };

  try {
    raw.prepare(
      `insert into user_dockernets (user_id, name, idx, subnet, created_at) values (?, ?, ?, ?, ?)`,
    ).run(userId, candidate.name, idx, candidate.subnet, Date.now());
  } catch (insertError) {
    const won = raw.prepare(`select * from user_dockernets where user_id=?`).get(userId) as typeof existing;
    if (won) return rowToNet(won);
    throw insertError;
  }

  try {
    await defineNet(candidate);
  } catch (defineError) {
    raw.prepare(`delete from user_dockernets where user_id=?`).run(userId);
    throw defineError;
  }
  return candidate;
}

/** Remove the user's bridge once their last container is gone. Best effort:
 *  a leftover empty network is harmless, a failed removal must not fail the
 *  container delete that triggered it. */
export async function maybeRemoveUserDockernet(userId: string): Promise<void> {
  const raw = rawDb();
  const remaining = raw.prepare(`select count(*) as n from user_containers where user_id=?`).get(userId) as { n: number };
  if ((remaining.n ?? 0) > 0) return;
  const row = raw.prepare(`select name from user_dockernets where user_id=?`).get(userId) as { name: string } | undefined;
  if (!row) return;
  await run('docker', ['network', 'rm', row.name], { timeout: 15_000 }).catch(ignore('network may already be gone'));
  raw.prepare(`delete from user_dockernets where user_id=?`).run(userId);
}
