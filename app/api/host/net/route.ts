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
  const [, e] = await requireAdmin();
  if (e) return e;
  try {
    return json({ networks: await listNetworks() });
  } catch (x) {
    return err(friendlyError(x), 400);
  }
}

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const [admin, e] = await requireAdmin();
  if (e) return e;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op ?? '');
  const audit = async (action: string, target: string, detail?: unknown) =>
    logAudit({ actorId: admin.id, actorName: admin.name, action: `host.net.${action}`, target, detail: (detail ?? null) as Record<string, unknown> | null });

  try {
    switch (op) {
      case 'create': {
        const name = String(body.name ?? '');
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
      case 'update': {
        const name = String(body.name ?? '');
        await updateNetwork(name, {
          ipv4: body.ipv4 ? ipFrom(body.ipv4 as Record<string, unknown>, 'ipv4') : undefined,
          ipv6: body.ipv6 ? ipFrom(body.ipv6 as Record<string, unknown>, 'ipv6') : undefined,
          domain: body.domain === undefined ? undefined : String(body.domain || ''),
          autostart: body.autostart === undefined ? undefined : Boolean(body.autostart),
        });
        await audit('update', name, body);
        return json({ ok: true, result: 'saved — restart the network for address changes to apply' });
      }
      case 'start':
      case 'stop': {
        const name = String(body.name ?? '');
        await startStop(name, op === 'start');
        await audit(op, name);
        return json({ ok: true, result: op === 'start' ? 'network started' : 'network stopped' });
      }
      case 'autostart': {
        const name = String(body.name ?? '');
        await setAutostart(name, Boolean(body.on));
        await audit('autostart', name, { on: Boolean(body.on) });
        return json({ ok: true });
      }
      case 'delete': {
        const name = String(body.name ?? '');
        await deleteNetwork(name);
        await audit('delete', name);
        return json({ ok: true, result: 'network removed' });
      }
      case 'dhcpHost': {
        const name = String(body.name ?? '');
        const host = { mac: String(body.mac ?? ''), ip: String(body.ip ?? ''), name: body.hostname ? String(body.hostname) : undefined };
        await setDhcpHost(name, host, body.action === 'remove' ? 'remove' : 'add');
        await audit('dhcpHost', name, host);
        return json({ ok: true, result: body.action === 'remove' ? 'reservation removed' : 'reservation added' });
      }
      default:
        return err('unknown operation');
    }
  } catch (x) {
    return err(friendlyError(x), 400);
  }
}
