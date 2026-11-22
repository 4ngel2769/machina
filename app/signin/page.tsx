/**
 * Sign-in page. The credential check lives in lib/auth.ts; this surface only
 * collects input and renders a deliberately uniform failure. Nothing here
 * reveals whether a username exists, how many attempts remain, or why a
 * sign-in was refused.
 */
'use client';

import { Suspense, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { ThinkingOrb } from 'thinking-orbs';

/** Only same-origin absolute paths are honoured — never an open redirect. */
function safeCallback(raw: string | null): string {
  if (!raw) return '/instances';
  try {
    const parsed = new URL(raw, 'https://machina.invalid');
    if (parsed.origin !== 'https://machina.invalid') return '/instances';
    const callbackPath = parsed.pathname + parsed.search;
    return callbackPath.startsWith('/') && !callbackPath.startsWith('//') ? callbackPath : '/instances';
  } catch {
    return '/instances';
  }
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function SignInForm() {
  const params = useSearchParams();
  const dest = safeCallback(params.get('callbackUrl'));
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !name || !pass) return;
    setBusy(true);
    setError('');
    const result = await signIn('credentials', { username: name, password: pass, redirect: false });
    if (result?.error) {
      // Clear the secret from the DOM on failure; focus the field for a retry.
      setPass('');
      setShowPass(false);
      setError('Invalid username or password.');
      passwordRef.current?.focus();
      setBusy(false);
      return;
    }
    window.location.href = dest;
  }

  return (
    <div className="signin-card pagefade">
      <div className="signin-brand"><span className="brandmark" />machina</div>
      <div className="signin-eyebrow">private cloud console</div>
      <h1 className="signin-title">Sign in</h1>
      <p className="signin-sub">One gate for tenants and operators. Access is logged.</p>

      <form onSubmit={submit}>
        <label className="signin-label" htmlFor="sin-user">username</label>
        <div className="signin-field">
          <input id="sin-user" value={name} onChange={(change) => setName(change.target.value)}
            autoComplete="username" autoCapitalize="off" spellCheck={false} autoFocus />
        </div>

        <label className="signin-label" htmlFor="sin-pass">password</label>
        <div className="signin-field">
          <input ref={passwordRef} id="sin-pass" value={pass}
            onChange={(change) => setPass(change.target.value)}
            type={showPass ? 'text' : 'password'} autoComplete="current-password"
            spellCheck={false} />
          <button type="button" className="signin-toggle" aria-label={showPass ? 'hide password' : 'show password'}
            aria-pressed={showPass} onClick={() => setShowPass((was) => !was)}>
            <EyeIcon off={showPass} />
          </button>
        </div>

        {error && <div className="errbox shake" role="alert" aria-live="assertive">{error}</div>}

        <button className="primary signin-submit" type="submit" disabled={busy || !name || !pass}>
          {busy ? (
            <span className="busybtn">
              <ThinkingOrb state="connecting" size={20} theme="dark" aria-label="signing in" />
              signing in…
            </span>
          ) : 'sign in'}
        </button>
      </form>

      <div className="signin-foot">internal platform · sessions expire after 12 hours</div>
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
