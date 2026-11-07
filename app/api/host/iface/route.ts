import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { logAudit } from '@/lib/services/audit';
import { addIface, deleteIface, listIfaces, type AddIface } from '@/lib/host/ifaces';
import { listNetworks, bridges } from '@/lib/host/networks';
import { friendlyError } from '@/lib/core/errors';

/** Host interfaces: the live table plus creation/removal of NM connections. */

export async function GET() {
  const [, e] = await requireAdmin();
  if (e) return e;
  try {
    const nets = await listNetworks().catch(() => []);
    return json({ interfaces: await listIfaces(bridges(nets)) });
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

  try {
    if (body.op === 'delete') {
      const name = String(body.name ?? '');
      await deleteIface(name);
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.iface.delete', target: name, detail: null });
      return json({ ok: true, result: `${name} removed` });
    }
    const spec: AddIface = {
      kind: String(body.kind ?? '') as AddIface['kind'],
      name: String(body.name ?? ''),
      ports: String(body.ports ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      parent: body.parent ? String(body.parent) : undefined,
      vlanId: body.vlanId ? Number(body.vlanId) : undefined,
      bondMode: body.bondMode ? String(body.bondMode) : undefined,
      address: body.address ? String(body.address) : undefined,
      listenPort: body.listenPort ? Number(body.listenPort) : undefined,
      peerPublicKey: body.peerPublicKey ? String(body.peerPublicKey) : undefined,
      peerEndpoint: body.peerEndpoint ? String(body.peerEndpoint) : undefined,
      peerAllowedIps: body.peerAllowedIps ? String(body.peerAllowedIps) : undefined,
    };
    if (!['bridge', 'vlan', 'bond', 'team', 'vpn'].includes(spec.kind)) return err('kind must be bridge, vlan, bond, team or vpn');
    const res = await addIface(spec);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.iface.add', target: res.name, detail: spec as unknown as Record<string, unknown> });
    return json({ ok: true, result: `${res.name} created${res.detail ? ` · ${res.detail}` : ''}` });
  } catch (x) {
    return err(friendlyError(x), 400);
  }
}
