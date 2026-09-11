'use client';

import Link from 'next/link';
import { ArrowUpRight, Waypoints } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

const BUTTON_BASE =
  'inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface';
const SOLID = `${BUTTON_BASE} bg-primary font-semibold text-primary-foreground hover:bg-primary/90`;
const OUTLINE = `${BUTTON_BASE} border border-ds-border font-medium text-ds-text hover:border-primary/40 hover:bg-ds-surface-inset`;

/**
 * Wallet balance and the three things you can do from it.
 *
 * Moved out of the Overview page, which had grown past the project's 500-line
 * limit, when the buttons gained a second arrangement.
 *
 * `promoteDeposit` swaps which button is solid. A verified trader with nothing
 * in their balance cannot create a signal flow - there is nothing to allocate
 * - so the solid button used to point at the one action that would fail. The
 * Overview decides this from the same journey the checklist reads, so the two
 * never recommend different next steps.
 */
export function PortfolioHero({
  promoteDeposit,
  onDeposit,
}: {
  promoteDeposit: boolean;
  onDeposit: () => void;
}) {
  const {
    bots,
    botsLoading,
    walletBalance,
    walletBalanceLoading,
    walletBalanceError,
    fetchWalletBalance,
  } = useAppStore();

  return (
    <section className="mb-6 rounded-xl border border-ds-border bg-ds-surface-raised/60 p-5 sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ds-text-muted">
            Wallet Balance
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-4xl font-bold tabular-nums text-ds-text sm:text-5xl">
              {walletBalanceLoading
                ? 'Loading'
                : walletBalanceError
                  ? 'Unavailable'
                  : `$${walletBalance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
            </span>
          </div>
          {walletBalanceError ? (
            <button
              type="button"
              onClick={fetchWalletBalance}
              className="mt-2 text-left text-sm font-semibold text-primary underline underline-offset-2"
            >
              Wallet unavailable. Retry
            </button>
          ) : (
            <p className="mt-2 text-sm text-ds-text-muted">
              {botsLoading
                ? 'Loading signal flows'
                : `${bots.length} signal flow${bots.length === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onDeposit} className={promoteDeposit ? SOLID : OUTLINE}>
            Deposit
          </button>
          <Link href="/dashboard/bots" className={promoteDeposit ? OUTLINE : SOLID}>
            <Waypoints className="h-4 w-4" />
            Create Signal Flow
          </Link>
          <Link href="/dashboard/builder" className={OUTLINE}>
            Run Builder
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
