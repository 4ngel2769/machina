'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Orb } from '@/app/ui/loaders';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="en">
      <body>
        <div className="signin">
          <div className="signin-card" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Orb state="solving" size={32} /></div>
            <h1 style={{ margin: '0 0 6px', fontSize: 18 }}>something broke</h1>
            <div className="sub" style={{ marginBottom: 18 }}>
              the page hit an unexpected error. your VMs are unaffected.
            </div>
            {error.digest && <div className="muted mono" style={{ fontSize: 11, marginBottom: 14 }}>ref {error.digest}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="primary" onClick={reset}>try again</button>
              <Link href="/home" style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14 }}>home</Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
