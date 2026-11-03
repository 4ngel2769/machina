'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';

export function TopNav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = [
    { href: '/home', label: 'home' },
    { href: '/instances', label: 'instances' },
    { href: '/keys', label: 'ssh keys' },
    { href: '/billing', label: 'billing' },
    { href: '/specs', label: 'specs' },
    ...(role === 'admin' ? [{ href: '/admin', label: 'admin' }] : []),
  ];
  return (
    <>
      <div className="brand">machina</div>
      <nav>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname.startsWith(l.href) ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="spacer" />
      <div style={{ position: 'relative' }}>
        <button className="profilebtn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
          <Blobatar name={name} size={22} animate="hover" />
          <span>{name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>▾</span>
        </button>
        {open && (
          <div className="profilemenu" role="menu" onClick={() => setOpen(false)}>
            <Link href="/account" role="menuitem">account</Link>
            <Link href="/billing" role="menuitem">billing</Link>
            <Link href="/specs" role="menuitem">specs</Link>
            {role === 'admin' && <Link href="/admin" role="menuitem">admin</Link>}
            <div className="sep" />
            <Link href="/terms" role="menuitem">terms</Link>
            <Link href="/privacy" role="menuitem">privacy</Link>
            <div className="sep" />
            <button role="menuitem" onClick={() => signOut({ callbackUrl: '/signin' }).then(() => router.push('/signin'))}>
              sign out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
