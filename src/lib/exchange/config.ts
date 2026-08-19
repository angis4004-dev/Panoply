/**
 * Which venue the platform trades on, and whether it may move real money.
 *
 * Every decision that could turn a paper trade into a real one is made here,
 * once, from environment variables. Not from the database and never from a
 * request: an admin console with a "go live" button is a single compromised
 * session away from trading customer funds, whereas an environment variable
 * needs deploy access.
 *
 * ## Three keys to go live
 *
 * Reaching mainnet requires all of:
 *
 *   EXCHANGE_MODE=binance             pick a real venue
 *   EXCHANGE_NETWORK=mainnet          pick the real network
 *   EXCHANGE_ALLOW_LIVE_TRADING=true  say it out loud
 *
 * Two of those would be enough to describe the intent. The third exists
 * because the first two are things someone might set while wiring up
 * credentials, and neither reads as "start trading real money now". Any one
 * of them missing falls back to paper, and the fallback is logged rather than
 * silent - a platform that quietly stops trading is as bad as one that
 * quietly starts.
 *
 * Credentials are read here and passed to the adapter. They are never
 * returned by an API, never written to the database, and never logged.
 */

export type ExchangeMode = 'paper' | 'binance';
export type ExchangeNetwork = 'testnet' | 'mainnet';

export interface ExchangeConfig {
  mode: ExchangeMode;
  network: ExchangeNetwork;
  /** True only when a real venue, mainnet, and the explicit opt-in all agree. */
  isLive: boolean;
  apiKey: string;
  apiSecret: string;
  /**
   * Why the platform is not live, when it is not. Null when live, or when
   * paper was the deliberate choice. Present when live was *attempted* and
   * refused, which is the case worth surfacing in the console.
   */
  liveRefusedReason: string | null;
  /** Taker fee as a fraction, for the paper adapter to model. */
  paperFeeRate: number;
  /** Slippage the paper adapter applies against the mark, as a fraction. */
  paperSlippageRate: number;
}

/**
 * Only an explicit affirmative counts.
 *
 * The string "false" is truthy in JavaScript, and this gates real money.
 */
function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value.trim());
  // A negative fee or slippage would model the venue paying the platform to
  // trade, which flatters every backtest run through the paper adapter.
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0.1) return fallback;
  return parsed;
}

export function exchangeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ExchangeConfig {
  const rawMode = (env.EXCHANGE_MODE ?? 'paper').trim().toLowerCase();
  const mode: ExchangeMode = rawMode === 'binance' ? 'binance' : 'paper';

  const rawNetwork = (env.EXCHANGE_NETWORK ?? 'testnet').trim().toLowerCase();
  const network: ExchangeNetwork = rawNetwork === 'mainnet' ? 'mainnet' : 'testnet';

  const apiKey = (env.EXCHANGE_API_KEY ?? '').trim();
  const apiSecret = (env.EXCHANGE_API_SECRET ?? '').trim();
  const allowLive = isTruthy(env.EXCHANGE_ALLOW_LIVE_TRADING);

  let liveRefusedReason: string | null = null;
  let isLive = false;

  if (mode === 'binance' && network === 'mainnet') {
    if (!allowLive) {
      liveRefusedReason =
        'EXCHANGE_MODE and EXCHANGE_NETWORK are set for mainnet but EXCHANGE_ALLOW_LIVE_TRADING is not true. Trading on testnet instead.';
    } else if (!apiKey || !apiSecret) {
      liveRefusedReason =
        'Live trading is enabled but EXCHANGE_API_KEY or EXCHANGE_API_SECRET is missing. Trading on testnet instead.';
    } else {
      isLive = true;
    }
  }

  return {
    mode,
    // A refused live attempt lands on testnet, not on mainnet-without-consent.
    network: isLive ? 'mainnet' : mode === 'binance' ? 'testnet' : network,
    isLive,
    apiKey,
    apiSecret,
    liveRefusedReason,
    // Binance spot taker is 0.1%. A default that matches the real venue means
    // paper results are not quietly better than live ones.
    paperFeeRate: parseRate(env.EXCHANGE_PAPER_FEE_RATE, 0.001),
    paperSlippageRate: parseRate(env.EXCHANGE_PAPER_SLIPPAGE_RATE, 0.0005),
  };
}

/**
 * A description safe to show an operator.
 *
 * Deliberately returns no credential material, not even a masked prefix. A
 * masked key is still a key fragment, and this ends up in a console page and
 * probably in a screenshot.
 */
export function describeExchangeConfig(config: ExchangeConfig): {
  mode: ExchangeMode;
  network: ExchangeNetwork;
  isLive: boolean;
  hasCredentials: boolean;
  liveRefusedReason: string | null;
} {
  return {
    mode: config.mode,
    network: config.network,
    isLive: config.isLive,
    hasCredentials: Boolean(config.apiKey && config.apiSecret),
    liveRefusedReason: config.liveRefusedReason,
  };
}
