/** Admin console for the whole hypervisor, not just machina's own guests. */

'use client';

import { useMemo, useState } from 'react';
import { usePoll } from './shared';
import { useHostActions } from './panel/actions';
import { EMPTY_INV, TABS, type Inv, type LogPayload, type Tab, type Vm } from './panel/types';
import { Machines, memSummary } from './panel/machines';
import { Networks } from './panel/networks';
import { Interfaces } from './panel/interfaces';
import { Pools } from './panel/pools';
import { LogCard, UsersCard } from './panel/accounts';

/** The poll endpoint differs per tab: two of them take extra inventory. */
function hostUrl(tab: Tab): string {
  if (tab === 'interfaces') return '/api/host?ifaces=1';
  if (tab === 'pools') return '/api/host?pools=1';
  return '/api/host';
}

/** Owner filter over the domain list: system + admin-owned by default. */
function filterVms(vms: Vm[], owner: string, roles: Map<string, string>): Vm[] {
  if (owner === 'all') return vms;
  if (owner !== 'visible') return vms.filter((v) => v.owner?.id === owner);
  return vms.filter((v) => v.system || !v.owner || roles.get(v.owner.id) === 'admin');
}

function Subtitle({ data }: { data: Inv }) {
  if (!data.host.hostname) return <div className="sub">reading the hypervisor…</div>;
  const host = data.host;
  return (
    <div className="sub">
      every libvirt domain and network on {host.hostname}
      {' · '}{host.cpus} cores · load {host.load[0].toFixed(2)} · {memSummary(host)}
    </div>
  );
}

/** Everything except the machines tab, which also needs the owner filter. */
function TabBody({ tab, data, busy, post, netPost, log, onViewOwner }: {
  tab: Exclude<Tab, 'machines'>;
  data: Inv;
  busy: string;
  post: ReturnType<typeof useHostActions>['post'];
  netPost: ReturnType<typeof useHostActions>['netPost'];
  log: LogPayload | null;
  onViewOwner: (id: string) => void;
}) {
  if (tab === 'networks') {
    return <Networks nets={data.networks} instances={data.instances} busy={busy} netPost={netPost} />;
  }
  if (tab === 'interfaces') return <Interfaces ifaces={data.interfaces} busy={busy} post={post} />;
  if (tab === 'pools') return <Pools pools={data.pools} busy={busy} post={post} />;
  if (tab === 'users') {
    return <UsersCard users={data.users} instances={data.instances} onView={onViewOwner} />;
  }
  return <LogCard log={log} />;
}

export function HostPanel() {
  const [tab, setTab] = useState<Tab>('machines');
  const [owner, setOwner] = useState<string>('visible');

  const inv = usePoll<Inv>(hostUrl(tab), tab === 'interfaces' ? 5000 : 15_000);
  const log = usePoll<LogPayload>('/api/host?log=1', 20_000, tab === 'log');
  const { busy, post, vmPost, netPost } = useHostActions(inv.reload);

  const data = inv.data ?? EMPTY_INV;
  const roles = useMemo(() => new Map(data.users.map((u) => [u.id, u.role])), [data.users]);
  const err = inv.error || data.vmsError || data.networksError;
  const viewOwner = (id: string) => { setOwner(id); setTab('machines'); };

  return (
    <>
      <h1>host</h1>
      <Subtitle data={data} />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {err && <div className="notice err" style={{ marginTop: 12 }}>{err}</div>}

      {tab === 'machines' && (
        <Machines
          vms={filterVms(data.vms, owner, roles)}
          users={data.users} instances={data.instances}
          owner={owner} setOwner={setOwner} busy={busy} vmPost={vmPost}
        />
      )}
      {tab !== 'machines' && (
        <TabBody
          tab={tab} data={data} busy={busy} post={post} netPost={netPost}
          log={log.data} onViewOwner={viewOwner}
        />
      )}
    </>
  );
}
