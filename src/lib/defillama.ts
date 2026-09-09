/**
 * Live yield data, from DefiLlama.
 *
 * What this replaces: eight rows inserted into MongoDB on 2026-07-22 and never
 * touched again. Every one carried the same `createdAt` and `updatedAt`, the
 * collection had no writer anywhere in the codebase, and the dashboard
 * presented "85.6% APY" as though it were a rate rather than a number somebody
 * had typed a month earlier. A yield figure that cannot change is not data.
 *
 * DefiLlama is the right source for this: free, no key, no account, and it is
 * the reference aggregator the DeFi industry itself cites. That matters on a
 * platform whose hosting budget is measured in tens of thousands of naira a
 * year - the alternative sources all want a paid plan for the same numbers.
 *
 * Nothing here recommends a pool. It reports what a pool pays and what its
 * observable characteristics are, and every field shown to a user comes back
 * from the API rather than from us.
 */

const POOLS_URL = 'https://yields.llama.fi/pools';

/**
 * Thirty minutes.
 *
 * DefiLlama recomputes hourly, so a shorter window re-downloads the whole feed
 * to receive numbers that have not changed. The feed is 2.3MB gzipped and
 * 11.5MB parsed, and this platform is deployed on a budget measured in tens of
 * thousands of naira a year - halving the refresh rate is free, and nothing on
 * screen is meaningfully staler for it. A pool's APY does not move in a way
 * anybody can act on inside half an hour.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Twenty seconds, which is generous on purpose.
 *
 * This was 8s, and it was wrong: the first request against a cold server timed
 * out and returned 503, because the 11.5MB decompress-and-parse lands while
 * the process is still compiling everything else. Measured cost of the fetch
 * alone is 1.4-4.3s, so the headroom is for contention rather than for the
 * network.
 *
 * The cost of being too generous is one slow first request. The cost of being
 * too tight is the first visitor after every deploy seeing an error, which is
 * exactly what happened.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/*
 * Pool quality filters.
 *
 * The raw feed is ~17,000 pools and sorting it by APY alone puts a $40,000
 * pool paying 40,000% at the top of the dashboard. Every threshold below
 * exists to keep that class of pool off a screen that people read as a
 * suggestion, whatever it is labelled.
 */

/** Below this there is not enough liquidity to get a real position back out. */
const MIN_TVL_USD = 1_000_000;

/**
 * An APY above this is a launch incentive, not a yield.
 *
 * It is arithmetically real for as long as the emissions last, and it is
 * meaningless as a forward-looking number. Excluding them costs nothing that
 * anybody should be acting on.
 */
const MAX_PLAUSIBLE_APY = 200;

/** DefiLlama's own count of daily observations: 30 means a month of history. */
const MIN_OBSERVATIONS = 30;

/** Thin pools are never "Low", whatever else is true of them. */
const THIN_TVL_USD = 5_000_000;

export type YieldRisk = 'Low' | 'Medium' | 'High';

/** The subset of DefiLlama's pool shape this module relies on. */
export interface LlamaPool {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  apy: number | null;
  tvlUsd: number | null;
  stablecoin?: boolean;
  ilRisk?: string;
  exposure?: string;
  outlier?: boolean;
  count?: number;
  /** Standard deviation of the pool's APY. DefiLlama's own volatility measure. */
  sigma?: number | null;
}

export interface YieldPool {
  id: string;
  protocol: string;
  chain: string;
  /** What the pool is made of, e.g. "WSOL-USDC". Context the old data lacked. */
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: YieldRisk;
  stablecoin: boolean;
  /** True when the position can lose value against simply holding the assets. */
  impermanentLoss: boolean;
}

export interface YieldSnapshot {
  pools: YieldPool[];
  /** When the data was actually fetched, so the UI can say so. */
  asOf: string;
  /** True when a refresh failed and this is the last good response instead. */
  stale: boolean;
}

/**
 * A pool's risk band, derived only from what DefiLlama reports.
 *
 * Five observable properties, each worth points, banded at the end. This is
 * deliberately not a proprietary "score": every input is a field in the API
 * response, the weights are visible here, and anyone can check the arithmetic.
 * A number nobody can reproduce is the thing this codebase already removed
 * once from the dashboard.
 *
 * It describes the pool, not what anybody should do about it.
 */
export function derivePoolRisk(pool: {
  apy: number;
  tvlUsd: number;
  stablecoin?: boolean;
  ilRisk?: string;
  sigma?: number | null;
}): YieldRisk {
  let points = 0;

  // Impermanent loss: the position can be worth less than having held the
  // tokens, independently of anything going wrong. The single biggest
  // difference between a lending position and an LP position.
  if (pool.ilRisk === 'yes') points += 2;

  // Price exposure stacked on top of whatever the pool itself does.
  if (!pool.stablecoin) points += 1;

  // Exit liquidity.
  if (pool.tvlUsd < THIN_TVL_USD) points += 2;
  else if (pool.tvlUsd < 25_000_000) points += 1;

  // How much the advertised rate actually moves. A high but steady yield is a
  // different proposition from the same yield arriving as a spike.
  const sigma = pool.sigma ?? 0;
  if (sigma > 1) points += 2;
  else if (sigma > 0.5) points += 1;

  // Yield is compensation. A pool paying five times the going rate is being
  // paid five times as much to take something on.
  if (pool.apy > 50) points += 2;
  else if (pool.apy > 20) points += 1;

  if (points >= 6) return 'High';
  if (points >= 3) return 'Medium';

  /*
   * A floor, not a weight. A $1m stablecoin pool scores 2 and would otherwise
   * read "Low", but a position that cannot be exited at size is not low risk
   * no matter how placid its inputs look. Expressed as a rule because that is
   * what it is - tuning the TVL weight upwards to achieve the same thing would
   * have hidden the reasoning inside a number.
   */
  return pool.tvlUsd < THIN_TVL_USD ? 'Medium' : 'Low';
}

