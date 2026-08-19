import { ExchangeError, toVenueSymbol, type Pair, type SymbolRules, type Ticker } from './types';

/**
 * Binance's unauthenticated market data.
 *
 * Split out because both adapters need it and neither needs credentials for
 * it. The paper adapter uses these endpoints too, which is the point: paper
 * trading runs against real prices, real lot sizes and real minimum notionals,
 * so the only thing that changes on the way to live is where the order goes.
 * A paper mode built on invented prices tells you nothing about whether the
 * strategy would have filled.
 */

const MAINNET = 'https://api.binance.com';
const TESTNET = 'https://testnet.binance.vision';

export function binanceBaseUrl(network: 'testnet' | 'mainnet'): string {
  return network === 'mainnet' ? MAINNET : TESTNET;
}

/**
 * Symbol rules change rarely - a listing or a filter adjustment - and every
 * order needs them. Cached for an hour per symbol; the alternative is an extra
 * round trip on the path where latency costs money.
 */
const RULES_TTL_MS = 60 * 60 * 1000;
const rulesCache = new Map<string, { rules: SymbolRules; at: number }>();

/**
 * Prices are cached for only a few seconds.
 *
 * Long enough to stop a page render fanning out into one request per flow,
 * short enough that an order is never sized against a stale mark. This is a
 * deliberately tight bound: the cost of a stale price here is a mis-sized
 * order, not a slow page.
 */
const TICKER_TTL_MS = 3_000;
const tickerCache = new Map<string, { ticker: Ticker; at: number }>();

/** Visible for tests, and for an operator who has just changed a filter. */
export function clearBinanceCaches(): void {
  rulesCache.clear();
  tickerCache.clear();
}

interface BinanceFilter {
  filterType: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  tickSize?: string;
  minNotional?: string;
  notional?: string;
}

interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: BinanceFilter[];
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      /*
       * 418 and 429 are Binance's rate-limit responses, and 5xx is the venue
       * being unwell. Both are worth retrying; a 400 means the request was
       * wrong and retrying it will be wrong again.
       */
      const retryable =
        response.status === 429 || response.status === 418 || response.status >= 500;
      throw new ExchangeError(
        `Binance responded ${response.status}: ${body.slice(0, 200)}`,
        'binance',
        retryable
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ExchangeError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExchangeError('Binance request timed out.', 'binance', true);
    }
    throw new ExchangeError(
      `Could not reach Binance: ${error instanceof Error ? error.message : 'unknown error'}`,
      'binance',
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

function numberFrom(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Trading rules for one symbol.
 *
 * Binance expresses these as a heterogeneous `filters` array rather than named
 * fields, and the notional filter has been called both MIN_NOTIONAL and
 * NOTIONAL across API versions - both are read, because a deployment pinned to
 * either should work.
 */
export async function getBinanceSymbolRules(
  pair: Pair,
  network: 'testnet' | 'mainnet'
): Promise<SymbolRules> {
  const venueSymbol = toVenueSymbol(pair);
  if (!venueSymbol) {
    throw new ExchangeError(`"${pair}" is not a valid trading pair.`, 'binance');
  }

  const cacheKey = `${network}:${venueSymbol}`;
  const cached = rulesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RULES_TTL_MS) return cached.rules;

  const url = `${binanceBaseUrl(network)}/api/v3/exchangeInfo?symbol=${venueSymbol}`;
  const payload = await fetchJson<{ symbols?: BinanceSymbolInfo[] }>(url);
  const info = payload.symbols?.[0];

  if (!info) {
    throw new ExchangeError(`Binance does not list ${pair}.`, 'binance');
  }
  if (info.status !== 'TRADING') {
    // Halted, delisted, or in an auction. Placing into it fails at the venue.
    throw new ExchangeError(
      `${pair} is not currently trading on Binance (${info.status}).`,
      'binance'
    );
  }

  const byType = new Map(info.filters.map((filter) => [filter.filterType, filter]));
  const lot = byType.get('LOT_SIZE');
  const price = byType.get('PRICE_FILTER');
  const notional = byType.get('NOTIONAL') ?? byType.get('MIN_NOTIONAL');

  const rules: SymbolRules = {
    pair: pair.toUpperCase(),
    venueSymbol: info.symbol,
    baseAsset: info.baseAsset,
    quoteAsset: info.quoteAsset,
    lotStep: numberFrom(lot?.stepSize, 0.00000001),
    minQuantity: numberFrom(lot?.minQty, 0),
    maxQuantity: numberFrom(lot?.maxQty, Number.MAX_SAFE_INTEGER),
    tickSize: numberFrom(price?.tickSize, 0.00000001),
    minNotional: numberFrom(notional?.minNotional ?? notional?.notional, 0),
  };

  rulesCache.set(cacheKey, { rules, at: Date.now() });
  return rules;
}

/**
 * Best bid, best ask and a mark price.
 *
 * bookTicker rather than ticker/price: an order is sized and simulated against
 * the side it would actually cross, and the mid is a fairer mark than the last
 * trade, which can be either side of a wide spread.
 */
export async function getBinanceTicker(
  pair: Pair,
  network: 'testnet' | 'mainnet'
): Promise<Ticker> {
  const venueSymbol = toVenueSymbol(pair);
  if (!venueSymbol) {
    throw new ExchangeError(`"${pair}" is not a valid trading pair.`, 'binance');
  }

  const cacheKey = `${network}:${venueSymbol}`;
  const cached = tickerCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TICKER_TTL_MS) return cached.ticker;

  const url = `${binanceBaseUrl(network)}/api/v3/ticker/bookTicker?symbol=${venueSymbol}`;
  const payload = await fetchJson<{ bidPrice?: string; askPrice?: string }>(url);

  const bid = numberFrom(payload.bidPrice, 0);
  const ask = numberFrom(payload.askPrice, 0);

  if (bid <= 0 || ask <= 0) {
    // An empty book. Sizing an order against a zero price produces an infinite
    // quantity, so this must fail rather than return a plausible-looking zero.
    throw new ExchangeError(`Binance returned no book for ${pair}.`, 'binance', true);
  }

  const ticker: Ticker = {
    pair: pair.toUpperCase(),
    price: (bid + ask) / 2,
    bid,
    ask,
    at: new Date(),
  };

  tickerCache.set(cacheKey, { ticker, at: Date.now() });
  return ticker;
}
