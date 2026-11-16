/**
 * Private-network card: shows the caller's tenant subnet pick and lets them
 * choose a new one — Tailscale-style, from RFC 6598 (v4) and the ULA /48 (v6).
 * Locked once the account has any instance, because guest addresses are baked
 * into cloud-init seeds at provision time.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataGate } from '@/app/ui/datagate';
import { Skeleton } from '@/app/ui/loaders';
import { useToast } from '@/app/ui/toast';

type Pick = { v4: string | null; v6: string | null; locked: boolean; count: number };
type Net = {
  pools: { v4: string; v6: string };
  pick: Pick;
  net: { name: string; subnet: string; gateway: string; ipRange: string; v6Subnet: string | null; v6Gateway: string | null } | null;
};

async function fetchNet(): Promise<Net> {
  const response = await fetch('/api/net', { cache: 'no-store' });
  if (!response.ok) throw new Error('could not load network settings');
  return response.json();
}

function NetFacts({ net }: { net: Net['net'] }) {
  if (!net) return <div className="muted" style={{ fontSize: 12 }}>no network yet — one is assigned on your first VM</div>;
  return (
    <div className="muted mono" style={{ fontSize: 11, lineHeight: 1.8 }}>
      bridge {net.name} · {net.subnet} · gw {net.gateway} · dhcp {net.ipRange}
      {net.v6Subnet ? <><br />v6 {net.v6Subnet} · gw {net.v6Gateway}</> : null}
    </div>
  );
}

function PickForm({ net, onSaved }: { net: Net; onSaved: () => void }) {
  const toast = useToast();
  const [v4, setV4] = useState('');
  const [v6, setV6] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = net.pick;

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    const response = await fetch('/api/net', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) { toast.ok('network pick saved'); setV4(''); setV6(''); onSaved(); }
    else toast.err(data.error ?? 'could not save pick');
  };

  if (pick.locked) {
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        locked — this account has {pick.count} instance{pick.count === 1 ? '' : 's'}; guest addresses are baked into their seeds.
        Delete every instance to change the subnet.
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="net-v4" style={{ fontSize: 11 }}>ipv4 /24 (RFC 6598)</label>
          <input
            id="net-v4" className="mono" placeholder="100.77.4.0/24" value={v4}
            onChange={(event) => setV4(event.target.value)} style={{ width: 180 }}
          />
        </div>
        <div>
          <label htmlFor="net-v6" style={{ fontSize: 11 }}>ipv6 /64 (ULA)</label>
          <input
            id="net-v6" className="mono" placeholder="fd7a:115c:a1e0:4::/64" value={v6}
            onChange={(event) => setV6(event.target.value)} style={{ width: 240 }}
          />
        </div>
        <button disabled={busy || (!v4.trim() && !v6.trim())} onClick={() => void save({ v4: v4.trim() || undefined, v6: v6.trim() || undefined })}>
          {busy ? 'saving…' : 'set subnet'}
        </button>
        {pick.v4 || pick.v6 ? (
          <button disabled={busy} onClick={() => void save({ reset: true })}>reset to auto</button>
        ) : null}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        pools: v4 {net.pools.v4} · v6 {net.pools.v6}. Leave a field empty to auto-assign.
        Your VMs reach each other on this subnet; nothing else can route to it.
      </div>
    </div>
  );
}

export function NetworkCard() {
  const [net, setNet] = useState<Net | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setNet(await fetchNet()); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'failed'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="card">
      <h3>private network</h3>
      <DataGate
        data={net} loading={net === null && !error} error={error} onRetry={() => void load()}
        skeleton={<><Skeleton h={12} w="50%" /><Skeleton h={12} w="70%" style={{ marginTop: 8 }} /></>}
      >
        {(loaded) => (
          <>
            <NetFacts net={loaded.net} />
            <div style={{ marginTop: 14 }}><PickForm net={loaded} onSaved={() => void load()} /></div>
          </>
        )}
      </DataGate>
    </div>
  );
}
