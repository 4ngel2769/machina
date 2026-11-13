/**
 * Ctrl/Cmd-K command palette — the single "do anything" surface.
 *
 * Everything the signed-in user can reach lives here: pages, their own
 * instances (open/start/stop/delete), and admin surfaces only when the role
 * allows. `?` opens the same palette with the shortcut list pinned; Esc or a
 * second `?` closes it. Actions POST to the same routes the UI uses, so the
 * server-side checks still apply — the palette never widens access.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Dest = { label: string; href: string; group: string; admin?: boolean; keywords?: string };
type Inst = { id: string; name: string; status: string };
type Hit = { label: string; hint: string; group: string; run: () => void };

const DESTS: Dest[] = [
  { label: 'home', href: '/home', group: 'pages', keywords: 'dashboard' },
  { label: 'instances', href: '/instances', group: 'pages' },
  { label: 'ssh keys', href: '/keys', group: 'pages' },
  { label: 'billing', href: '/billing', group: 'pages' },
  { label: 'specs', href: '/specs', group: 'pages' },
  { label: 'account', href: '/account', group: 'pages' },
  { label: 'notifications', href: '/notifications', group: 'pages' },
  { label: 'api tokens', href: '/tokens', group: 'pages' },
  { label: 'requests', href: '/instances', group: 'pages', keywords: 'pending approval' },
  { label: 'admin', href: '/admin', group: 'admin', admin: true },
  { label: 'host console', href: '/host', group: 'admin', admin: true },
  { label: 'iso library', href: '/host/isos', group: 'admin', admin: true },
  { label: 'containers', href: '/containers', group: 'admin', admin: true },
  { label: 'terms', href: '/terms', group: 'legal' },
  { label: 'privacy', href: '/privacy', group: 'legal' },
];

const SHORTCUTS: [string, string][] = [
  ['g h', 'home'], ['g i', 'instances'], ['g k', 'ssh keys'],
  ['g b', 'billing'], ['g s', 'specs'], ['g a', 'admin'],
  ['/', 'focus search'], ['[', 'toggle sidebar'], ['?', 'this palette'], ['esc', 'close'],
];

export const PALETTE_OPEN_EVENT = 'machina:palette';

export function openPalette(withShortcuts = false) {
  window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT, { detail: { shortcuts: withShortcuts } }));
}

/** The instance lifecycle actions the palette offers, per status. */
function instanceActions(inst: Inst): { label: string; action: string }[] {
  const actions: { label: string; action: string }[] = [{ label: `open ${inst.name}`, action: '__open' }];
  if (inst.status === 'running') actions.push({ label: `stop ${inst.name}`, action: 'stop' });
  if (inst.status === 'stopped') actions.push({ label: `start ${inst.name}`, action: 'start' });
  if (inst.status === 'error') actions.push({ label: `retry ${inst.name}`, action: 'retry' });
  actions.push({ label: `delete ${inst.name}`, action: 'delete' });
  return actions;
}

