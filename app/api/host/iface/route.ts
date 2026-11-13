/** Host interfaces: the live table plus creation/removal of NM connections. */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { logAudit } from '@/lib/services/audit';
import { addIface, deleteIface, listIfaces, type AddIface } from '@/lib/host/ifaces';
import { listNetworks, bridges } from '@/lib/host/networks';
import { friendlyError } from '@/lib/core/errors';
import { jsonBody } from '@/lib/api';
import { z } from 'zod';
const ifaceBodySchema = z.object({
  op: z.string().optional(), kind: z.string().optional(), name: z.string().optional(),
  ports: z.string().optional(), parent: z.string().optional(), vlanId: z.number().optional(),
  bondMode: z.string().optional(), address: z.string().optional(), listenPort: z.number().optional(),
  peerPublicKey: z.string().optional(), peerEndpoint: z.string().optional(),
  peerAllowedIps: z.string().optional(),
}).passthrough();

export async function GET() {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  try {
    const nets = await listNetworks().catch(() => []);
    return json({ interfaces: await listIfaces(bridges(nets)) });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

type Admin = { id: string; name: string };

/** Every optional NM field, normalised the way addIface expects it. */
function ifaceSpec(body: Record<string, unknown>): AddIface {
  const str = (key: string) => (body[key] ? String(body[key]) : undefined);
  const num = (key: string) => (body[key] ? Number(body[key]) : undefined);
  return {
    kind: String(body.kind ?? '') as AddIface['kind'],
    name: String(body.name ?? ''),
    ports: String(body.ports ?? '').split(',').map((port) => port.trim()).filter(Boolean),
    parent: str('parent'),
    vlanId: num('vlanId'),
    bondMode: str('bondMode'),
    address: str('address'),
    listenPort: num('listenPort'),
    peerPublicKey: str('peerPublicKey'),
    peerEndpoint: str('peerEndpoint'),
    peerAllowedIps: str('peerAllowedIps'),
  };
}

async function ifaceDelete(body: Record<string, unknown>, admin: Admin) {
  const name = String(body.name ?? '');
  await deleteIface(name);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.iface.delete', target: name, detail: null });
  return json({ ok: true, result: `${name} removed` });
}

async function ifaceAdd(body: Record<string, unknown>, admin: Admin) {
  const spec = ifaceSpec(body);
  if (!['bridge', 'vlan', 'bond', 'team', 'vpn'].includes(spec.kind)) return err('kind must be bridge, vlan, bond, team or vpn');
  const res = await addIface(spec);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.iface.add', target: res.name, detail: spec as unknown as Record<string, unknown> });
  return json({ ok: true, result: `${res.name} created${res.detail ? ` · ${res.detail}` : ''}` });
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;
  const body = await jsonBody(req, ifaceBodySchema);

  try {
    if (body.op === 'delete') return await ifaceDelete(body, admin);
    return await ifaceAdd(body, admin);
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}
