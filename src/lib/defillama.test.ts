import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  derivePoolRisk,
  prettyProtocolName,
  isShowablePool,
  selectTopPools,
  getYieldSnapshot,
  __resetYieldCache,
  type LlamaPool,
} from './defillama';

/**
 * The risk band is the part of this module that makes a claim, so it is the
 * part with tests. The rest of the file moves data around; this decides what
 * a user is told about a pool they might put money into.
 */

/** A large, boring, stablecoin lending pool: the calmest thing in the feed. */
function calmPool(overrides: Partial<Parameters<typeof derivePoolRisk>[0]> = {}) {
  return { apy: 4, tvlUsd: 500_000_000, stablecoin: true, ilRisk: 'no', sigma: 0.05, ...overrides };
}

describe('derivePoolRisk', () => {
  it('rates a large, stable, low-yield lending pool Low', () => {
    expect(derivePoolRisk(calmPool())).toBe('Low');
  });

  it('rates a volatile, thin, high-yield LP pool High', () => {
    expect(
      derivePoolRisk({ apy: 110, tvlUsd: 4_000_000, stablecoin: false, ilRisk: 'yes', sigma: 1.3 })
    ).toBe('High');
  });

  /*
   * The floor rule, stated as its own test because it is the one piece of the
   * band that is not additive. A $1m stablecoin pool scores 2 points, which
   * would otherwise band Low - and a position that cannot be exited at size is
   * not low risk however placid its other inputs are.
   */
  it('never rates a pool under $5m Low, however calm its other inputs', () => {
    const thin = calmPool({ tvlUsd: 1_000_000 });
    expect(derivePoolRisk(thin)).toBe('Medium');
  });

  /*
   * Impermanent loss is the heaviest single signal, but it is not decisive on
   * its own, and that is deliberate rather than an oversight. A USDC/USDT pool
   * is flagged `ilRisk: yes` by DefiLlama and the loss between two assets
   * pegged to the same dollar is nominal. Banding it High on the flag alone
   * would put the same badge on a stablecoin pair and on a memecoin LP, which
   * makes the badge worth nothing.
   */
  it('counts impermanent loss, but not against a large stablecoin pair', () => {
    expect(derivePoolRisk(calmPool({ tvlUsd: 100_000_000, ilRisk: 'yes' }))).toBe('Low');
  });

  it('escalates once impermanent loss applies to a volatile pair', () => {
    const volatilePair = calmPool({ tvlUsd: 100_000_000, stablecoin: false });
    expect(derivePoolRisk(volatilePair)).toBe('Low');
    expect(derivePoolRisk({ ...volatilePair, ilRisk: 'yes' })).toBe('Medium');
  });

  it('escalates with yield, holding everything else constant', () => {
    const base = { tvlUsd: 100_000_000, stablecoin: true, ilRisk: 'no', sigma: 0.1 };
    expect(derivePoolRisk({ ...base, apy: 4 })).toBe('Low');
    // 20% on a stablecoin pool is being paid for something.
    expect(derivePoolRisk({ ...base, apy: 60, sigma: 0.9 })).not.toBe('Low');
  });

  it('tolerates a missing sigma rather than treating it as volatile', () => {
    expect(derivePoolRisk(calmPool({ sigma: null }))).toBe('Low');
    expect(derivePoolRisk(calmPool({ sigma: undefined }))).toBe('Low');
  });
});

describe('prettyProtocolName', () => {
  it('title-cases a slug and uppercases version tokens', () => {
    expect(prettyProtocolName('uniswap-v3')).toBe('Uniswap V3');
    expect(prettyProtocolName('aerodrome-slipstream')).toBe('Aerodrome Slipstream');
  });

  it('drops a trailing generic suffix', () => {
    expect(prettyProtocolName('raydium-amm')).toBe('Raydium');
    expect(prettyProtocolName('orca-dex')).toBe('Orca');
    expect(prettyProtocolName('centrifuge-protocol')).toBe('Centrifuge');
  });

  it('keeps a suffix that is part of the name rather than a category', () => {
    expect(prettyProtocolName('strata-markets')).toBe('Strata Markets');
  });

  it('leaves a single-word slug alone', () => {
    expect(prettyProtocolName('pendle')).toBe('Pendle');
  });
});

function pool(overrides: Partial<LlamaPool> = {}): LlamaPool {
  return {
    pool: 'id-1',
    project: 'somewhere',
    chain: 'Ethereum',
    symbol: 'USDC',
    apy: 10,
    tvlUsd: 50_000_000,
    stablecoin: true,
    ilRisk: 'no',
    outlier: false,
    count: 400,
    sigma: 0.1,
    ...overrides,
  };
}

describe('isShowablePool', () => {
  /*
   * Each of these is a pool that would otherwise reach a dashboard people read
   * as a suggestion. The 40,000% case is the one that matters: it is
   * arithmetically real and completely meaningless.
   */
  it('rejects pools too small to exit', () => {
    expect(isShowablePool(pool({ tvlUsd: 200_000 }))).toBe(false);
  });

  it('rejects launch-incentive APYs', () => {
    expect(isShowablePool(pool({ apy: 40_000 }))).toBe(false);
  });

  it('rejects pools with no meaningful history', () => {
    expect(isShowablePool(pool({ count: 3 }))).toBe(false);
  });

  it('rejects pools DefiLlama itself flags as outliers', () => {
    expect(isShowablePool(pool({ outlier: true }))).toBe(false);
  });

  it('rejects zero and null APYs', () => {
    expect(isShowablePool(pool({ apy: 0 }))).toBe(false);
    expect(isShowablePool(pool({ apy: null }))).toBe(false);
  });

  it('accepts a large pool with real history', () => {
    expect(isShowablePool(pool())).toBe(true);
  });
});

