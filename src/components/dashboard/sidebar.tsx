'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import {
  AchievementsIcon,
  AskIcon,
  BuilderIcon,
  DepositIcon,
  FlowsIcon,
  HistoryIcon,
  OverviewIcon,
  SettingsIcon,
  VaultsIcon,
  VerifyIcon,
  WithdrawIcon,
  YieldIcon,
} from '@/components/ui/panoply-icons';
import { TierBadge } from '@/components/dashboard/tier-badge';

/*
 * Nav icons.
 *
 * Panoply's own set (src/components/ui/panoply-icons), not a stock library.
 * The logo sits at the top of this column, and a stock family directly under
 * it read as parts sourced from somewhere else. These are drawn from the
 * logo's geometry - circles, arcs, a small central aperture - so the column
 * reads as one piece.
 *
 * Two carry meaning worth stating, because a stock icon would have said
 * something else:
 *
 *   Vaults is a lock, not a building or a safe. It says what a vault does for
 *   the trader - holds capital shut for its term - rather than what one looks
 *   like.
 *
 *   Yield is three circles growing in turn: a return compounding.
 *
 * Sign out stays Lucide on purpose. It is a control rather than a destination,
 * and keeping it in the stock style keeps it visibly apart from the pages.
 */
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: OverviewIcon, exact: true },
  { href: '/dashboard/ai', label: 'Ask Panoply', icon: AskIcon },
  { href: '/dashboard/bots', label: 'Signal Flows', icon: FlowsIcon },
  { href: '/dashboard/vaults', label: 'Vaults', icon: VaultsIcon },
  { href: '/dashboard/yield', label: 'Yield', icon: YieldIcon },
  { href: '/dashboard/builder', label: 'Portfolio Builder', icon: BuilderIcon },
  // A link to the Overview with the deposit window open, not a page of its
  // own: the window already exists there, and one home for the flow is one
  // thing to keep right. The query string never matches `pathname`, so this
  // entry never shows as active - Overview does, which is where the user is.
  { href: '/dashboard?deposit=1', label: 'Deposit', icon: DepositIcon },
  { href: '/dashboard/withdraw', label: 'Withdraw', icon: WithdrawIcon },
  { href: '/dashboard/history', label: 'Report History', icon: HistoryIcon },
  { href: '/dashboard/kyc', label: 'Verification', icon: VerifyIcon },
  { href: '/dashboard/achievements', label: 'Achievements', icon: AchievementsIcon },
  { href: '/dashboard/settings', label: 'Settings', icon: SettingsIcon },
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
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-ds-border bg-ds-surface-chrome">
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

      <nav className="flex-1 overflow-y-auto space-y-0.5 px-3 py-3">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              /*
               * The programmatic half of the active state. Everything else
               * here is colour, weight and a rule down the left edge, none of
               * which a screen reader can see - without this, "which page am
               * I on" is answerable by sight only.
               */
              aria-current={active ? 'page' : undefined}
              data-nav-active={active}
              className={`nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-chrome ${
                active
                  ? 'bg-primary/12 text-primary border-l-2 border-primary pl-[10px]'
                  : 'text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text border-l-2 border-transparent pl-[10px]'
              }`}
            >
              {/*
               * 18px rather than 16: against 14px text in a 44px row, a 16px
               * glyph sits visibly light and the row reads as text with a mark
               * beside it instead of a paired unit.
               *
               * aria-hidden because the label right next to it already says
               * this. Without it a screen reader can announce the graphic and
               * the word, and every item is read twice.
               */}
              <Icon className="nav-icon h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {href === '/dashboard/kyc' && kycDotClass && (
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kycDotClass}`} />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-ds-border p-3">
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
