'use client';

import Link from 'next/link';
import { Orb } from '@/app/ui/loaders';

export default function NotFound() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '46px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Orb state="searching" size={32} /></div>
      <h3 style={{ marginBottom: 6 }}>no such page</h3>
      <div className="muted" style={{ marginBottom: 18, fontSize: 13 }}>
        the link is wrong, or the thing it pointed at is gone.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <Link href="/home" className="primary" style={{ padding: '8px 14px', fontSize: 14, textDecoration: 'none' }}>home</Link>
        <Link href="/instances" style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14 }}>instances</Link>
      </div>
    </div>
  );
}
