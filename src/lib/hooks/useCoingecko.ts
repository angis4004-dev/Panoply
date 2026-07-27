import { useState, useEffect } from 'react';
import { getCoinPrices, getGlobalMarketData, getTrendingCoins } from '@/lib/coingecko';

/**
 * Hook to get cryptocurrency prices
 */
export function useCoinPrices(ids: string[], vsCurrency = 'usd') {
  const [prices, setPrices] = useState<Record<string, { usd: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchPrices() {
      try {
        setLoading(true);
        const data = await getCoinPrices(ids, vsCurrency);
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
        const data = await getGlobalMarketData();
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
        const data = await getTrendingCoins();
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