describe('selectTopPools', () => {
  it('returns one row per protocol, keeping the best-paying pool', () => {
    const rows = selectTopPools(
      [
        pool({ pool: 'a', project: 'uniswap-v3', symbol: 'LOW', apy: 5 }),
        pool({ pool: 'b', project: 'uniswap-v3', symbol: 'HIGH', apy: 25 }),
        pool({ pool: 'c', project: 'curve-dex', symbol: 'CRV', apy: 9 }),
      ],
      10
    );
    expect(rows).toHaveLength(2);
    const uni = rows.find((r) => r.protocol === 'Uniswap V3');
    expect(uni?.symbol).toBe('HIGH');
  });

  it('sorts by APY descending and honours the limit', () => {
    const rows = selectTopPools(
      [
        pool({ pool: 'a', project: 'one', apy: 5 }),
        pool({ pool: 'b', project: 'two', apy: 30 }),
        pool({ pool: 'c', project: 'three', apy: 12 }),
      ],
      2
    );
    expect(rows.map((r) => r.apy)).toEqual([30, 12]);
  });

  it('carries a risk band and the real TVL onto every row', () => {
    const [row] = selectTopPools(
      [pool({ apy: 90, tvlUsd: 2_000_000, stablecoin: false, ilRisk: 'yes', sigma: 1.4 })],
      5
    );
    expect(row.risk).toBe('High');
    expect(row.tvlUsd).toBe(2_000_000);
    expect(row.impermanentLoss).toBe(true);
  });

  it('drops unshowable pools instead of ranking them', () => {
    const rows = selectTopPools(
      [pool({ project: 'scam', apy: 40_000, tvlUsd: 50_000, count: 2 }), pool({ project: 'real' })],
      10
    );
    expect(rows.map((r) => r.protocol)).toEqual(['Real']);
  });
});

/**
 * The failure path, which is the whole reason this module replaced the old
 * one. Stale data is acceptable; stale data that presents itself as current
 * is what was wrong before.
 */
describe('getYieldSnapshot', () => {
  afterEach(() => {
    __resetYieldCache();
    vi.unstubAllGlobals();
    // restoreAllMocks as well as unstubAllGlobals: the TTL helper spies on
    // Date.now, which is not a stubbed global, and a shifted clock leaking
    // into the next test would make its cache expire before it ran.
    vi.restoreAllMocks();
  });

  const goodResponse = (pools: LlamaPool[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: pools }),
  });

  const livePool = (overrides: Partial<LlamaPool> = {}): LlamaPool => ({
    pool: 'p1',
    project: 'aave-v3',
    chain: 'Ethereum',
    symbol: 'USDC',
    apy: 6,
    tvlUsd: 900_000_000,
    stablecoin: true,
    ilRisk: 'no',
    outlier: false,
    count: 400,
    sigma: 0.1,
    ...overrides,
  });

  it('reports a fresh snapshot as not stale', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => goodResponse([livePool()]))
    );
    const snapshot = await getYieldSnapshot();
    expect(snapshot?.stale).toBe(false);
    expect(snapshot?.pools[0].protocol).toBe('Aave V3');
  });

  it('serves the cache without refetching inside the TTL', async () => {
    const fetchMock = vi.fn(async () => goodResponse([livePool()]));
    vi.stubGlobal('fetch', fetchMock);
    await getYieldSnapshot();
    await getYieldSnapshot();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /*
   * The important one. A failed refresh must keep serving the last good data
   * *and say so* — the UI prints "refresh failed, showing the last good data"
   * off this flag, and without it the panel would quietly show old rates
   * exactly as the MongoDB version did.
   */
  it('falls back to the last good snapshot and marks it stale', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(goodResponse([livePool({ apy: 6 })]))
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const fresh = await getYieldSnapshot();
    expect(fresh?.stale).toBe(false);

    __resetYieldCacheTtlByAdvancingTime();
    const stale = await getYieldSnapshot();
    expect(stale?.stale).toBe(true);
    expect(stale?.pools[0].apy).toBe(6);
    expect(stale?.asOf).toBe(fresh?.asOf);
  });

  it('returns null when it fails with nothing cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    expect(await getYieldSnapshot()).toBeNull();
  });

  it('keeps the last good data when the upstream shape changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(goodResponse([livePool()]))
      // A 200 carrying no usable pools: the shape moved under us. Serving it
      // would silently empty the panel and look like a market with no yields.
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await getYieldSnapshot();
    __resetYieldCacheTtlByAdvancingTime();
    const snapshot = await getYieldSnapshot();
    expect(snapshot?.stale).toBe(true);
    expect(snapshot?.pools).toHaveLength(1);
  });
});

/**
 * Pushes the clock well past the cache TTL so the next call attempts a refresh.
 *
 * A full day, not "the TTL plus a minute". These tests assert what happens
 * *after* the cache expires, not what the expiry period is - and when the TTL
 * moved from 10 minutes to 30, a helper tuned to 11 minutes silently stopped
 * expiring anything, so two tests began passing a fresh snapshot through
 * assertions written for a stale one. A jump nothing can outgrow keeps the
 * behaviour under test independent of the constant.
 */
function __resetYieldCacheTtlByAdvancingTime() {
  const oneDay = 24 * 60 * 60 * 1000;
  const shifted = Date.now() + oneDay;
  vi.spyOn(Date, 'now').mockImplementation(() => shifted);
}
