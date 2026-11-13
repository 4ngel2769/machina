/**
 * Per-user instance groups, persisted in localStorage.
 *
 * Groups are a view-layer convenience — they never touch the server, so a
 * cleared browser just loses the labels, not the VMs. Storage is namespaced
 * per signed-in user so two accounts on one browser do not share groups.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const KEY_PREFIX = 'machina.groups.';

type Groups = Record<string, string>; // instanceId -> group name

function storageKey(user: string): string {
  return `${KEY_PREFIX}${user}`;
}

function read(user: string): Groups {
  try {
    const raw = window.localStorage.getItem(storageKey(user));
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export function useGroups(user: string) {
  const [groups, setGroups] = useState<Groups>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    setGroups(read(user));
    setReady(true);
  }, [user]);

  const write = useCallback((next: Groups) => {
    setGroups(next);
    try { window.localStorage.setItem(storageKey(user), JSON.stringify(next)); } catch { /* quota/privacy mode */ }
  }, [user]);

  const assign = useCallback((instanceId: string, group: string | null) => {
    setGroups((prev) => {
      const next = { ...prev };
      if (group) next[instanceId] = group; else delete next[instanceId];
      try { window.localStorage.setItem(storageKey(user), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [user]);

  const groupNames = useMemo(() => [...new Set(Object.values(groups))].sort(), [groups]);

  /** Rename a group: only the instances currently carrying the old name move. */
  const renameGroup = useCallback((from: string, to: string) => {
    const target = to.trim();
    if (!target || target === from) return;
    setGroups((prev) => {
      const next = { ...prev };
      for (const [id, name] of Object.entries(next)) if (name === from) next[id] = target;
      try { window.localStorage.setItem(storageKey(user), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [user]);

  /** Drop a group: its members become ungrouped. */
  const deleteGroup = useCallback((name: string) => {
    setGroups((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([, group]) => group !== name));
      try { window.localStorage.setItem(storageKey(user), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [user]);

  return useMemo(() => ({ groups, ready, assign, groupNames, renameGroup, deleteGroup }),
    [groups, ready, assign, groupNames, renameGroup, deleteGroup]);
}
