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
