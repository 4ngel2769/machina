'use client';

import { Orb } from '@/app/ui/loaders';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Orb state="solving" size={32} /></div>
      <h3 style={{ marginBottom: 6 }}>something broke on this page</h3>
      <div className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
        your VMs keep running. this is only a display problem.
      </div>
      {error.digest && <div className="muted mono" style={{ fontSize: 11, marginBottom: 14 }}>ref {error.digest}</div>}
      <button className="primary" onClick={reset}>reload this page</button>
    </div>
  );
}
