/**
 * Account popup shared by the desktop dock and the mobile dock.
 *
 * stopPropagation on the menu matters: it is a sibling of the trigger inside
 * .dock-user, so a click on a menu item must not bubble back into anything
 * that toggles the menu closed before navigation runs.
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';

export function UserMenu({ name, role, onClose }: { name: string; role: string; onClose: () => void }) {
  const router = useRouter();
  const isAdmin = role === 'admin';
  return (
    <nav
      className="profilemenu dock-menu"
      aria-label="account menu"
      onClick={(event) => { event.stopPropagation(); onClose(); }}
    >
      <div className="dock-menu-head">
        <Blobatar name={name} size={26} animate="hover" />
        <div>
          <div className="dock-menu-name">{name}</div>
          <div className="dock-menu-role">{isAdmin ? 'admin' : 'user'}</div>
        </div>
      </div>
      <div className="sep" />
      <Link href="/account">settings</Link>
      <Link href="/notifications">notifications</Link>
      <Link href="/keys">ssh keys</Link>
      <Link href="/billing">billing</Link>
      <Link href="/tokens">api tokens</Link>
      <div className="sep" />
      <Link href="/terms">terms</Link>
      <Link href="/privacy">privacy</Link>
      <div className="sep" />
      <button onClick={() => signOut({ callbackUrl: '/signin' }).then(() => router.push('/signin'))}>
        sign out
      </button>
    </nav>
  );
}
