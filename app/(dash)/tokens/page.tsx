/**
 * API tokens page: mint a named token with an explicit scope set (Immich-style
 * granularity), see last-used/expiry, revoke. The secret is shown exactly
 * once in a copy box after minting.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { Empty, Skeleton } from '@/app/ui/loaders';

type Token = {
  id: string; name: string; prefix: string; scopes: string;
  last_used_at: number | null; expires_at: number | null;
  revoked_at: number | null; created_at: number;
};
type ScopeList = { ok: boolean; scopes: string[]; tokens: Token[] };

const SCOPE_LABEL: Record<string, string> = {
  'instances:read': 'view instances',
  'instances:write': 'start/stop/delete instances',
  'requests:read': 'view requests',
  'requests:write': 'create/cancel requests',
  'keys:read': 'view ssh keys',
  'keys:write': 'manage ssh keys',
  'quota:read': 'view quota',
  'billing:read': 'view billing',
  'account:read': 'view account',
  'notifications:read': 'view notifications',
  'notifications:write': 'manage notifications',
  'admin:*': 'admin (all surfaces)',
};

function fmt(ts: number | null): string {
  return ts ? new Date(ts).toLocaleDateString() : '—';
}

function isDead(token: Token, now: number): boolean {
  return token.revoked_at !== null || (token.expires_at !== null && token.expires_at <= now);
}

/** The one-time secret reveal card. */
function MintedCard({ secret, onDone }: { secret: string; onDone: () => void }) {
  const toast = useToast();
  return (
    <div className="card" style={{ marginBottom: 18, borderColor: 'var(--accent)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>token created — copy it now</div>
      <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 12, background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 6 }}>{secret}</code>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="primary" onClick={() => { void navigator.clipboard.writeText(secret); toast.ok('copied'); }}>copy</button>
        <button onClick={onDone}>done</button>
      </div>
    </div>
  );
}

/** The mint form: name, scope checkboxes, optional expiry. */
function MintForm({ scopes, busy, onMint }: {
  scopes: string[]; busy: boolean;
  onMint: (name: string, picked: string[], days: string) => void;
}) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [days, setDays] = useState('');

  const toggle = (scope: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope); else next.add(scope);
      return next;
    });
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>new token</div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label htmlFor="tok-name">name</label>
          <input id="tok-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. backup script" maxLength={64} />
        </div>
        <div>
          <label>permissions</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px 14px' }}>
            {scopes.map((scope) => (
              <label key={scope} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.has(scope)} onChange={() => toggle(scope)} />
                {SCOPE_LABEL[scope] ?? scope}
                <span className="muted" style={{ fontSize: 11 }}>({scope})</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 200 }}>
          <label htmlFor="tok-days">expires in days (blank = never)</label>
          <input id="tok-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="—" />
        </div>
        <div>
          <button className="primary" disabled={busy || !picked.size} onClick={() => onMint(name, [...picked], days)}>
            {busy ? 'minting…' : 'create token'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenRow({ token, onRevoke }: { token: Token; onRevoke: (id: string) => void }) {
  // Captured once per mount; expiry is day-granularity so staleness is harmless.
  const [now] = useState(() => Date.now());
  const dead = isDead(token, now);
  let scopeList: string[] = [];
  try { scopeList = JSON.parse(token.scopes) as string[]; } catch { scopeList = []; }
  return (
    <div className="card" style={{ padding: '12px 16px', margin: 0, opacity: dead ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{token.name} <code className="muted" style={{ fontSize: 11 }}>{token.prefix}…</code></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{scopeList.join(', ')}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
            created {fmt(token.created_at)} · last used {fmt(token.last_used_at)} · expires {fmt(token.expires_at)}
            {token.revoked_at ? ' · revoked' : ''}
          </div>
        </div>
        {!dead && <button className="danger" onClick={() => onRevoke(token.id)}>revoke</button>}
      </div>
    </div>
  );
}

export default function TokensPage() {
  const toast = useToast();
  const [data, setData] = useState<ScopeList | null>(null);
  const [minted, setMinted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/tokens', { cache: 'no-store' });
    if (response.ok) setData(await response.json());
    else toast.err('could not load tokens');
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const mint = async (name: string, picked: string[], days: string) => {
    setBusy(true);
    const response = await fetch('/api/tokens', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim() || 'token',
        scopes: picked,
        expiresInDays: days ? Number(days) : undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok && body.token?.secret) {
      setMinted(body.token.secret);
      void load();
    } else toast.err(body.error ?? 'mint failed');
  };

  const revoke = async (id: string) => {
    if (!confirm('revoke this token? Anything using it stops working immediately.')) return;
    const response = await fetch('/api/tokens', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
    });
    if (response.ok) { toast.ok('token revoked'); void load(); }
    else toast.err('revoke failed');
  };

  const scopes = data?.scopes ?? [];
  const tokens = data?.tokens ?? [];

  return (
    <>
      <h1>api tokens</h1>
      <div className="sub">programmatic access to the machina api · the secret is shown once, only its hash is stored</div>

      {minted && <MintedCard secret={minted} onDone={() => setMinted(null)} />}
      <MintForm scopes={scopes} busy={busy} onMint={(n, p, d) => void mint(n, p, d)} />

      {!data && <Skeleton h={120} />}
      {data && tokens.length === 0 && <Empty icon="key" text="no tokens yet" />}
      {tokens.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tokens.map((token) => <TokenRow key={token.id} token={token} onRevoke={(id) => void revoke(id)} />)}
        </div>
      )}
    </>
  );
}
