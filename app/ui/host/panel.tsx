/** Admin console for the whole hypervisor, not just machina's own guests. */

'use client';

import { useMemo, useState } from 'react';
import { Skeleton } from '@/app/ui/loaders';
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
  if (owner !== 'visible') return vms.filter((vm) => vm.owner?.id === owner);
  return vms.filter((vm) => vm.system || !vm.owner || roles.get(vm.owner.id) === 'admin');
}

function Subtitle({ inv }: { inv: Inv }) {
  if (!inv.host.hostname) return <div className="sub">reading the hypervisor…</div>;
  const host = inv.host;
  return (
    <div className="sub">
      every libvirt domain and network on {host.hostname}
      {' · '}{host.cpus} cores · load {host.load[0].toFixed(2)} · {memSummary(host)}
    </div>
  );
}

/** Everything except the machines tab, which also needs the owner filter. */
function TabBody({ tab, inv, busy, post, netPost, log, onViewOwner }: {
  tab: Exclude<Tab, 'machines'>;
  inv: Inv;
  busy: string;
  post: ReturnType<typeof useHostActions>['post'];
  netPost: ReturnType<typeof useHostActions>['netPost'];
  log: LogPayload | null;
  onViewOwner: (id: string) => void;
}) {
  if (tab === 'networks') {
    return <Networks nets={inv.networks} instances={inv.instances} busy={busy} netPost={netPost} />;
  }
  if (tab === 'interfaces') return <Interfaces ifaces={inv.interfaces} busy={busy} post={post} />;
  if (tab === 'pools') return <Pools pools={inv.pools} busy={busy} post={post} />;
  if (tab === 'users') {
    return <UsersCard users={inv.users} instances={inv.instances} onView={onViewOwner} />;
  }
  return <LogCard log={log} />;
}

function panelError(pollError: string, inv: Inv): string {
  return pollError || inv.vmsError || inv.networksError || '';
}

function HostSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <Skeleton h={40} />
      <Skeleton h={200} />
      <Skeleton h={200} />
    </div>
  );
}

export function HostPanel() {
  const [tab, setTab] = useState<Tab>('machines');
  const [owner, setOwner] = useState<string>('visible');

  const inv = usePoll<Inv>(hostUrl(tab), tab === 'interfaces' ? 5000 : 15_000);
  const log = usePoll<LogPayload>('/api/host?log=1', 20_000, tab === 'log');
  const { busy, post, vmPost, netPost } = useHostActions(inv.reload);

  const invPayload = inv.payload ?? EMPTY_INV;
  const roles = useMemo(() => new Map(invPayload.users.map((user) => [user.id, user.role])), [invPayload.users]);
  const err = panelError(inv.error, invPayload);
  const viewOwner = (id: string) => { setOwner(id); setTab('machines'); };

  return (
    <>
      <h1>host</h1>
      <Subtitle inv={invPayload} />

      <div className="tabs">
        {TABS.map((tabKey) => (
          <button key={tabKey} className={tab === tabKey ? 'active' : ''} onClick={() => setTab(tabKey)}>{tabKey}</button>
        ))}
      </div>

      {err && <div className="notice err" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><span>{err}</span><button onClick={inv.reload} style={{ fontSize: 12 }}>retry</button></div>}

      {!inv.payload && <HostSkeleton />}

      {inv.payload && tab === 'machines' && (
        <Machines
          vms={filterVms(invPayload.vms, owner, roles)}
          users={invPayload.users} instances={invPayload.instances}
          owner={owner} setOwner={setOwner} busy={busy} vmPost={vmPost}
        />
      )}
      {inv.payload && tab !== 'machines' && (
        <TabBody
          tab={tab} inv={invPayload} busy={busy} post={post} netPost={netPost}
          log={log.payload} onViewOwner={viewOwner}
        />
      )}
    </>
  );
}
