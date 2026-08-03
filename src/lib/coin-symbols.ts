/**
 * Maps common base-asset ticker symbols to their CoinGecko coin id, so a
 * free-text bot pair like "BTC/USDT" can be resolved to real, live price
 * data. Deliberately not exhaustive - unrecognized symbols resolve to null
 * and callers should treat that pair as untracked rather than guessing.
 */
const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
  TON: 'the-open-network',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
  LTC: 'litecoin',
  SHIB: 'shiba-inu',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  BCH: 'bitcoin-cash',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  FIL: 'filecoin',
  ETC: 'ethereum-classic',
  ICP: 'internet-computer',
  HBAR: 'hedera-hashgraph',
  VET: 'vechain',
  INJ: 'injective-protocol',
  SUI: 'sui',
  PEPE: 'pepe',
  AAVE: 'aave',
  MKR: 'maker',
  ALGO: 'algorand',
  XMR: 'monero',
  EOS: 'eos',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
};

/**
 * Extracts the base asset from a "BASE/QUOTE" style pair (e.g. "BTC/USDT" ->
 * "bitcoin") and resolves it to a CoinGecko coin id. Returns null if the
 * pair can't be parsed or the symbol isn't in the known map.
 */
export function resolveBaseCoinId(pair: string): string | null {
  const base = pair.split('/')[0]?.trim().toUpperCase();
  if (!base) return null;
  return SYMBOL_TO_COINGECKO_ID[base] ?? null;
}

/** Stablecoins excluded from the tradeable pool - a pair is two volatile assets, not an asset against a dollar-pegged coin. */
const STABLECOINS = ['USDT', 'USDC'] as const;

/**
 * Symbols available to pick on either side of a pair - every symbol here
 * resolves to a real CoinGecko id via resolveBaseCoinId, so any pair built
 * from this list is always trackable with live price data. Stablecoins are
 * excluded so a pair is always two different real crypto assets.
 */
export const TRADEABLE_SYMBOLS = Object.keys(SYMBOL_TO_COINGECKO_ID)
  .filter((symbol) => !(STABLECOINS as readonly string[]).includes(symbol))
  .sort();
