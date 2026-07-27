'use client';

import { useState } from 'react';
import DashboardSidebar from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#0A0E13] text-[#E7ECF2]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        <DashboardSidebar />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative h-full w-64 shadow-2xl">
            <DashboardSidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col min-w-0">
        <DashboardHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
