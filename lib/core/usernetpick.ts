/**
 * Per-user private-network subnet selection.
 *
 * Tailscale-style: a user (or an admin on their behalf) picks the block their
 * VMs live on. IPv4 comes from RFC 6598 shared address space (100.64.0.0/10) —
 * the range reserved for "private internet access" / CGNAT, which is exactly
 * what a tenant bridge is: reachable only inside the host's NAT, never routed
 * on the public internet. IPv6 comes from the ULA pool fd7a:115c:a1e0::/48,
 * the same range Tailscale hands out, carved into /64s for SLAAC.
 *
 * Collision avoidance is the whole point of doing this in one module:
 *   - the pick must be inside the allowed pool and the right prefix length
 *   - it must not be one of the excluded anchors (documentation ranges,
 *     the anycast/Tailscale service blocks)
 *   - it must not already be claimed in user_nets — enforced twice: here for
 *     a friendly error, and by the UNIQUE index for the race
 *   - a user with ANY instance row is locked: guests get their address baked
 *     into the cloud-init seed at provision time, so changing the subnet
 *     under a live (or even stopped) VM strands it on an address the bridge
 *     no longer serves. Deleting every instance unlocks the pick.
 */
import { rawDb } from '@/lib/db';

/** RFC 6598 shared space. /10 = 100.64.0.0 – 100.127.255.255. */
export const V4_POOL = '100.64.0.0/10';
/** Tailscale's ULA prefix; we carve /64s out of it. */
export const V6_POOL = 'fd7a:115c:a1e0::/48';

/** /24s inside the pool that are documentation or infrastructure anchors and
 *  must never be handed to a tenant. */
const V4_EXCLUDE = new Set([
  '100.64.0.0/24',   // pool documentation anchor
  '100.64.0.1/32',
  '100.127.255.255/32',
]);

export type NetPick = {
  v4: string;   // e.g. '100.77.4.0/24'
  v6: string;   // e.g. 'fd7a:115c:a1e0:4::/64'
};

export type UserNetRow = {
  user_id: string; name: string; idx: number;
  subnet: string; gateway: string;
  v4_subnet: string | null; v6_subnet: string | null;
  created_at: number;
};

/** Parse 'a.b.c.d/n' into {addr:int, prefix}. Returns null on garbage. */
function parseV4(cidr: string): { addr: number; prefix: number } | null {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(cidr.trim());
  if (!m) return null;
  const parts = m[1]!.split('.').map(Number);
  if (parts.some((p) => p > 255)) return null;
  const addr = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  const prefix = Number(m[2]);
  if (prefix < 8 || prefix > 30) return null;
  return { addr, prefix };
}

/** True when `inner` is fully inside `outer` (both parsed v4 CIDRs). */
function v4Contains(outer: { addr: number; prefix: number }, inner: { addr: number; prefix: number }): boolean {
  if (inner.prefix < outer.prefix) return false;
  const shift = 32 - outer.prefix;
  const mask = shift === 32 ? 0 : (~0 << shift) >>> 0;
  return (inner.addr & mask) === (outer.addr & mask);
}

/** Canonical 'a.b.c.d/24' for a v4 CIDR — network address + prefix. */
function canonV4(cidr: string): string | null {
  const parsed = parseV4(cidr);
  if (!parsed) return null;
  const shift = 32 - parsed.prefix;
  const net = (parsed.addr & ((~0 << shift) >>> 0)) >>> 0;
  const a = (net >>> 24) & 0xff; const b = (net >>> 16) & 0xff;
  const c = (net >>> 8) & 0xff; const d = net & 0xff;
  return `${a}.${b}.${c}.${d}/${parsed.prefix}`;
}

/** Expand 'a::b' style v6 text into 8 hextets, or null on garbage. */
function v6Hextets(addr: string): number[] | null {
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (groups.length !== 8) return null;
  const hextets = groups.map((g) => parseInt(g, 16));
  return hextets.some((h) => Number.isNaN(h)) ? null : hextets;
}

/** Parse 'xxxx:.../n' into hextets + prefix. Null on malformed input. */
function parseV6(cidr: string): { hextets: number[]; prefix: number } | null {
  const m = /^([0-9a-fA-F:]+)\/(\d{1,3})$/.exec(cidr.trim());
  if (!m) return null;
  const prefix = Number(m[2]);
  if (prefix < 48 || prefix > 126) return null;
  const hextets = v6Hextets(m[1]!);
  return hextets ? { hextets, prefix } : null;
}

/** Canonical lowercase 'xxxx:.../64' for a v6 CIDR. */
function canonV6(cidr: string): string | null {
  const parsed = parseV6(cidr);
  if (!parsed) return null;
  // Zero the host bits so 'fd7a:...:4:1::/64' stores as 'fd7a:...:4::/64'.
  const h = parsed.hextets.slice();
  for (let i = Math.floor(parsed.prefix / 16); i < 8; i += 1) {
    if (i * 16 >= parsed.prefix) h[i] = 0;
    else h[i] &= (0xffff << (16 - (parsed.prefix - i * 16))) & 0xffff;
  }
  const text = h.map((x) => x.toString(16)).join(':');
  return `${text}/${parsed.prefix}`;
}

