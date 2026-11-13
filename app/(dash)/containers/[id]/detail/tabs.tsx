/** Tab strip and tab bodies for the container detail page. */
'use client';

import { LogsPanel } from './logs';
import { ContainerConsole } from './console';
import { StatsPanel } from './stats';
import { InspectPanel } from './inspect';
import { TAB_LABEL, TABS, type ContainerDetail, type ContainerStats, type Tab } from './types';

export function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="tabs">
      {TABS.map((tabKey) => (
        <button key={tabKey} onClick={() => setTab(tabKey)} className={tab === tabKey ? 'active' : ''}>
          {TAB_LABEL[tabKey]}
        </button>
      ))}
    </div>
  );
}

export function TabBody({
  tab, id, detail, stats, statsErr,
}: {
  tab: Tab; id: string; detail: ContainerDetail;
  stats: ContainerStats | null; statsErr: string;
}) {
  const running = detail.state === 'running';
  switch (tab) {
    case 'logs':
      return <LogsPanel id={id} running={running} />;
    case 'console':
      return running
        ? <ContainerConsole id={id} />
        : <div className="muted">console needs a running container — start it first</div>;
    case 'stats':
      return <StatsPanel stats={stats} err={statsErr} />;
    default:
      return <InspectPanel detail={detail} />;
  }
}
