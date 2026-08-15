'use client';

import { Link } from '@/i18n/navigation';
import { Menu } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';

interface DashboardHeaderProps {
  onMenuClick?: () => void;
}

export function DashboardHeader({ onMenuClick }: DashboardHeaderProps) {
  const { user } = useAppStore();
  const initial =
    user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A';

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-ds-border bg-ds-surface/95 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text lg:hidden transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="flex min-h-[44px] items-center gap-2 rounded lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
        >
          <PanoplyMark size={20} className="text-brand-cream" />
          <span className="font-wordmark font-normal tracking-normal text-brand-cream">
            Panoply
          </span>
        </Link>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ds-value-positive opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ds-value-positive" />
          </span>
          <span className="text-xs font-medium text-ds-text-muted">Markets live</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user && <NotificationBell />}

        {user ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-ds-border bg-ds-surface-raised/60 py-1 pl-1 pr-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
              {initial}
            </div>
            <span className="hidden text-sm font-medium text-ds-text sm:inline">
              {user.name || user.email?.split('@')[0] || 'User'}
            </span>
          </div>
        ) : (
          <Link
            href="/sign-up-login-screen"
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