/** The /48 pool as hextets for containment checks. */
const V6_POOL_HEXTETS = [0xfd7a, 0x115c, 0xa1e0];

function v6InPool(cidr: string): boolean {
  const parsed = parseV6(cidr);
  if (!parsed || parsed.prefix < 48) return false;
  return parsed.hextets[0] === V6_POOL_HEXTETS[0]
    && parsed.hextets[1] === V6_POOL_HEXTETS[1]
    && parsed.hextets[2] === V6_POOL_HEXTETS[2];
}

/** Is this v4 CIDR inside 100.64.0.0/10 and not an excluded anchor? */
export function v4PickOk(cidr: string): boolean {
  const canon = canonV4(cidr);
  if (!canon) return false;
  const parsed = parseV4(canon)!;
  const pool = parseV4(V4_POOL)!;
  if (!v4Contains(pool, parsed)) return false;
  if (V4_EXCLUDE.has(canon)) return false;
  // A /24 is the sweet spot: big enough for a tenant, small enough that the
  // pool still has room. Other prefixes inside the pool are allowed but the
  // DHCP range math below assumes at least a /24, so require it.
  return parsed.prefix === 24;
}

/** Is this v6 CIDR a /64 inside fd7a:115c:a1e0::/48? */
export function v6PickOk(cidr: string): boolean {
  const canon = canonV6(cidr);
  if (!canon) return false;
  const parsed = parseV6(canon)!;
  return parsed.prefix === 64 && v6InPool(canon);
}

/** Lowest unclaimed v4 /24 in the pool, scanning from the bottom. */
function autoV4(raw: ReturnType<typeof rawDb>): string {
  const taken = new Set(
    (raw.prepare(`select v4_subnet from user_nets where v4_subnet is not null`).all() as { v4_subnet: string }[])
      .map((row) => row.v4_subnet),
  );
  // Walk the third octet of 100.64.x.0/24 — 64 values per second octet, 64
  // second octets = 4096 blocks, far more than any homelab will see.
  for (let second = 64; second <= 127; second += 1) {
    for (let third = 0; third <= 255; third += 1) {
      const cidr = `100.${second}.${third}.0/24`;
      if (!taken.has(cidr) && v4PickOk(cidr)) return cidr;
    }
  }
  throw new Error('RFC 6598 pool exhausted — every /24 is claimed');
}

/** Lowest unclaimed v6 /64 in the pool. */
function autoV6(raw: ReturnType<typeof rawDb>): string {
  const taken = new Set(
    (raw.prepare(`select v6_subnet from user_nets where v6_subnet is not null`).all() as { v6_subnet: string }[])
      .map((row) => row.v6_subnet),
  );
  for (let h = 0; h <= 0xffff; h += 1) {
    const cidr = `fd7a:115c:a1e0:${h.toString(16)}::/64`;
    if (!taken.has(cidr)) return cidr;
  }
  throw new Error('ULA pool exhausted — every /64 is claimed');
}

/** True when another user already holds this exact block. */
function subnetTaken(raw: ReturnType<typeof rawDb>, v4: string, v6: string, exceptUser?: string): boolean {
  const row = raw.prepare(
    `select 1 from user_nets where (v4_subnet=? or v6_subnet=?) and user_id<>? limit 1`,
  ).get(v4, v6, exceptUser ?? '') as { 1: number } | undefined;
  return !!row;
}

/** Validate one side of the pick; returns the canonical CIDR or throws. */
function checkedPick(kind: 'ipv4' | 'ipv6', raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (kind === 'ipv4') {
    const canon = canonV4(raw);
    if (!canon || !v4PickOk(canon)) {
      throw new Error('ipv4 must be a /24 inside 100.64.0.0/10 (RFC 6598), excluding reserved anchors');
    }
    return canon;
  }
  const canon = canonV6(raw);
  if (!canon || !v6PickOk(canon)) {
    throw new Error('ipv6 must be a /64 inside fd7a:115c:a1e0::/48');
  }
  return canon;
}

/**
 * Validate a pick (or auto-assign when null) and return the canonical pair.
 * Throws with a human-readable reason on any violation — the API turns that
 * into a 400 and the UI shows it verbatim.
 */
export function resolvePick(raw: ReturnType<typeof rawDb>, pick: { v4?: string | null; v6?: string | null } | null): NetPick {
  const v4 = checkedPick('ipv4', pick?.v4);
  const v6 = checkedPick('ipv6', pick?.v6);
  const finalV4 = v4 ?? autoV4(raw);
  const finalV6 = v6 ?? autoV6(raw);
  if (subnetTaken(raw, finalV4, finalV6)) {
    throw new Error('that block is already claimed by another user');
  }
  return { v4: finalV4, v6: finalV6 };
}

