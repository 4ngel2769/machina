'use client';

import { useCallback, useEffect, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { useToast } from '@/app/ui/toast';
import { copyText } from '@/app/ui/clipboard';
import { relTime } from '@/app/ui/time';

type Key = { id: string; label: string; pubKey: string; createdAt: number };

function keyAlgo(pk: string): string | null {
  const t = pk.trim().split(/\s+/)[0];
  if (!t || !pk.includes(' ')) return null;
  if (/^ssh-(ed25519|rsa)$/.test(t)) return t.slice(4);
  if (/^sk-ssh/.test(t)) return 'fido2';
  if (/^ecdsa-sha2-\S+$/.test(t)) return 'ecdsa';
  return null;
}

export default function KeysPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<Key[]>([]);
  const [label, setLabel] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/keys', { cache: 'no-store' });
    if (r.ok) setKeys(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch('/api/keys', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label, pubKey }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { toast.ok('key added'); setLabel(''); setPubKey(''); void load(); }
    else toast.err(j.error ?? 'failed');
    setBusy(false);
  }

  async function del(id: string) {
    const r = await fetch('/api/keys', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (r.ok) toast.ok('key removed');
    else toast.err('remove failed');
    void load();
  }

  return (
    <>
      <h1>ssh keys</h1>
      <div className="sub">injected via cloud-init into new instances (not retroactive)</div>

      <div className="card">
        <h3>add key</h3>
        <form onSubmit={add}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="l">label</label>
              <input id="l" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="laptop" />
            </div>
            <div style={{ flex: 3, minWidth: 260 }}>
              <label htmlFor="k">public key</label>
              <input id="k" value={pubKey} onChange={(e) => setPubKey(e.target.value)} placeholder="ssh-ed25519 AAAA… me@host" className="mono"
                style={pubKey && !keyAlgo(pubKey) ? { borderColor: 'var(--warn)' } : undefined} />
              {pubKey && !keyAlgo(pubKey)
                ? <div className="muted" style={{ marginTop: 4, color: 'var(--warn)' }}>doesn't look like an OpenSSH public key line</div>
                : null}
            </div>
            <button className="primary" type="submit" disabled={busy || !pubKey}>
              {busy ? (
                <span className="busybtn">
                  <ThinkingOrb state="composing" size={20} theme="dark" aria-label="adding" />
                  adding…
                </span>
              ) : 'add'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>keys</h3>
        <table>
          <thead><tr><th>label</th><th>algo</th><th>key</th><th>added</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.label}</td>
                <td>{keyAlgo(k.pubKey)
                  ? <span className="badge" style={{ color: 'var(--accent)' }}>{keyAlgo(k.pubKey)}</span>
                  : <span className="copy">—</span>}</td>
                <td className="mono" style={{ fontSize: 12 }}>{k.pubKey.slice(0, 42)}…</td>
                <td title={new Date(k.createdAt).toLocaleString()}>{relTime(k.createdAt)}</td>
                <td>
                  <div className="soundboard">
                    <button onClick={() => void copyText(k.pubKey, toast.ok, 'key copied')}>copy</button>
                    <button className="danger" onClick={() => del(k.id)}>remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {keys.length === 0 && <tr><td colSpan={5} className="empty">no keys — add one above, it lands in the next instance you create</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
