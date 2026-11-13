import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { ToastProvider } from '@/app/ui/toast';
import { LoadBar } from '@/app/ui/loadbar';
import { Shortcuts } from '@/app/ui/shortcuts';
import { Palette } from '@/app/ui/palette';
import { BackgroundWatcher } from '@/app/ui/watcher';
import { TopNav } from './topnav';
import { SessionGuard } from '@/app/ui/session-guard';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) {
    // Preserve where the user was: middleware-style bounce carries the full
    // path+query so sign-in can return them there instead of /instances.
    const h = await headers();
    const path = h.get('x-pathname') ?? h.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ?? '';
    const safe = path.startsWith('/') && !path.startsWith('//') ? path : '';
    redirect(safe ? `/signin?callbackUrl=${encodeURIComponent(safe)}` : '/signin');
  }
  return (
    <ToastProvider>
      <LoadBar />
      <div className="topnav">
        <div className="layout" style={{ display: 'flex', alignItems: 'center', gap: 18, width: '100%' }}>
          {user && <TopNav name={user.name} role={user.role} />}
        </div>
      </div>
      <div className="layout">{children}</div>
      <BackgroundWatcher />
      <SessionGuard />
      <Shortcuts />
      <Palette role={user.role} />
    </ToastProvider>
  );
}
