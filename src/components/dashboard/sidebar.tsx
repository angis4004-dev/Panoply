'use client';

import { Link } from '@/i18n/navigation';
import { usePathname } from 'next/navigation';
import {
  Award,
  Bot,
  Brain,
  LayoutDashboard,
  List,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Vault,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import { TierBadge } from '@/components/dashboard/tier-badge';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/ai', label: 'AI Center', icon: Brain },
  { href: '/dashboard/bots', label: 'Signal Flows', icon: Bot },
  { href: '/dashboard/vaults', label: 'Vaults', icon: Vault },
  { href: '/dashboard/yield', label: 'Yield', icon: Zap },
  { href: '/dashboard/builder', label: 'Portfolio Builder', icon: SlidersHorizontal },
  { href: '/dashboard/history', label: 'Report History', icon: List },
  { href: '/dashboard/kyc', label: 'Verification', icon: ShieldCheck },
  { href: '/dashboard/achievements', label: 'Achievements', icon: Award },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

const KYC_DOT_STYLES: Record<string, string> = {
  unverified: 'bg-ds-text-muted',
  pending: 'bg-primary',
  rejected: 'bg-ds-value-negative',
};

interface DashboardSidebarProps {
  onNavigate?: () => void;
}

export default function DashboardSidebar({ onNavigate }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const kycDotClass = user?.kycStatus ? KYC_DOT_STYLES[user.kycStatus] : undefined;
  const initial =
    user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A';

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex h-full min-h-screen w-64 flex-col border-r border-ds-border bg-ds-surface-chrome">
      <div className="flex h-14 items-center gap-2.5 border-b border-ds-border px-5">
        <PanoplyMark size={28} className="text-brand-cream" />
        <div>
          <Link
            href="/"
            onClick={onNavigate}
            className="rounded font-wordmark text-base font-normal tracking-normal text-brand-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-chrome"
          >
            Panoply
          </Link>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-chrome ${
                active
                  ? 'bg-primary/12 text-primary border-l-2 border-primary pl-[10px]'
                  : 'text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text border-l-2 border-transparent pl-[10px]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {href === '/dashboard/kyc' && kycDotClass && (
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kycDotClass}`} />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ds-border p-3">
        {user && (
          <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
              {initial}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-ds-text">
              {user.name || user.email?.split('@')[0] || 'User'}
            </p>
            <TierBadge tier={user.tier || 'unverified'} />
          </div>
        )}
        <button
          onClick={() => {
            logout();
            window.location.href = '/sign-up-login-screen';
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-chrome"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
