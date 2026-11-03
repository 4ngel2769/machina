import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ToastProvider } from '@/app/ui/toast';
import { LoadBar } from '@/app/ui/loadbar';
import { Shortcuts } from '@/app/ui/shortcuts';
import { BackgroundWatcher } from '@/app/ui/watcher';
import { TopNav } from './topnav';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect('/signin');
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
      <Shortcuts />
    </ToastProvider>
  );
}
