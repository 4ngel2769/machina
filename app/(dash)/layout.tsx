/**
 * Dashboard shell: session bounce, sidebar navigation and the toast provider.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { ToastProvider } from '@/app/ui/toast';
import { JobToasts } from '@/app/ui/job-toasts';
import { LoadBar } from '@/app/ui/loadbar';
import { Shortcuts } from '@/app/ui/shortcuts';
import { Palette } from '@/app/ui/palette';
import { BackgroundWatcher } from '@/app/ui/watcher';
import { Sidebar } from '@/app/ui/sidebar';
import { SessionGuard } from '@/app/ui/session-guard';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) {
    // Preserve where the user was: middleware-style bounce carries the full
    // path+query so sign-in can return them there instead of /instances.
    const headerList = await headers();
    const path = headerList.get('x-pathname') ?? headerList.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ?? '';
    const safe = path.startsWith('/') && !path.startsWith('//') ? path : '';
    redirect(safe ? `/signin?callbackUrl=${encodeURIComponent(safe)}` : '/signin');
  }
  return (
    <ToastProvider>
      <LoadBar />
      <div className="shell">
        <Sidebar name={user.name} role={user.role} />
        <div className="main">
          <div className="layout">{children}</div>
        </div>
      </div>
      <BackgroundWatcher />
      <SessionGuard />
      <Shortcuts />
      <Palette role={user.role} />
      <JobToasts />
    </ToastProvider>
  );
}
