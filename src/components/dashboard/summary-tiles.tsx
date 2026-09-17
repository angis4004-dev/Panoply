'use client';

import Link from 'next/link';
import { Percent, Vault, Waypoints } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

/**
 * Three tiles standing in for three lists.
 *
 * The Overview used to render the signal flows and the yield table in full,
 * each with its own header, its own skeletons and its own "view all" link -
 * two complete copies of pages that are already in the sidebar. Reading the
 * dashboard therefore meant scrolling past both to reach anything below them.
 *
 * What a summary owes the reader is one number and a way in: how many flows
 * are running, how much is in vaults, what the best rate on offer is. The
 * detail lives one tap away on the page built for it.
 */

export interface SummaryTilesProps {
  /** Best annual rate among the yields the Overview already fetched, or null. */
  bestYieldApy: number | null;
  yieldsLoading: boolean;
}

function Tile({
  href,
  icon,
  label,
  value,
  caption,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[112px] flex-col justify-between rounded-xl border border-ds-border bg-ds-surface-raised/50 p-4 transition-colors duration-fast ease-ds-out hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
    >
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
        {icon}
        {label}
      </span>
      <span>
        <span className="block font-mono text-2xl text-ds-text">{value}</span>
        <span className="mt-0.5 block text-xs text-ds-text-muted">{caption}</span>
      </span>
    </Link>
  );
}

export function SummaryTiles({ bestYieldApy, yieldsLoading }: SummaryTilesProps) {
  const { bots, botsLoading, vaultInvestments, vaultInvestmentsLoading } = useAppStore();

  const running = bots.filter((bot) => bot.status === 'running').length;
  const vaultValue = vaultInvestments.reduce((sum, entry) => sum + (entry.investedAmount ?? 0), 0);

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <Tile
        href="/dashboard/bots"
        icon={<Waypoints className="h-4 w-4" aria-hidden />}
        label="Signal flows"
        value={botsLoading ? '—' : String(running)}
        caption={
          botsLoading
            ? 'Loading'
            : bots.length === 0
              ? 'None yet'
              : `running of ${bots.length} total`
        }
      />
      <Tile
        href="/dashboard/vaults"
        icon={<Vault className="h-4 w-4" aria-hidden />}
        label="Vaults"
        value={
          vaultInvestmentsLoading
            ? '—'
            : `$${vaultValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        }
        caption={
          vaultInvestmentsLoading
            ? 'Loading'
            : vaultInvestments.length === 0
              ? 'No positions yet'
              : `across ${vaultInvestments.length} vault${vaultInvestments.length === 1 ? '' : 's'}`
        }
      />
      <Tile
        href="/dashboard/yield"
        icon={<Percent className="h-4 w-4" aria-hidden />}
        label="Yield"
        value={yieldsLoading || bestYieldApy === null ? '—' : `${bestYieldApy.toFixed(1)}%`}
        caption={
          yieldsLoading ? 'Loading' : bestYieldApy === null ? 'Unavailable' : 'best rate now'
        }
      />
    </div>
  );
}
