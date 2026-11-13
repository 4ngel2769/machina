/**
 * Docker tab for the admin console.
 *
 * Grouped by compose project rather than a flat list, because a host with 60
 * containers is not 60 things to know about: it is 12 stacks, one of which is
 * unhealthy. Health, restart count and live usage answer the only question the
 * page exists for — what is broken right now.
 */

'use client';

import { useMemo, useState } from 'react';
import { Empty } from '@/app/ui/loaders';
import { usePoll } from '@/app/ui/host/shared';
import { useContainerActions } from './containers/actions';
import { CreateForm } from './containers/form';
import { ContainerGroup } from './containers/group';
import { ImagesSection } from './containers/images';
import { FILTERS, groupByProject, match, needsAttention, type Filter, type Payload } from './containers/types';

/** Subtitle: docker unreachable, or the counts that answer "what is broken". */
function subline(payload: Payload | null, all: number, running: number, broken: number): string {
  if (payload && payload.available === false) return 'docker is not reachable on this host';
  return `${all} containers · ${running} running · ${broken} needing attention`;
}

/** Filter + free-text match, all case-insensitive. */
function matches(container: Payload['containers'][number], filter: Filter, needle: string): boolean {
  if (!match(container, filter)) return false;
  if (!needle) return true;
  return container.name.toLowerCase().includes(needle)
    || container.image.toLowerCase().includes(needle)
    || (container.project ?? '').toLowerCase().includes(needle)
    || (container.service ?? '').toLowerCase().includes(needle);
}

/** Toolbar: filter chips, free-text filter, create + images toggles. */
function Toolbar({ filter, setFilter, q, setQ, createOpen, toggleCreate, broken, showImages, setShowImages }: {
  filter: Filter; setFilter: (value: Filter) => void;
  q: string; setQ: (value: string) => void;
  createOpen: boolean; toggleCreate: () => void; broken: number;
  showImages: boolean; setShowImages: (value: boolean) => void;
}) {
  const label = (value: Filter) => (value === 'unhealthy' && broken ? ` (${broken})` : '');
  return (
    <div className="tabs">
      {FILTERS.map((filterKey) => (
        <button key={filterKey} className={filter === filterKey ? 'active' : ''} onClick={() => setFilter(filterKey)}>
          {filterKey}{label(filterKey)}
        </button>
      ))}
      <div className="spacer" />
      <input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="filter by name, image, project…"
        style={{ maxWidth: 260 }}
        aria-label="filter containers"
      />
      <button onClick={toggleCreate}>{createOpen ? 'cancel' : 'create container'}</button>
      <button onClick={() => setShowImages(!showImages)}>{showImages ? 'hide images' : 'images'}</button>
    </div>
  );
}

/** Error banners and the loading/empty states under the toolbar. */
function ListBody({ list, allCount, shownCount, groups, actions, showImages }: {
  list: ReturnType<typeof usePoll<Payload>>;
  allCount: number; shownCount: number;
  groups: [string, Payload['containers']][];
  actions: ReturnType<typeof useContainerActions>;
  showImages: boolean;
}) {
  const empty = list.payload && shownCount === 0;
  return (
    <>
      {list.error && <div className="notice err" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><span>{list.error}</span><button onClick={list.reload} style={{ fontSize: 12 }}>retry</button></div>}
      {list.payload?.error && <div className="notice err" style={{ marginTop: 12 }}>{list.payload.error}</div>}
      {!list.payload && <Empty icon="activity" text="reading docker…" />}
      {empty && (
        <Empty icon={allCount === 0 ? 'package' : 'search'} text={allCount === 0 ? 'no containers on this host' : 'nothing matches this filter'} />
      )}
      {groups.map(([project, containers]) => <ContainerGroup key={project} project={project} containers={containers} actions={actions} />)}
      {showImages && <ImagesSection />}
    </>
  );
}

export function ContainersPanel() {
  const list = usePoll<Payload>('/api/containers', 10_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [showImages, setShowImages] = useState(false);
  const actions = useContainerActions(list.reload);

  const all = list.payload?.containers ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((container) => matches(container, filter, needle));
  }, [all, filter, q]);

  const groups = useMemo(() => groupByProject(shown), [shown]);
  const running = all.filter((container) => container.state === 'running').length;
  const broken = all.filter(needsAttention).length;
  const toggleCreate = () => actions.setCreateOpen(!actions.createOpen);

  return (
    <>
      <h1>containers</h1>
      <div className="sub">{subline(list.payload ?? null, all.length, running, broken)}</div>

      <Toolbar
        filter={filter} setFilter={setFilter} q={q} setQ={setQ}
        createOpen={actions.createOpen} toggleCreate={toggleCreate} broken={broken}
        showImages={showImages} setShowImages={setShowImages}
      />

      {actions.createOpen && <CreateForm form={actions.form} setForm={actions.setForm} busy={actions.busy} create={actions.create} />}

      <ListBody list={list} allCount={all.length} shownCount={shown.length} groups={groups} actions={actions} showImages={showImages} />
    </>
  );
}