/** POST a lifecycle action and toast the outcome, like the card buttons do. */
function runInstanceAction(inst: Inst, action: string): void {
  if (action === 'delete' && !window.confirm(`delete ${inst.name}?`)) return;
  void fetch(`/api/instances/${inst.id}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (response.ok) toast.success(`${action}: ${body.status ?? 'ok'}`);
    else toast.error(body.error ?? `${action} failed`);
  });
}

function buildHits(
  q: string, showKeys: boolean, instances: Inst[], role: string,
  close: () => void, router: ReturnType<typeof useRouter>,
): Hit[] {
  const out: Hit[] = [];
  const needle = q.trim().toLowerCase();
  const push = (label: string, hint: string, group: string, run: () => void, keywords = '') => {
    if (needle && !`${label} ${hint} ${keywords}`.toLowerCase().includes(needle)) return;
    out.push({ label, hint, group, run });
  };

  for (const dest of DESTS) {
    if (dest.admin && role !== 'admin') continue;
    push(dest.label, dest.href, dest.group, () => { close(); router.push(dest.href); }, dest.keywords);
  }

  for (const inst of instances) {
    for (const action of instanceActions(inst)) {
      push(action.label, inst.status, 'instances', () => {
        close();
        if (action.action === '__open') router.push(`/instances/${inst.id}`);
        else runInstanceAction(inst, action.action);
      }, inst.id);
    }
  }

  if (showKeys) {
    for (const [keys, what] of SHORTCUTS) push(keys, what, 'shortcuts', close, 'keyboard shortcut help');
  }
  return out;
}

/** Group hits under section headers for scanning, pre-flattening each hit's
 *  index so keyboard selection never depends on render-time mutation. */
function groupHits(hits: Hit[]): { group: string; rows: { hit: Hit; index: number }[] }[] {
  const map = new Map<string, { hit: Hit; index: number }[]>();
  hits.forEach((hit, index) => {
    const list = map.get(hit.group) ?? [];
    list.push({ hit, index });
    map.set(hit.group, list);
  });
  return [...map.entries()].map(([group, rows]) => ({ group, rows }));
}

/** The rendered hit row; index is its flat position for keyboard nav. */
function HitRow({ hit, index, sel, onHover, onPick }: {
  hit: Hit; index: number; sel: number; onHover: () => void; onPick: () => void;
}) {
  return (
    <button
      onMouseEnter={onHover}
      onClick={onPick}
      data-sel={index === sel}
      style={{
        display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
        padding: '8px 16px', borderRadius: 0, border: 0,
        background: index === sel ? 'var(--surface-2)' : 'transparent',
        color: hit.label.startsWith('delete') ? 'var(--danger)' : 'inherit',
      }}
    >
      <span>{hit.label}</span>
      <span className="muted mono" style={{ fontSize: 11 }}>{hit.hint}</span>
    </button>
  );
}

/** The scrollable hit list with section headers. */
function HitList({ grouped, sel, onHover, onPick }: {
  grouped: { group: string; rows: { hit: Hit; index: number }[] }[]; sel: number;
  onHover: (index: number) => void; onPick: (hit: Hit) => void;
}) {
  return (
    <div style={{ overflowY: 'auto' }}>
      {grouped.length === 0 && <div className="muted" style={{ padding: '14px 16px' }}>nothing matches</div>}
      {grouped.map(({ group, rows }) => (
        <div key={group}>
          <div className="muted" style={{ padding: '8px 16px 2px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{group}</div>
          {rows.map(({ hit, index }) => (
            <HitRow key={`${hit.group}:${hit.label}`} hit={hit} index={index} sel={sel} onHover={() => onHover(index)} onPick={() => onPick(hit)} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Palette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [showKeys, setShowKeys] = useState(false);
  const [instances, setInstances] = useState<Inst[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => { setOpen(false); setQ(''); setSel(0); setShowKeys(false); }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      setShowKeys(Boolean((event as CustomEvent).detail?.shortcuts));
      setOpen(true);
    };
    window.addEventListener(PALETTE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(PALETTE_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
        return;
      }
      if (event.key === 'Escape' && open) { event.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Fetch the instance list once per open so actions act on live rows.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/instances', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Inst[]) => { if (alive) setInstances(rows); })
      .catch(() => { if (alive) setInstances([]); });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { setSel(0); }, [q, showKeys]);

  const hits = useMemo(
    () => buildHits(q, showKeys, instances, role, close, router),
    [q, showKeys, instances, role, close, router],
  );
  const grouped = useMemo(() => groupHits(hits), [hits]);

  if (!open) return null;

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSel((index) => Math.min(index + 1, hits.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSel((index) => Math.max(index - 1, 0)); }
    if (event.key === 'Enter') {
      event.preventDefault();
      hits[sel]?.run();
    }
  };

  return (
    <div
      onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 20px 20px' }}
    >
      <div className="card" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 520, width: '100%', padding: 0, overflow: 'hidden', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={onInputKey}
          placeholder={showKeys ? 'filter shortcuts…' : 'jump to, or act on…'}
          aria-label="command palette"
          style={{ width: '100%', border: 0, borderRadius: 0, padding: '14px 16px', fontSize: 15, background: 'transparent' }}
        />
        <div style={{ borderTop: '1px solid var(--line)' }} />
        <HitList grouped={grouped} sel={sel} onHover={setSel} onPick={(hit) => hit.run()} />
        <div className="muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>move · enter run · esc close</span>
          <span>ctrl/cmd-k · ? for shortcuts</span>
        </div>
      </div>
    </div>
  );
}
