/**
 * CoinGecko API Service
 * Handles all interactions with the CoinGecko API for cryptocurrency data
 */

// CoinGecko API base URL
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

// Cache for storing fetched data to reduce API calls
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute (reduced for more frequent updates as requested)

/**
 * Fetches data from CoinGecko API with caching
 */
async function fetchFromCoingecko<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const cacheKey = `${endpoint}:${JSON.stringify(params)}`;

  // Check if we have cached data that's still fresh
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }

  // Build query string
  const queryString = new URLSearchParams(params).toString();
  const url = `${COINGECKO_API_URL}${endpoint}${queryString ? '?' + queryString : ''}`;

  try {
    // Use native fetch (available in Next.js and modern browsers)
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Add API key if available (for higher rate limits)
        // 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '',
      },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = (await response.json()) as T;

    // Cache the result
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    return data;
  } catch (error) {
    console.error('Error fetching from CoinGecko:', error);

    // Return cached data if available, even if expired
    if (cached) {
      return cached.data as T;
    }

    throw error;
  }
}

/**
 * Get current price for cryptocurrencies
 */
export async function getCoinPrices(
  ids: string[],
  vsCurrency = 'usd'
): Promise<Record<string, { usd: number }>> {
  try {
    const data = await fetchFromCoingecko<Record<string, { usd: number }>>(`/simple/price`, {
      ids: ids.join(','),
      vs_currencies: vsCurrency,
    });
    return data;
  } catch (error) {
    console.error('Failed to fetch coin prices:', error);
    // Return fallback data
    const fallback: Record<string, { usd: number }> = {};
    ids.forEach((id) => {
      fallback[id] = { usd: 0 };
    });
    return fallback;
  }
}

/**
 * Get current prices with 24h change - matches the requested getCurrentPrices function
 */
export async function getCurrentPrices(
  coinIds: string[]
): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  try {
    const data = await fetchFromCoingecko<Record<string, { usd: number; usd_24h_change: number }>>(
      `/simple/price`,
      {
        ids: coinIds.join(','),
        vs_currencies: 'usd',
        include_24hr_change: 'true',
      }
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch current prices with 24h change:', error);
    // Return fallback data
    const fallback: Record<string, { usd: number; usd_24h_change: number }> = {};
    coinIds.forEach((id) => {
      fallback[id] = { usd: 0, usd_24h_change: 0 };
    });
    return fallback;
  }
}

/**
 * Get market chart data - matches the requested getMarketChart function
 * Wraps /coins/{id}/market_chart, returns historical price data for chart rendering
 */
export async function getMarketChart(
  coinId: string,
  days: number
): Promise<{
  prices: [number, number][];
  market_caps?: [number, number][];
  total_volumes?: [number, number][];
}> {
  try {
    const data = await fetchFromCoingecko<{
      prices: [number, number][];
      market_caps?: [number, number][];
      total_volumes?: [number, number][];
    }>(`/coins/${coinId}/market_chart`, {
      vs_currency: 'usd',
      days: days.toString(),
    });
    return data;
  } catch (error) {
    console.error(`Failed to fetch market chart for ${coinId}:`, error);
    // Return fallback data
    return { prices: [] };
  }
}

/**
 * Get coin logo icons for a set of CoinGecko coin ids - used for small
 * network/asset badges. Returns only the fields needed for a badge (image
 * URL + symbol), not price data.
 */
export async function getCoinIcons(
  ids: string[]
): Promise<Record<string, { image: string; symbol: string }>> {
  try {
    const data = await fetchFromCoingecko<Array<{ id: string; symbol: string; image: string }>>(
      `/coins/markets`,
      {
        vs_currency: 'usd',
        ids: ids.join(','),
      }
    );
    const result: Record<string, { image: string; symbol: string }> = {};
    for (const coin of data) {
      result[coin.id] = { image: coin.image, symbol: coin.symbol };
    }
    return result;
  } catch (error) {
    console.error('Failed to fetch coin icons:', error);
    return {};
  }
}

/**
 * Get global market data
 */
export async function getGlobalMarketData(): Promise<{
  total_market_cap: { [key: string]: number };
  total_volume: { [key: string]: number };
  market_cap_percentage: { [key: string]: number };
  market_cap_change_percentage_24h_usd: number;
}> {
  try {
    return await fetchFromCoingecko(`/global`);
  } catch (error) {
    console.error('Failed to fetch global market data:', error);
    return {
      total_market_cap: { usd: 0 },
      total_volume: { usd: 0 },
      market_cap_percentage: { usd: 0 },
      market_cap_change_percentage_24h_usd: 0,
    };
  }
}

/**
 * Get trending cryptocurrencies
 */
export async function getTrendingCoins(): Promise<{
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
}> {
  try {
    return await fetchFromCoingecko(`/search/trending`);
  } catch (error) {
    console.error('Failed to fetch trending coins:', error);
    return { coins: [] };
  }
}
