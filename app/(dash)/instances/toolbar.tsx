/**
 * Filter toolbar for the instances grid: search, status chips, group picker
 * and bulk actions on the checked selection.
 */
'use client';

import { useState } from 'react';
import type { Inst } from './types';

export type StatusFilter = 'all' | 'running' | 'stopped' | 'error' | 'provisioning';

const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'running', label: 'running' },
  { key: 'stopped', label: 'stopped' },
  { key: 'error', label: 'error' },
  { key: 'provisioning', label: 'provisioning' },
];

export function Toolbar({
  insts, query, setQuery, status, setStatus,
  groupFilter, setGroupFilter, groupNames, onNewGroup, onRenameGroup,
  selected, setSelected, busy, isAdmin, onBulk,
}: {
  insts: Inst[];
  query: string; setQuery: (v: string) => void;
  status: StatusFilter; setStatus: (v: StatusFilter) => void;
  groupFilter: string; setGroupFilter: (v: string) => void;
  groupNames: string[];
  onNewGroup: () => void; onRenameGroup: () => void;
  selected: Set<string>; setSelected: (ids: Set<string>) => void;
  busy: boolean; isAdmin: boolean;
  onBulk: (action: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const allVisible = insts.map((i) => i.id);
  const allChecked = allVisible.length > 0 && allVisible.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(allVisible));
  };

  const bulkDelete = () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    onBulk('delete');
  };

  return (
    <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="search name, ip, id…" aria-label="search instances"
          style={{ flex: '1 1 220px', maxWidth: 340 }}
        />
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="filter by group" style={{ maxWidth: 180 }}>
          <option value="">all groups</option>
          <option value="__none__">ungrouped</option>
          {groupNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button onClick={onNewGroup} title="new group">+ group</button>
        {groupFilter && groupFilter !== '__none__' && (
          <button onClick={onRenameGroup} title="rename group">rename</button>
        )}
        <div className="spacer" />
        {selected.size > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>{selected.size} selected</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUSES.map((s) => (
          <button key={s.key} className={`chip${status === s.key ? ' on' : ''}`} onClick={() => setStatus(s.key)}>{s.label}</button>
        ))}
        <div className="spacer" />
        {insts.length > 0 && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="select all visible" />
            select all
          </label>
        )}
        {selected.size > 0 && (
          <>
            <button disabled={busy} onClick={() => onBulk('start')}>start</button>
            <button disabled={busy} onClick={() => onBulk('stop')}>stop</button>
            {isAdmin && (
              <button disabled={busy} onClick={bulkDelete} style={{ color: 'var(--danger)' }}>
                {confirming ? 'confirm delete?' : 'delete'}
              </button>
            )}
            <button onClick={() => setSelected(new Set())}>clear</button>
          </>
        )}
      </div>
    </div>
  );
}
