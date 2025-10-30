'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/command-palette';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Public pages that don't need sidebar
  const publicPages = ['/login', '/register'];
  const isPublicPage = publicPages.some(page => pathname.startsWith(page));

  if (isPublicPage) {
    // Render without sidebar for public pages
    return <>{children}</>;
  }

  // Render with sidebar for authenticated pages
  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
          <div className="container mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
      <CommandPalette />
    </>
  );
}
