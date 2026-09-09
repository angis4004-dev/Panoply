'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Layers, Search, Sprout, TrendingUp, X } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Skeleton } from '@/components/ui/Skeleton';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { YieldCalculatorModal } from '@/components/dashboard/yield-calculator-modal';
import { compactUsd } from '@/lib/utils';
import type { YieldRisk } from '@/lib/defillama';

interface YieldOpportunity {
  id: string;
  protocol: string;
  chain: string;
  /** Pool composition, e.g. "WSOL-USDC". */
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: YieldRisk;
}

export default function YieldPage() {
  const [opportunities, setOpportunities] = useState<YieldOpportunity[]>([]);
  const [meta, setMeta] = useState<{ asOf: string; stale: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter and search states
  const [search, setSearch] = useState('');
  const [selectedChain, setSelectedChain] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');

  // Calculator modal state
  const [calcPool, setCalcPool] = useState<YieldOpportunity | null>(null);
  const [isCalcOpen, setIsCalcOpen] = useState(false);

  useEffect(() => {
    fetch('/api/yield')
      .then((res) => {
        if (!res.ok) throw new Error('Yield request failed');
        return res.json();
      })
      .then((data: { pools: YieldOpportunity[]; asOf: string; stale: boolean }) => {
        setOpportunities(data.pools || []);
        setMeta({ asOf: data.asOf, stale: data.stale });
      })
      .catch(() => setOpportunities([]))
      .finally(() => setLoading(false));
  }, []);

  // Dynamically extract available chains
  const chains = useMemo(() => {
    const set = new Set<string>();
    for (const item of opportunities) {
      if (item.chain) set.add(item.chain);
    }
    return ['all', ...Array.from(set).sort()];
  }, [opportunities]);

  // Filtered pool results
  const filtered = useMemo(() => {
    return opportunities.filter((item) => {
      const matchChain =
        selectedChain === 'all' || item.chain.toLowerCase() === selectedChain.toLowerCase();
      const matchRisk =
        selectedRisk === 'all' || item.risk.toLowerCase() === selectedRisk.toLowerCase();
      const matchSearch =
        !search.trim() ||
        item.protocol.toLowerCase().includes(search.toLowerCase()) ||
        item.symbol.toLowerCase().includes(search.toLowerCase()) ||
        item.chain.toLowerCase().includes(search.toLowerCase());
      return matchChain && matchRisk && matchSearch;
    });
  }, [opportunities, selectedChain, selectedRisk, search]);

  // Summary statistics
  const stats = useMemo(() => {
    if (filtered.length === 0) return { avgApy: 0, maxApy: 0, topProtocol: '-' };
    const avgApy = filtered.reduce((acc, curr) => acc + curr.apy, 0) / filtered.length;
    const sorted = [...filtered].sort((a, b) => b.apy - a.apy);
    return {
      avgApy,
      maxApy: sorted[0]?.apy || 0,
      topProtocol: `${sorted[0]?.protocol || '-'} (${sorted[0]?.symbol || ''})`,
    };
  }, [filtered]);

  const openCalculator = (pool: YieldOpportunity) => {
    setCalcPool(pool);
    setIsCalcOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Yield Intelligence"
        description="Cross-chain yield opportunities ranked by APY and risk with compound return modeling."
      />

      {/* Summary KPI Cards */}
      {!loading && opportunities.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/40 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-ds-text-muted">
              <Layers className="h-4 w-4 text-primary" />
              <span>Available Pools</span>
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-ds-text">
              {filtered.length}
              {filtered.length !== opportunities.length && (
                <span className="ml-1.5 text-xs font-normal text-ds-text-muted">
                  of {opportunities.length}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/40 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-ds-text-muted">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span>Average APY</span>
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-ds-value-positive">
              {stats.avgApy.toFixed(2)}%
            </div>
          </div>

          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/40 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-ds-text-muted">
              <Sprout className="h-4 w-4 text-primary" />
              <span>Top Yield Opportunity</span>
            </div>
            <div className="mt-2 truncate text-sm font-semibold text-ds-text">
              {stats.topProtocol}
            </div>
            <div className="font-mono text-xs font-bold text-ds-value-positive">
              {stats.maxApy.toFixed(2)}% APY
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Search */}
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search protocol, pair (e.g. USDC, SOL)..."
            className="w-full rounded-xl border border-ds-border bg-ds-surface-raised py-2 pl-9 pr-8 text-xs text-ds-text transition-colors placeholder:text-ds-text-muted focus:border-primary/50 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ds-text-muted hover:text-ds-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Chain & Risk Filter Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chain Chips */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
            {chains.slice(0, 7).map((chain) => (
              <button
                key={chain}
                onClick={() => setSelectedChain(chain)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  selectedChain === chain
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-ds-border text-ds-text-secondary hover:border-ds-border-strong hover:text-ds-text'
                }`}
              >
                {chain === 'all' ? 'All Chains' : chain}
              </button>
            ))}
          </div>

          <div className="hidden h-4 w-px bg-ds-border sm:block" />

          {/* Risk Filters */}
          <div className="flex items-center gap-1">
            <span className="mr-1 hidden text-xs text-ds-text-muted md:inline">Risk:</span>
            {(['all', 'Low', 'Medium', 'High'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRisk(r)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedRisk === r
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-ds-border text-ds-text-secondary hover:border-ds-border-strong hover:text-ds-text'
                }`}
              >
                {r === 'all' ? 'All Risk' : r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Pools Table */}
      {loading ? (
        <div className="overflow-hidden rounded-xl border border-ds-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ds-border bg-ds-surface-inset/60 text-left">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  Protocol
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted sm:table-cell">
                  Chain
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted md:table-cell">
                  Risk
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  APY
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted lg:table-cell">
                  TVL
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  ROI Tool
                </th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr
                  key={i}
                  className={`border-b border-ds-border/60 ${i % 2 === 0 ? 'bg-ds-surface-raised/30' : 'bg-transparent'}`}
                >
                  <td className="px-4 py-3.5">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="hidden px-4 py-3.5 md:table-cell">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-4 py-3.5">
                    <Skeleton className="h-4 w-10" />
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <Skeleton className="h-4 w-14" />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Skeleton className="ml-auto h-7 w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-10 text-center">
          <Sprout className="mx-auto mb-3 h-8 w-8 text-ds-text-muted" />
          <p className="text-sm font-medium text-ds-text">No matching yield opportunities found</p>
          <p className="mt-1 text-xs text-ds-text-muted">
            Try adjusting your search terms, chain filter, or risk level.
          </p>
          {(search || selectedChain !== 'all' || selectedRisk !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedChain('all');
                setSelectedRisk('all');
              }}
              className="mt-3 rounded-lg border border-ds-border px-3 py-1.5 text-xs text-ds-text-secondary hover:border-primary/40 hover:text-ds-text"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ds-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ds-border bg-ds-surface-inset/60 text-left">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  Protocol
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted sm:table-cell">
                  Chain
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted md:table-cell">
                  Risk
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  APY
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted lg:table-cell">
                  TVL
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  ROI Tool
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-ds-border/60 hover:bg-ds-surface-inset/40 transition-colors ${
                    i % 2 === 0 ? 'bg-ds-surface-raised/30' : 'bg-transparent'
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Sprout className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-ds-text">{row.protocol}</div>
                        <div className="truncate text-xs text-ds-text-muted">{row.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 text-ds-text-secondary sm:table-cell">
                    <span className="rounded-md border border-ds-border/80 bg-ds-surface-raised/60 px-2 py-0.5 text-xs">
                      {row.chain}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 md:table-cell">
                    <RiskBadge risk={row.risk} />
                  </td>
                  <td className="px-4 py-3.5 font-mono font-bold text-ds-value-positive">
                    {row.apy.toFixed(2)}%
                  </td>
                  <td className="hidden px-4 py-3.5 font-mono text-xs text-ds-text-muted lg:table-cell">
                    {compactUsd(row.tvlUsd)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => openCalculator(row)}
                      className="inline-flex items-center gap-1 rounded-lg border border-ds-border bg-ds-surface-raised px-2.5 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      title={`Calculate returns for ${row.protocol}`}
                    >
                      <Calculator className="h-3.5 w-3.5 text-primary" />
                      <span>Calculate</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Disclosures and Meta */}
      {!loading && opportunities.length > 0 && (
        <p className="mt-4 max-w-3xl text-ds-caption leading-relaxed text-ds-text-muted">
          Live pool rates from DefiLlama, showing the highest-paying pool per protocol among those
          over $1m in liquidity with at least a month of history. Risk bands are derived from each
          pool&apos;s liquidity, rate volatility and impermanent-loss exposure — they describe the
          pool, and are neither a rating of the protocol nor a recommendation. Panoply does not
          place funds in these pools.
          {meta && (
            <>
              {' '}
              {meta.stale ? 'Last reached' : 'Updated'}{' '}
              {new Date(meta.asOf).toLocaleString([], {
                hour: '2-digit',
                minute: '2-digit',
                day: 'numeric',
                month: 'short',
              })}
              {meta.stale && ' — a refresh failed, so this is the last good data.'}
            </>
          )}
        </p>
      )}

      {/* Interactive Compound Calculator Modal */}
      <YieldCalculatorModal
        isOpen={isCalcOpen}
        onClose={() => setIsCalcOpen(false)}
        pool={calcPool}
      />
    </div>
  );
}
