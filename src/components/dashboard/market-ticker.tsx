'use client';

import { useEffect, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

interface CoinPrice {
  usd: number;
  usd_24h_change: number;
}

type PriceData = Record<string, CoinPrice>;

const WATCHED_COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
];

export function MarketTicker() {
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPrices = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const ids = WATCHED_COINS.map((c) => c.id).join(',');
      const res = await fetch(`/api/prices?ids=${ids}`);
      if (res.ok) {
        const data = (await res.json()) as PriceData;
        setPrices(data);
        setLastUpdated(new Date());
      }
    } catch {
      // Soft-fail: keep existing prices or leave null
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchPrices();
    // Auto-refresh spot prices every 60 seconds (aligns with backend CoinGecko cache TTL)
    const interval = setInterval(() => {
      void fetchPrices();
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-ds-border bg-ds-surface-raised/40 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Title / Badge */}
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-ds-text-secondary">
            Spot Market
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>

        {/* Coins Grid / Pills */}
        <div className="flex flex-1 flex-wrap items-center justify-start gap-3 sm:justify-center">
          {loading ? (
            <div className="flex items-center gap-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : prices ? (
            WATCHED_COINS.map((coin) => {
              const data = prices[coin.id];
              if (!data) return null;
              const isPositive = (data.usd_24h_change ?? 0) >= 0;
              const changeSign = isPositive ? '+' : '';

              return (
                <div
                  key={coin.id}
                  className="flex items-center gap-2 rounded-lg border border-ds-border/60 bg-ds-surface px-2.5 py-1 text-xs"
                >
                  <span className="font-semibold text-ds-text">{coin.symbol}</span>
                  <span className="font-mono text-ds-text-secondary">
                    $
                    {data.usd?.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span
                    className={`flex items-center text-[11px] font-mono font-medium ${
                      isPositive ? 'text-ds-value-positive' : 'text-ds-value-negative'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {changeSign}
                    {data.usd_24h_change?.toFixed(2)}%
                  </span>
                </div>
              );
            })
          ) : (
            <span className="text-xs text-ds-text-muted">Market data updating...</span>
          )}
        </div>

        {/* Manual Refresh & Timestamp */}
        <div className="flex items-center justify-end gap-2 text-[11px] text-ds-text-muted">
          {lastUpdated && (
            <span className="hidden xl:inline">
              Updated{' '}
              {lastUpdated.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchPrices(true)}
            disabled={refreshing}
            title="Refresh prices"
            aria-label="Refresh spot prices"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-text-muted transition-colors hover:bg-ds-surface-inset hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
