import React from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Gauge,
  LayoutDashboard,
  Network,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import { SignOutButton } from './sign-out-button';
import { RoleBadge } from './role-badge';
import type { Permission } from '@/lib/admin/permissions';

/**
 * The console frame.
 *
 * Same skeleton as the trader dashboard - 256px sidebar, 56px header, cream
 * left-rule on the active item - because the two are one product and an
 * operator should not have to relearn where things are. What differs is the
 * word under the wordmark: the trader dashboard carries the wordmark alone,
 * this says OPERATIONS. That, the role chip, and the absence of any trader
 * chrome are how you know which application you are looking at.
 *
 * Navigation is filtered by permission. That is presentation, not security -
 * every page and endpoint behind these links checks for itself - but an
 * operator should not be shown a queue they will be bounced out of.
 */

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: Permission;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  {
    href: '/admin/deposits',
    label: 'Deposit queue',
    icon: ArrowDownToLine,
    permission: 'deposit.read',
  },
  {
    href: '/admin/withdrawals',
    label: 'Withdrawals',
    icon: ArrowUpFromLine,
    permission: 'withdrawal.read',
  },
  { href: '/admin/kyc', label: 'KYC queue', icon: ShieldCheck, permission: 'kyc.read' },
  { href: '/admin/traders', label: 'Traders', icon: Users, permission: 'trader.read' },
  { href: '/admin/networks', label: 'Networks', icon: Network, permission: 'network.read' },
  {
    href: '/admin/deposit-addresses',
    label: 'Addresses',
    icon: Wallet,
    permission: 'deposit_address.read',
  },
  { href: '/admin/trading', label: 'Trading', icon: Gauge, permission: 'trading.read' },
  { href: '/admin/admins', label: 'Admins', icon: UserCog, permission: 'admin.read' },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.read' },
];

export function ConsoleShell({
  admin,
  can,
  current,
  pendingBadges,
  children,
}: {
  admin: { name: string; email: string; role: string };
  can: (permission: Permission) => boolean;
  /** Pathname of the page rendering this shell, for the active state. */
  current?: string;
  pendingBadges?: Partial<Record<string, number>>;
  children: React.ReactNode;
}) {
  const items = NAV.filter((item) => !item.permission || can(item.permission));
  const initial = admin.name.charAt(0).toUpperCase() || admin.email.charAt(0).toUpperCase();

  const isActive = (item: NavItem) => {
    if (!current) return false;
    return item.exact
      ? current === item.href
      : current === item.href || current.startsWith(`${item.href}/`);
  };

  return (
    <div className="flex min-h-screen bg-ds-surface text-ds-text">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ds-border bg-ds-surface-chrome lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-ds-border px-5">
          <PanoplyMark size={28} className="text-brand-cream" />
          <div>
            <span className="font-wordmark text-base font-normal tracking-normal text-brand-cream">
              Panoply
            </span>
            {/* The trader dashboard has nothing here. One word is the whole
                signal that you are on the privileged surface. */}
            <p className="text-ds-caption uppercase tracking-wider text-primary/70">Operations</p>
          </div>
        </div>

        <nav aria-label="Console" className="flex-1 space-y-0.5 px-3 py-4">
          {items.map((item) => {
            const active = isActive(item);
            const badge = pendingBadges?.[item.href];
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg border-l-2 py-2.5 pl-[10px] pr-3 text-ds-label font-medium tracking-normal transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-chrome ${
                  active
                    ? 'border-primary bg-primary/12 text-primary'
                    : 'border-transparent text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {badge ? (
                  <span className="rounded-full bg-ds-value-warning/15 px-1.5 text-ds-caption font-semibold tabular-nums text-ds-value-warning">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-ds-border p-3">
          <Link
            href="/admin/account"
            className="flex items-center gap-2.5 rounded-lg border border-ds-border bg-ds-surface-raised/60 p-2 transition-colors duration-fast ease-ds-out hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-ds-label font-bold text-primary">
              {initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ds-caption font-medium tracking-normal text-ds-text">
                {admin.email}
              </span>
              <RoleBadge role={admin.role} className="mt-0.5" />
            </span>
          </Link>
          <div className="mt-2">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile chrome. The console is a desktop tool, but an operator gets
            paged at midnight and opens it on a phone, and a queue they cannot
            navigate is worse than one that is merely cramped. */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-ds-border bg-ds-surface/95 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <PanoplyMark size={22} className="text-brand-cream" />
            <span className="font-wordmark text-ds-label font-normal tracking-normal text-brand-cream">
              Panoply
            </span>
            <span className="text-ds-caption uppercase tracking-wider text-primary/70">Ops</span>
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge role={admin.role} />
            <SignOutButton />
          </div>
        </header>

        <nav
          aria-label="Console"
          className="flex gap-1 overflow-x-auto border-b border-ds-border bg-ds-surface-chrome px-3 py-2 lg:hidden"
        >
          {items.map((item) => {
            const active = isActive(item);
            const badge = pendingBadges?.[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-ds-label font-medium tracking-normal transition-colors duration-fast ease-ds-out ${
                  active
                    ? 'bg-primary/12 text-primary'
                    : 'text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text'
                }`}
              >
                {item.label}
                {badge ? (
                  <span className="rounded-full bg-ds-value-warning/15 px-1.5 text-ds-caption font-semibold tabular-nums text-ds-value-warning">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <main id="admin-main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-ds-heading text-ds-text">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-ds-label font-normal tracking-normal text-ds-text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
