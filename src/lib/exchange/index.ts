import { BinanceAdapter } from './binance';
import { exchangeConfigFromEnv, type ExchangeConfig } from './config';
import { PaperAdapter } from './paper';
import type { ExchangeAdapter } from './types';

/**
 * The one place an adapter is chosen.
 *
 * Every caller asks for `getExchange()` and gets whatever the environment
 * says, so no route, job or strategy can construct a live adapter for itself.
 *
 * The fallbacks are all toward paper. A misconfigured live setup trades on
 * paper and logs why; it never falls through to mainnet. That direction is not
 * arbitrary - the cost of wrongly trading paper is a missed opportunity, and
 * the cost of wrongly trading live is customer money.
 */

let cached: { adapter: ExchangeAdapter; config: ExchangeConfig } | null = null;

export function getExchange(env: NodeJS.ProcessEnv = process.env): {
  adapter: ExchangeAdapter;
  config: ExchangeConfig;
} {
  if (cached) return cached;

  const config = exchangeConfigFromEnv(env);

  if (config.liveRefusedReason) {
    // Loud on purpose. A platform that silently stops trading live is as bad
    // as one that silently starts.
    console.error(`[exchange] ${config.liveRefusedReason}`);
  }

  let adapter: ExchangeAdapter;

  if (config.mode === 'binance') {
    try {
      adapter = new BinanceAdapter({
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        network: config.network,
        isLive: config.isLive,
      });
    } catch (error) {
      // Missing credentials on testnet. Paper still needs none, and market
      // data is public, so the platform stays usable.
      console.error(
        `[exchange] Falling back to paper: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      adapter = new PaperAdapter({
        feeRate: config.paperFeeRate,
        slippageRate: config.paperSlippageRate,
        network: config.network,
      });
    }
  } else {
    adapter = new PaperAdapter({
      feeRate: config.paperFeeRate,
      slippageRate: config.paperSlippageRate,
      // Mainnet public data even in paper mode: testnet prices drift from
      // reality, and paper is only useful if the prices are the real ones.
      network: 'mainnet',
    });
  }

  cached = { adapter, config };
  return cached;
}

/** Visible for tests, and after an environment change in development. */
export function resetExchange(): void {
  cached = null;
}

export * from './types';
export { exchangeConfigFromEnv, describeExchangeConfig } from './config';
export type { ExchangeConfig } from './config';
export { PaperAdapter } from './paper';
export { BinanceAdapter } from './binance';