/** How many instance rows pin this user's subnet. */
export function instanceCount(userId: string): number {
  const row = rawDb().prepare(`select count(*) as n from instances where user_id=?`).get(userId) as { n: number };
  return row.n;
}

/** The user's current pick, or null when they have no net row yet. */
export function currentPick(userId: string): { v4: string | null; v6: string | null; locked: boolean; count: number } {
  const row = rawDb().prepare(`select v4_subnet, v6_subnet from user_nets where user_id=?`).get(userId) as
    { v4_subnet: string | null; v6_subnet: string | null } | undefined;
  const count = instanceCount(userId);
  return { v4: row?.v4_subnet ?? null, v6: row?.v6_subnet ?? null, locked: count > 0, count };
}

/** Gateway = first usable address in the block (.1 for v4, ::1 for v6). */
export function v4Gateway(cidr: string): string {
  const [addr] = cidr.split('/');
  const parts = addr!.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

export function v6Gateway(cidr: string): string {
  const [addr] = cidr.split('/');
  const hextets = v6Hextets(addr!);
  if (!hextets) return `${addr}1`;
  hextets[7] = 1;
  return hextets.map((h) => h.toString(16)).join(':');
}

/** DHCP host range inside a /24: .50 - .250, same shape as the old scheme. */
export function v4DhcpRange(cidr: string): { start: string; end: string } {
  const [addr] = cidr.split('/');
  const parts = addr!.split('.');
  const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return { start: `${base}.50`, end: `${base}.250` };
}

/** CIDR prefix bits for a v4 subnet string, defaulting to 24. */
export function v4PrefixBits(cidr: string): number {
  const parsed = parseV4(cidr);
  return parsed?.prefix ?? 24;
}

/**
 * Persist a user's subnet pick BEFORE their first provision. Creates the
 * user_nets row (idx assigned, libvirt net NOT yet defined — ensureUserNet
 * does that lazily) or updates the pick on an existing row.
 *
 * Locked once any instance exists: the guest's address is baked into its
 * cloud-init seed, so a subnet change would strand every VM on an address
 * the bridge no longer serves. Deleting all instances unlocks it.
 *
 * `pick: null` clears the stored pick back to auto-assign on next provision.
 */
export function setUserNetPick(userId: string, pick: { v4?: string | null; v6?: string | null } | null): { v4: string | null; v6: string | null } {
  const count = instanceCount(userId);
  if (count > 0) {
    throw new Error(`subnet is locked — this account has ${count} instance${count === 1 ? '' : 's'}; delete them all to change it`);
  }
  const resolved = pick ? resolvePick(rawDb(), pick) : null;
  const raw = rawDb();
  const existing = raw.prepare(`select idx from user_nets where user_id=?`).get(userId) as { idx: number } | undefined;
  if (!resolved) return clearPick(raw, userId, existing);
  if (existing) return updatePick(raw, userId, resolved);
  return insertPick(raw, userId, resolved);
}

type Raw = ReturnType<typeof rawDb>;
type Resolved = { v4: string; v6: string };

function clearPick(raw: Raw, userId: string, existing: { idx: number } | undefined): { v4: null; v6: null } {
  // NULL v4_subnet means "derive the legacy 10.231.x block on read"; the row's
  // idx/name/subnet columns stay so the bridge identity survives.
  if (existing) raw.prepare(`update user_nets set v4_subnet=null, v6_subnet=null where user_id=?`).run(userId);
  return { v4: null, v6: null };
}

function updatePick(raw: Raw, userId: string, resolved: Resolved): { v4: string; v6: string } {
  try {
    raw.prepare(`update user_nets set v4_subnet=?, v6_subnet=?, subnet=?, gateway=? where user_id=?`)
      .run(resolved.v4, resolved.v6, resolved.v4, v4Gateway(resolved.v4), userId);
  } catch (error) {
    throwConstraint(error);
  }
  return { v4: resolved.v4, v6: resolved.v6 };
}

function insertPick(raw: Raw, userId: string, resolved: Resolved): { v4: string; v6: string } {
  // No row yet: claim the next idx. The libvirt network itself is NOT defined
  // here — ensureUserNet does that on first provision, so a pick costs nothing
  // until it is used.
  const maxRow = raw.prepare(`select coalesce(max(idx), 0) as m from user_nets`).get() as { m: number };
  const idx = maxRow.m + 1;
  if (idx > 250) throw new Error('user network pool exhausted');
  try {
    raw.prepare(
      `insert into user_nets (user_id, name, idx, subnet, gateway, v4_subnet, v6_subnet, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(userId, `machina-u${idx}`, idx, resolved.v4, v4Gateway(resolved.v4), resolved.v4, resolved.v6, Date.now());
  } catch (error) {
    throwConstraint(error);
  }
  return { v4: resolved.v4, v6: resolved.v6 };
}

function throwConstraint(error: unknown): never {
  const code = (error as { code?: string }).code ?? '';
  if (code.startsWith('SQLITE_CONSTRAINT')) throw new Error('that block is already claimed by another user');
  throw error;
}
