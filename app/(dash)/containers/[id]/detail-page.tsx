/**
 * Container detail page body: name, state badges, lifecycle actions, tabs.
 * Admin gating happens in page.tsx; every API call re-checks anyway.
 */
'use client';

import Link from 'next/link';
import { ArrowLeftIcon } from '@/app/ui/icons';
import { Skeleton } from '@/app/ui/loaders';
import { TabBar, TabBody } from './detail/tabs';
import { containerIdFromPath, type ContainerDetail } from './detail/types';
import { useContainerDetail } from './detail/use';

/** Lifecycle buttons for the header row. Kill is confirm-gated because SIGKILL
 *  skips the container's shutdown hook. */
function ActionRow({ detail, busy, act }: {
  detail: ContainerDetail;
  busy: string;
  act: (action: string) => Promise<void>;
}) {
  const running = detail.state === 'running';
  const paused = detail.state === 'paused';
  return (
    <div className="row" style={{ marginTop: 14, gap: 8 }}>
      {running ? (
        <>
          <button disabled={!!busy} onClick={() => void act('restart')}>restart</button>
          <button className="danger" disabled={!!busy} onClick={() => void act('stop')}>stop</button>
        </>
      ) : (
        <button disabled={!!busy} onClick={() => void act('start')}>start</button>
      )}
      {paused
        ? <button disabled={!!busy} onClick={() => void act('unpause')}>unpause</button>
        : running && <button disabled={!!busy} onClick={() => void act('pause')}>pause</button>}
      {running && (
        <button className="danger" disabled={!!busy} onClick={() => {
          if (window.confirm(`kill ${detail.name}? SIGKILL — no shutdown hook runs.`)) void act('kill');
        }}>kill</button>
      )}
      {busy && <span className="muted" style={{ fontSize: 12 }}>{busy}…</span>}
    </div>
  );
}

function HealthBadge({ detail }: { detail: ContainerDetail }) {
  if (!detail.health || detail.health === 'none') return null;
  const tone = detail.health === 'healthy' ? 'running' : detail.health === 'starting' ? 'queued' : 'error';
  return <span className={`badge ${tone}`}>{detail.health}</span>;
}

export default function ContainerDetailPage() {
  const id = containerIdFromPath();
  const { detail, err, busy, act, tab, setTab, stats, statsErr } = useContainerDetail(id);

  if (!detail) {
    return err
      ? <h1>{err}</h1>
      : <div><Skeleton w="40%" h={26} style={{ marginBottom: 8 }} /><Skeleton w="60%" h={12} /><div className="card" style={{ marginTop: 14 }}><Skeleton h={220} /></div></div>;
  }

  const stateTone = detail.state === 'running' ? 'running' : detail.state === 'paused' ? 'suspended' : 'stopped';
  return (
    <>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Link href="/containers" aria-label="back to containers" style={{ display: 'inline-flex', color: 'var(--text-3)' }}>
          <ArrowLeftIcon size={16} />
        </Link>
        <h1 style={{ margin: 0 }}>{detail.name}</h1>
        <span className={`badge ${stateTone}`}>{detail.state}</span>
        <HealthBadge detail={detail} />
      </div>
      <div className="sub mono">
        {detail.id} · {detail.image}
      </div>

      <ActionRow detail={detail} busy={busy} act={act} />

      <TabBar tab={tab} setTab={setTab} />

      <div className="card" style={{ marginTop: 14 }}>
        <TabBody tab={tab} id={id} detail={detail} stats={stats} statsErr={statsErr} />
      </div>
    </>
  );
}
