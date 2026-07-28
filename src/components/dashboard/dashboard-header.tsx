'use client';

import Link from 'next/link';
import { Bell, Menu } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { AegisMark } from '@/components/ui/AegisLogo';

interface DashboardHeaderProps {
  onMenuClick?: () => void;
}

export function DashboardHeader({ onMenuClick }: DashboardHeaderProps) {
  const { user } = useAppStore();
  const initial =
    user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A';

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[#212A35] bg-[#0A0E13]/95 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-[#8B95A5] hover:bg-[#17202e] hover:text-[#E7ECF2] lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 rounded lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
        >
          <AegisMark size={20} />
          <span className="font-wordmark font-extrabold uppercase tracking-[0.12em] text-white">
            AEGIS
          </span>
        </Link>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          <span className="text-xs font-medium text-[#8B95A5]">Markets live</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="relative rounded-lg p-2 text-[#8B95A5] hover:bg-[#17202e] hover:text-[#E7ECF2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#E5555A]" />
        </button>

        {user ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-[#212A35] bg-[#122131]/60 py-1 pl-1 pr-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
              {initial}
            </div>
            <span className="hidden text-sm font-medium text-[#E7ECF2] sm:inline">
              {user.name || user.email?.split('@')[0] || 'User'}
            </span>
          </div>
        ) : (
          <Link
            href="/sign-up-login-screen"
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