/**
 * "uniswap-v3" -> "Uniswap V3".
 *
 * DefiLlama's project field is a slug. Rendering it raw puts "raydium-amm"
 * next to a hand-written "Aave" in the same column.
 */
export function prettyProtocolName(slug: string): string {
  // Generic suffixes that add nothing to a protocol's name on screen.
  const NOISE = new Set(['amm', 'dex', 'protocol', 'finance']);

  const tokens = slug
    .split('-')
    .filter(Boolean)
    .filter((token, index, all) => !(NOISE.has(token) && index === all.length - 1));

  if (tokens.length === 0) return slug;

  return tokens
    .map((token) =>
      // Version numbers and short tokens are acronyms or labels, not words:
      // "V3", "CL". Title-casing them produces "V3" -> "V3" but "cl" -> "Cl".
      /^v\d+$/.test(token) || token.length <= 2
        ? token.toUpperCase()
        : token.charAt(0).toUpperCase() + token.slice(1)
    )
    .join(' ');
}

/** Keeps a pool only if it is large enough, old enough and sane enough to show. */
export function isShowablePool(pool: LlamaPool): boolean {
  return (
    typeof pool.apy === 'number' &&
    pool.apy > 0 &&
    pool.apy <= MAX_PLAUSIBLE_APY &&
    typeof pool.tvlUsd === 'number' &&
    pool.tvlUsd >= MIN_TVL_USD &&
    pool.outlier !== true &&
    (pool.count ?? 0) >= MIN_OBSERVATIONS
  );
}

/**
 * Best pool per protocol, highest APY first.
 *
 * Without the per-protocol collapse the list is nine Uniswap pairs, which is a
 * worse answer to "where can I earn" than nine different venues.
 */
export function selectTopPools(pools: LlamaPool[], limit: number): YieldPool[] {
  const best = new Map<string, LlamaPool>();

  for (const pool of pools) {
    if (!isShowablePool(pool)) continue;
    const current = best.get(pool.project);
    if (!current || (pool.apy ?? 0) > (current.apy ?? 0)) best.set(pool.project, pool);
  }

  return [...best.values()]
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
    .slice(0, limit)
    .map((pool) => ({
      id: pool.pool,
      protocol: prettyProtocolName(pool.project),
      chain: pool.chain,
      symbol: pool.symbol,
      apy: Math.round((pool.apy ?? 0) * 10) / 10,
      tvlUsd: pool.tvlUsd ?? 0,
      risk: derivePoolRisk({
        apy: pool.apy ?? 0,
        tvlUsd: pool.tvlUsd ?? 0,
        stablecoin: pool.stablecoin,
        ilRisk: pool.ilRisk,
        sigma: pool.sigma,
      }),
      stablecoin: Boolean(pool.stablecoin),
      impermanentLoss: pool.ilRisk === 'yes',
    }));
}

let cache: { snapshot: YieldSnapshot; fetchedAt: number } | null = null;

/** Test seam. Lets the suite exercise the cache without reaching the network. */
export function __resetYieldCache(): void {
  cache = null;
}

/**
 * The snapshot the API route serves.
 *
 * On a failed refresh this returns the last good response marked `stale`
 * rather than an error, because a rate from ten minutes ago is worth more to
 * somebody than an empty panel - but it is marked, and the UI says so. That
 * is the entire difference between this and what it replaced: the old data was
 * also stale, and nothing anywhere admitted it.
 */
export async function getYieldSnapshot(limit = 25): Promise<YieldSnapshot | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.snapshot;
  }

  try {
    const response = await fetch(POOLS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`DefiLlama responded ${response.status}`);

    const payload = (await response.json()) as { data?: LlamaPool[] };
    if (!Array.isArray(payload.data)) throw new Error('DefiLlama returned no pool array');

    const snapshot: YieldSnapshot = {
      pools: selectTopPools(payload.data, limit),
      asOf: new Date().toISOString(),
      stale: false,
    };

    // An empty result after filtering means the upstream shape changed under
    // us. Serving it would silently empty the panel; keeping the last good
    // snapshot and reporting stale is the honest failure.
    if (snapshot.pools.length === 0) throw new Error('DefiLlama returned no showable pools');

    cache = { snapshot, fetchedAt: Date.now() };
    return snapshot;
  } catch (error) {
    console.error('[yield] refresh failed:', error instanceof Error ? error.message : error);
    return cache ? { ...cache.snapshot, stale: true } : null;
  }
}
