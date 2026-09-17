'use client';

import { useEffect, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Spot prices, on one line.
 *
 * It used to be a bordered card three rows tall: a header with the label and a
 * "Live" pill, a wrapping set of price chips, and a refresh control beneath.
 * On the Overview - a page that already asks for a lot of scrolling - that is
 * a lot of height for a reference figure nobody came to the dashboard to read.
 *
 * So: a plain strip under the page title, closed by a hairline rather than a
 * box, with the label, the prices and the refresh on the single line.
 *
 * Narrow screens cannot fit three prices beside the label, so the prices drift
 * across instead of wrapping (.ticker-track in styles/tailwind.css). The track
 * holds the list twice so the loop has no visible seam. Under
 * prefers-reduced-motion the drift stops and the row becomes a normal
 * horizontal scroll, which is also what happens if the animation is
 * unsupported - the prices stay reachable either way.
 */

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

function Price({ symbol, data }: { symbol: string; data: CoinPrice }) {
  const isPositive = (data.usd_24h_change ?? 0) >= 0;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="font-semibold text-ds-text">{symbol}</span>
      <span className="font-mono text-ds-text-secondary">
        $
        {data.usd?.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
      <span
        className={`flex items-center font-mono text-[11px] font-medium ${
          isPositive ? 'text-ds-value-positive' : 'text-ds-value-negative'
        }`}
      >
        {isPositive ? (
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowDownRight className="h-3 w-3" aria-hidden />
        )}
        {isPositive ? '+' : ''}
        {data.usd_24h_change?.toFixed(2)}%
      </span>
    </span>
  );
}

export function MarketTicker() {
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPrices = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const ids = WATCHED_COINS.map((c) => c.id).join(',');
      const res = await fetch(`/api/prices?ids=${ids}`);
      if (res.ok) {
        const data = (await res.json()) as PriceData;
        setPrices(data);
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

  const available = prices
    ? WATCHED_COINS.filter((coin) => prices[coin.id]).map((coin) => ({
        ...coin,
        data: prices[coin.id],
      }))
    : [];

  return (
    <div className="mb-6 flex items-center gap-3 border-b border-ds-border pb-2">
      <span className="flex shrink-0 items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-ds-text-secondary">
          Spot market
        </span>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse"
          aria-hidden
        />
        <span className="sr-only">Live prices</span>
      </span>

      <div className="ticker-window min-w-0 flex-1">
        {loading ? (
          <div className="flex items-center gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-28" />
            ))}
          </div>
        ) : available.length > 0 ? (
          <div className="ticker-track flex items-center gap-5">
            {available.map((coin) => (
              <Price key={coin.id} symbol={coin.symbol} data={coin.data} />
            ))}
            {/* The second pass is what makes the loop seamless. It repeats
                what the first pass already said, so it is hidden from
                assistive technology rather than read out twice. */}
            <span className="ticker-repeat flex items-center gap-5" aria-hidden>
              {available.map((coin) => (
                <Price key={`${coin.id}-repeat`} symbol={coin.symbol} data={coin.data} />
              ))}
            </span>
          </div>
        ) : (
          <span className="text-xs text-ds-text-muted">Market data updating…</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => void fetchPrices(true)}
        disabled={refreshing}
        title="Refresh prices"
        aria-label="Refresh spot prices"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ds-text-muted transition-colors hover:bg-ds-surface-inset hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
      </button>
    </div>
  );
}
