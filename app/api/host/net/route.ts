/**
 * Host console network API: virtual networks, DHCP reservations and edits.
 */
import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { logAudit } from '@/lib/services/audit';
import {
  createNetwork, updateNetwork, deleteNetwork, startStop, setAutostart, setDhcpHost,
  listNetworks, type NetIp,
} from '@/lib/host/networks';
import { friendlyError } from '@/lib/core/errors';

const prefixOk = (n: unknown, fam: 'ipv4' | 'ipv6'): number => {
  const v = Number(n);
  const max = fam === 'ipv6' ? 128 : 32;
  if (!Number.isInteger(v) || v < 1 || v > max) throw new Error(`prefix must be 1-${max}`);
  return v;
};

function ipFrom(body: Record<string, unknown>, fam: 'ipv4' | 'ipv6'): NetIp | null {
  const address = String(body.address ?? '').trim();
  if (!address) return null;
  const family = fam === 'ipv6' || address.includes(':') ? 'ipv6' : 'ipv4';
  return {
    family,
    address,
    prefix: prefixOk(body.prefix ?? (family === 'ipv6' ? 64 : 24), family),
    dhcp: body.dhcpStart && body.dhcpEnd
      ? { start: String(body.dhcpStart), end: String(body.dhcpEnd) }
      : null,
    hosts: [],
  };
}

export async function GET() {
  const { response: e } = await requireAdmin();
  if (e) return e;
  try {
    return json({ networks: await listNetworks() });
  } catch (x) {
    return err(friendlyError(x), 400);
  }
}

type Admin = { id: string; name: string };
type Audit = (action: string, target: string, detail?: unknown) => Promise<unknown>;
type Body = Record<string, unknown>;

const netName = (body: Body) => String(body.name ?? '');

async function opCreate(body: Body, audit: Audit) {
  const name = netName(body);
  const forward = String(body.forward ?? 'nat') as 'nat' | 'route' | 'bridge' | 'isolated' | 'open';
  const net = await createNetwork({
    name,
    forward,
    bridge: body.bridge ? String(body.bridge) : null,
    domain: body.domain ? String(body.domain) : null,
    ipv4: ipFrom((body.ipv4 ?? {}) as Record<string, unknown>, 'ipv4'),
    ipv6: ipFrom((body.ipv6 ?? {}) as Record<string, unknown>, 'ipv6'),
  });
  await audit('create', name, { forward, ipv4: net.ips.find((i) => i.family === 'ipv4') ?? null, ipv6: net.ips.find((i) => i.family === 'ipv6') ?? null });
  return json({ ok: true, network: net });
}

async function opUpdate(body: Body, audit: Audit) {
  const name = netName(body);
  await updateNetwork(name, {
    ipv4: body.ipv4 ? ipFrom(body.ipv4 as Record<string, unknown>, 'ipv4') : undefined,
    ipv6: body.ipv6 ? ipFrom(body.ipv6 as Record<string, unknown>, 'ipv6') : undefined,
    domain: body.domain === undefined ? undefined : String(body.domain || ''),
    autostart: body.autostart === undefined ? undefined : Boolean(body.autostart),
  });
  await audit('update', name, body);
  return json({ ok: true, result: 'saved — restart the network for address changes to apply' });
}

async function opStartStop(op: 'start' | 'stop', body: Body, audit: Audit) {
  const name = netName(body);
  await startStop(name, op === 'start');
  await audit(op, name);
  return json({ ok: true, result: op === 'start' ? 'network started' : 'network stopped' });
}

async function opAutostart(body: Body, audit: Audit) {
  const name = netName(body);
  const on = Boolean(body.on);
  await setAutostart(name, on);
  await audit('autostart', name, { on });
  return json({ ok: true });
}

async function opDelete(body: Body, audit: Audit) {
  const name = netName(body);
  await deleteNetwork(name);
  await audit('delete', name);
  return json({ ok: true, result: 'network removed' });
}

async function opDhcpHost(body: Body, audit: Audit) {
  const name = netName(body);
  const host = { mac: String(body.mac ?? ''), ip: String(body.ip ?? ''), name: body.hostname ? String(body.hostname) : undefined };
  const removing = body.action === 'remove';
  await setDhcpHost(name, host, removing ? 'remove' : 'add');
  await audit('dhcpHost', name, host);
  return json({ ok: true, result: removing ? 'reservation removed' : 'reservation added' });
}

const OPS: Record<string, (body: Body, audit: Audit) => Promise<ReturnType<typeof json>>> = {
  create: opCreate,
  update: opUpdate,
  start: (body, audit) => opStartStop('start', body, audit),
  stop: (body, audit) => opStartStop('stop', body, audit),
  autostart: opAutostart,
  delete: opDelete,
  dhcpHost: opDhcpHost,
};

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const { user: admin, response: e } = await requireAdmin();
  if (e) return e;
  const body = (await req.json().catch(() => ({}))) as Body;
  const op = String(body.op ?? '');
  const audit: Audit = async (action, target, detail) =>
    logAudit({ actorId: admin.id, actorName: admin.name, action: `host.net.${action}`, target, detail: (detail ?? null) as Record<string, unknown> | null });

  try {
    const handler = OPS[op];
    if (!handler) return err('unknown operation');
    return await handler(body, audit);
  } catch (x) {
    return err(friendlyError(x), 400);
  }
}
