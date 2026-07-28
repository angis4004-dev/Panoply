import { useState, useEffect } from 'react';

/**
 * Hook to get cryptocurrency prices
 *
 * Fetches through the app's own /api/prices route (server-side) rather than
 * calling CoinGecko directly from the browser - a direct client-side call is
 * subject to the browser's own network/CORS restrictions independent of the
 * server's, and previously caused a "Failed to fetch" loop wherever those
 * restrictions blocked the request.
 */
export function useCoinPrices(ids: string[], vsCurrency = 'usd') {
  const [prices, setPrices] = useState<Record<string, { usd: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchPrices() {
      try {
        setLoading(true);
        // /api/prices always prices in USD server-side; vsCurrency is accepted
        // here for API-compatibility with callers but has no other effect.
        const res = await fetch(`/api/prices?ids=${encodeURIComponent(ids.join(','))}`);
        if (!res.ok) throw new Error(`Failed to fetch prices: ${res.status}`);
        const data = await res.json();
        setPrices(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setPrices({});
      } finally {
        setLoading(false);
      }
    }

    fetchPrices();

    // Refetch every 30 seconds
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [ids, vsCurrency]);

  return { prices, loading, error };
}

/**
 * Hook to get global market data
 */
export function useGlobalMarketData() {
  const [globalData, setGlobalData] = useState({
    total_market_cap: { usd: 0 },
    total_volume: { usd: 0 },
    market_cap_percentage: { usd: 0 },
    market_cap_change_percentage_24h_usd: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null as Error | null);

  useEffect(() => {
    async function fetchGlobalData() {
      try {
        setLoading(true);
        const res = await fetch('/api/global');
        if (!res.ok) throw new Error(`Failed to fetch global market data: ${res.status}`);
        const data = await res.json();
        setGlobalData({
          total_market_cap: { usd: data.total_market_cap.usd ?? 0 },
          total_volume: { usd: data.total_volume.usd ?? 0 },
          market_cap_percentage: { usd: data.market_cap_percentage.usd ?? 0 },
          market_cap_change_percentage_24h_usd: data.market_cap_change_percentage_24h_usd ?? 0,
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setGlobalData({
          total_market_cap: { usd: 0 },
          total_volume: { usd: 0 },
          market_cap_percentage: { usd: 0 },
          market_cap_change_percentage_24h_usd: 0,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchGlobalData();

    // Refetch every 5 minutes
    const interval = setInterval(fetchGlobalData, 300000);
    return () => clearInterval(interval);
  }, []);

  return { globalData, loading, error };
}

/**
 * Hook to get trending coins
 */
export function useTrendingCoins() {
  const [trending, setTrending] = useState({ coins: [] } as {
    coins: Array<{
      item: {
        id: string;
        name: string;
        symbol: string;
        market_cap_rank: number;
        thumb: string;
        price_btc: number;
        score: number;
      };
    }>;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null as Error | null);

  useEffect(() => {
    async function fetchTrending() {
      try {
        setLoading(true);
        const res = await fetch('/api/trending');
        if (!res.ok) throw new Error(`Failed to fetch trending coins: ${res.status}`);
        const data = await res.json();
        setTrending(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setTrending({ coins: [] });
      } finally {
        setLoading(false);
      }
    }

    fetchTrending();

    // Refetch every 30 minutes
    const interval = setInterval(fetchTrending, 1800000);
    return () => clearInterval(interval);
  }, []);

  return { trending, loading, error };
}
