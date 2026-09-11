'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileClock,
  Landmark,
  LayoutGrid,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Trophy,
  Waypoints,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import { TierBadge } from '@/components/dashboard/tier-badge';

/*
 * Nav icons.
 *
 * One library throughout - Lucide, which the other 50-odd files already use.
 * Introducing Phosphor for this one component would create exactly the mixture
 * of unrelated icon families that makes a sidebar look assembled rather than
 * designed, so the fix is to use the existing set deliberately.
 *
 * Each glyph is chosen to be readable at 18px on its own, because at this size
 * the icon is seen before the label is. Where a glyph was carrying the wrong
 * meaning:
 *
 *   Signal Flows had Bot - a robot's face - which is the vocabulary this
 *   product deliberately moved away from. Waypoints draws routed nodes, which
 *   is what a signal flow is.
 *
 *   Ask Panoply had Brain, the stock glyph on every AI feature shipped since
 *   2023. Sparkles is the convention premium tools have settled on for
 *   assisted/generated work.
 *
 *   Vaults had Vault, which is semantically exact and visually poor: at this
 *   size its dial and bolts collapse into a crossed box that reads as an error
 *   state. Landmark keeps the custody meaning with a silhouette that survives
 *   the size.
 *
 *   Yield had Zap, which the metrics grid also uses for something unrelated -
 *   one glyph, two meanings, in a product whose pitch is precision. Sprout is
 *   specific to yield and unused elsewhere.
 *
 *   Overview had LayoutDashboard, whose uneven blocks read as clutter. The
 *   even grid of LayoutGrid is calmer and says the same thing.
 *
 *   Report History had List, which means a list of anything. FileClock carries
 *   both halves of the name.
 *
 *   Achievements had Award; the achievement cards already use Trophy.
 *
 * Kept deliberately: SlidersHorizontal (building an allocation is adjusting
 * weights), ArrowUpFromLine (directional, and leaves ArrowDownToLine free for
 * deposits), ShieldCheck (matches the verification page), and Settings - a
 * gear is the one icon nobody needs to learn.
 */
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/dashboard/ai', label: 'Ask Panoply', icon: Sparkles },
  { href: '/dashboard/bots', label: 'Signal Flows', icon: Waypoints },
  { href: '/dashboard/vaults', label: 'Vaults', icon: Landmark },
  { href: '/dashboard/yield', label: 'Yield', icon: Sprout },
  { href: '/dashboard/builder', label: 'Portfolio Builder', icon: SlidersHorizontal },
  // A link to the Overview with the deposit window open, not a page of its
  // own: the window already exists there, and one home for the flow is one
  // thing to keep right. The query string never matches `pathname`, so this
  // entry never shows as active - Overview does, which is where the user is.
  { href: '/dashboard?deposit=1', label: 'Deposit', icon: ArrowDownToLine },
  { href: '/dashboard/withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
  { href: '/dashboard/history', label: 'Report History', icon: FileClock },
  { href: '/dashboard/kyc', label: 'Verification', icon: ShieldCheck },
  { href: '/dashboard/achievements', label: 'Achievements', icon: Trophy },
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
