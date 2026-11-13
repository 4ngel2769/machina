/**
 * SSH key management page.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { useToast } from '@/app/ui/toast';
import { Skeleton, useMinVisible } from '@/app/ui/loaders';
import { copyText } from '@/app/ui/clipboard';
import { relTime } from '@/app/ui/time';

type Key = { id: string; label: string; pubKey: string; createdAt: number };

function keyAlgo(keyLine: string): string | null {
  const algorithm = keyLine.trim().split(/\s+/)[0];
  if (!algorithm || !keyLine.includes(' ')) return null;
  if (/^ssh-(ed25519|rsa)$/.test(algorithm)) return algorithm.slice(4);
  if (/^sk-ssh/.test(algorithm)) return 'fido2';
  if (/^ecdsa-sha2-\S+$/.test(algorithm)) return 'ecdsa';
  return null;
}

export default function KeysPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<Key[] | null>(null);
  const ready = useMinVisible(400);
  const loading = !ready || keys === null;
  const [label, setLabel] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const keysResponse = await fetch('/api/keys', { cache: 'no-store' });
    if (keysResponse.ok) setKeys(await keysResponse.json());
    else setKeys([]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch('/api/keys', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label, pubKey }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { toast.ok('key added'); setLabel(''); setPubKey(''); void load(); }
    else toast.err(body.error ?? 'failed');
    setBusy(false);
  }

  async function del(id: string) {
    const response = await fetch('/api/keys', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (response.ok) toast.ok('key removed');
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
              <input id="l" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="laptop" />
            </div>
            <div style={{ flex: 3, minWidth: 260 }}>
              <label htmlFor="k">public key</label>
              <input id="k" value={pubKey} onChange={(event) => setPubKey(event.target.value)} placeholder="ssh-ed25519 AAAA… me@host" className="mono"
                style={pubKey && !keyAlgo(pubKey) ? { borderColor: 'var(--warn)' } : undefined} />
              {pubKey && !keyAlgo(pubKey)
                ? <div className="muted" style={{ marginTop: 4, color: 'var(--warn)' }}>doesn&apos;t look like an OpenSSH public key line</div>
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

      <KeysTable keys={keys} loading={loading} onDelete={(id) => void del(id)} />
    </>
  );
}

function KeysTable({ keys, loading, onDelete }: {
  keys: Key[] | null; loading: boolean; onDelete: (id: string) => void;
}) {
  const toast = useToast();
  return (
    <div className="card">
      <h3>keys</h3>
      <table>
        <thead><tr><th>label</th><th>algo</th><th>key</th><th>added</th><th /></tr></thead>
        <tbody>
          {loading && Array.from({ length: 3 }).map((_, n) => (
            <tr key={n}>{Array.from({ length: 5 }).map((__, cell) => (
              <td key={cell} style={{ padding: '10px' }}><Skeleton w={cell === 4 ? '40%' : '70%'} h={10} /></td>
            ))}</tr>
          ))}
          {!loading && (keys ?? []).map((sshKey) => (
            <tr key={sshKey.id}>
              <td>{sshKey.label}</td>
              <td>{keyAlgo(sshKey.pubKey)
                ? <span className="badge" style={{ color: 'var(--accent)' }}>{keyAlgo(sshKey.pubKey)}</span>
                : <span className="copy">—</span>}</td>
              <td className="mono" style={{ fontSize: 12 }}>{sshKey.pubKey.slice(0, 42)}…</td>
              <td title={new Date(sshKey.createdAt).toLocaleString()}>{relTime(sshKey.createdAt)}</td>
              <td>
                <div className="soundboard">
                  <button onClick={() => void copyText(sshKey.pubKey, toast.ok, 'key copied')}>copy</button>
                  <button className="danger" onClick={() => onDelete(sshKey.id)}>remove</button>
                </div>
              </td>
            </tr>
          ))}
          {!loading && (keys ?? []).length === 0 && <tr><td colSpan={5} className="empty">no keys — add one above, it lands in the next instance you create</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
