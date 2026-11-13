/**
 * Sign-in page with a same-origin callback URL.
 */
'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { ThinkingOrb } from 'thinking-orbs';

/** Only same-origin absolute paths are honoured — never an open redirect. */
function safeCallback(raw: string | null): string {
  if (!raw) return '/instances';
  try {
    const u = new URL(raw, 'https://machina.invalid');
    if (u.origin !== 'https://machina.invalid') return '/instances';
    const p = u.pathname + u.search;
    return p.startsWith('/') && !p.startsWith('//') ? p : '/instances';
  } catch {
    return '/instances';
  }
}

function SignInForm() {
  const params = useSearchParams();
  const dest = safeCallback(params.get('callbackUrl'));
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await signIn('credentials', { username: name, password: pass, redirect: false });
    if (res?.error) {
      setError('bad credentials');
      setAttempts((n) => n + 1);
      setBusy(false);
    } else {
      window.location.href = dest;
    }
  }

  return (
    <div className="signin-card pagefade">
      <div className="signin-brand">
        <span className="brandmark" />
        <span>machina</span>
      </div>
      <div className="signin-sub">rent small VMs</div>

      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="u">username</label>
          <input id="u" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="p">password</label>
          <input id="p" type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password" />
        </div>
        {error && <div className="errbox shake" key={attempts} style={{ marginBottom: 12 }}>{error}</div>}
        <button className="primary" type="submit" disabled={busy || !name || !pass} style={{ width: '100%' }}>
          {busy
            ? <span className="busybtn" style={{ justifyContent: 'center', width: '100%', display: 'inline-flex' }}>
                <ThinkingOrb state="connecting" size={20} theme="dark" aria-label="signing in" />
                signing in…
              </span>
            : 'sign in'}
        </button>
      </form>

      <div className="signin-foot">internal platform · access controlled</div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="signin">
      <Suspense>
        <SignInForm />
      </Suspense>
    </div>
  );
}
