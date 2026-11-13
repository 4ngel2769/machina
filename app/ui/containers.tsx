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
import { FILTERS, groupByProject, match, needsAttention, type Filter, type Payload } from './containers/types';

/** Subtitle: docker unreachable, or the counts that answer "what is broken". */
function subline(data: Payload | null, all: number, running: number, broken: number): string {
  if (data && data.available === false) return 'docker is not reachable on this host';
  return `${all} containers · ${running} running · ${broken} needing attention`;
}

/** Filter + free-text match, all case-insensitive. */
function matches(c: Payload['containers'][number], filter: Filter, needle: string): boolean {
  if (!match(c, filter)) return false;
  if (!needle) return true;
  return c.name.toLowerCase().includes(needle)
    || c.image.toLowerCase().includes(needle)
    || (c.project ?? '').toLowerCase().includes(needle)
    || (c.service ?? '').toLowerCase().includes(needle);
}

/** Toolbar: filter chips, free-text filter, create toggle. */
function Toolbar({ filter, setFilter, q, setQ, createOpen, toggleCreate, broken }: {
  filter: Filter; setFilter: (f: Filter) => void;
  q: string; setQ: (v: string) => void;
  createOpen: boolean; toggleCreate: () => void; broken: number;
}) {
  const label = (f: Filter) => (f === 'unhealthy' && broken ? ` (${broken})` : '');
  return (
    <div className="tabs">
      {FILTERS.map((f) => (
        <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
          {f}{label(f)}
        </button>
      ))}
      <div className="spacer" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="filter by name, image, project…"
        style={{ maxWidth: 260 }}
        aria-label="filter containers"
      />
      <button onClick={toggleCreate}>{createOpen ? 'cancel' : 'create container'}</button>
    </div>
  );
}

/** Error banners and the loading/empty states under the toolbar. */
function ListBody({ list, allCount, shownCount, groups, actions }: {
  list: ReturnType<typeof usePoll<Payload>>;
  allCount: number; shownCount: number;
  groups: [string, Payload['containers']][];
  actions: ReturnType<typeof useContainerActions>;
}) {
  const empty = list.data && shownCount === 0;
  return (
    <>
      {list.error && <div className="notice err" style={{ marginTop: 12 }}>{list.error}</div>}
      {list.data?.error && <div className="notice err" style={{ marginTop: 12 }}>{list.data.error}</div>}
      {!list.data && <Empty text="reading docker…" />}
      {empty && (
        <Empty text={allCount === 0 ? 'no containers on this host' : 'nothing matches this filter'} />
      )}
      {groups.map(([project, cs]) => <ContainerGroup key={project} project={project} cs={cs} actions={actions} />)}
    </>
  );
}

export function ContainersPanel() {
  const list = usePoll<Payload>('/api/containers', 10_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const actions = useContainerActions(list.reload);

  const all = list.data?.containers ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((c) => matches(c, filter, needle));
  }, [all, filter, q]);

  const groups = useMemo(() => groupByProject(shown), [shown]);
  const running = all.filter((c) => c.state === 'running').length;
  const broken = all.filter(needsAttention).length;
  const toggleCreate = () => actions.setCreateOpen(!actions.createOpen);

  return (
    <>
      <h1>containers</h1>
      <div className="sub">{subline(list.data ?? null, all.length, running, broken)}</div>

      <Toolbar
        filter={filter} setFilter={setFilter} q={q} setQ={setQ}
        createOpen={actions.createOpen} toggleCreate={toggleCreate} broken={broken}
      />

      {actions.createOpen && <CreateForm form={actions.form} setForm={actions.setForm} busy={actions.busy} create={actions.create} />}

      <ListBody list={list} allCount={all.length} shownCount={shown.length} groups={groups} actions={actions} />
    </>
  );
}
