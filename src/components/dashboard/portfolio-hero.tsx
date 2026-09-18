'use client';

import Link from 'next/link';
import { useAppStore } from '@/store/app-store';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import { SplitBar } from '@/components/dashboard/card-marks';
import { ChangingValue } from '@/components/ui/changing-value';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  CARD_FIGURE_BIG,
  CARD_LABEL,
  CARD_META,
  CardChip,
  OverviewCard,
  money,
} from '@/components/dashboard/overview-card';

const BUTTON_BASE =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[9px] px-4 py-2 text-sm font-medium transition-[transform,background-color,border-color] duration-[160ms] ease-ds-out active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface';
const SOLID = `${BUTTON_BASE} bg-primary text-primary-foreground hover:bg-primary/90`;
const OUTLINE = `${BUTTON_BASE} border border-ds-border-strong text-ds-text hover:border-primary/40 hover:bg-white/[0.04]`;
const GHOST = `${BUTTON_BASE} text-ds-text-secondary hover:text-ds-text`;

export interface BalanceCardProps {
  walletBalance: number;
  /** Capital committed to signal flows. */
  inFlows: number;
  /** Capital in vaults. */
  inVaults: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  promoteDeposit: boolean;
  onDeposit: () => void;
}

/**
 * The wallet, where the rest of the trader's money sits, and what they can do.
 *
 * The figure is the wallet balance - money available to deploy or withdraw.
 * The bar under it adds what is already at work in flows and vaults, so the
 * card answers "where is my money" and not only "what can I spend".
 *
 * `promoteDeposit` swaps which button is solid. A verified trader with nothing
 * in their balance cannot create a signal flow - there is nothing to allocate
 * - so the solid button used to point at the one action that would fail. The
 * Overview decides this from the same journey the checklist reads, so the two
 * never recommend different next steps.
 */
export function BalanceCard({
  walletBalance,
  inFlows,
  inVaults,
  loading,
  error,
  onRetry,
  promoteDeposit,
  onDeposit,
}: BalanceCardProps) {
  const total = walletBalance + inFlows + inVaults;
  return (
    <OverviewCard glow="strong" className="md:col-span-2 md:min-h-[260px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CardChip lit>
            <PanoplyMark size={18} />
          </CardChip>
          <span className={CARD_LABEL}>Wallet balance</span>
        </div>
        {!loading && !error && total > 0 && (
          <span className="whitespace-nowrap rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-xs tabular-nums text-ds-text-secondary">
            {money(total, { decimals: 0 })} across Panoply
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-11 w-56" />
      ) : error ? (
        <div className="grid gap-1">
          <p className={`${CARD_FIGURE_BIG} text-ds-text-muted`}>Unavailable</p>
          <button
            type="button"
            onClick={onRetry}
            className="justify-self-start text-sm font-semibold text-primary underline underline-offset-2"
          >
            Wallet unavailable. Retry
          </button>
        </div>
      ) : (
        <p className={`${CARD_FIGURE_BIG} text-ds-text`}>
          <ChangingValue text={money(walletBalance)} mutedDecimals />
        </p>
      )}

      {!loading &&
        !error &&
        (total > 0 ? (
          <SplitBar
            label={`Wallet ${money(walletBalance)}, in signal flows ${money(inFlows)}, in vaults ${money(inVaults)}`}
            segments={[
              {
                label: 'Wallet',
                value: walletBalance,
                display: money(walletBalance, { decimals: 0 }),
                tone: 'full',
              },
              {
                label: 'In flows',
                value: inFlows,
                display: money(inFlows, { decimals: 0 }),
                tone: 'mid',
              },
              {
                label: 'In vaults',
                value: inVaults,
                display: money(inVaults, { decimals: 0 }),
                tone: 'low',
              },
            ]}
          />
        ) : (
          <p className={CARD_META}>Deposit to start your first signal flow.</p>
        ))}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={onDeposit} className={promoteDeposit ? SOLID : OUTLINE}>
          {promoteDeposit && total === 0 ? 'Make your first deposit' : 'Deposit'}
        </button>
        <Link href="/dashboard/bots" className={promoteDeposit ? OUTLINE : SOLID}>
          New signal flow
        </Link>
        <Link href="/dashboard/withdraw" className={GHOST}>
          Withdraw
        </Link>
      </div>
    </OverviewCard>
  );
}

export function PortfolioHero({
  promoteDeposit,
  onDeposit,
}: {
  promoteDeposit: boolean;
  onDeposit: () => void;
}) {
  const {
    bots,
    walletBalance,
    walletBalanceLoading,
    walletBalanceError,
    fetchWalletBalance,
    vaultInvestments,
  } = useAppStore();

  const inFlows = bots.reduce((sum, b) => sum + (b.allocatedAmount || 0), 0);
  const inVaults = vaultInvestments.reduce((sum, v) => sum + (v.investedAmount ?? 0), 0);

  return (
    <BalanceCard
      walletBalance={walletBalance}
      inFlows={inFlows}
      inVaults={inVaults}
      loading={walletBalanceLoading}
      error={walletBalanceError}
      onRetry={fetchWalletBalance}
      promoteDeposit={promoteDeposit}
      onDeposit={onDeposit}
    />
  );
}
