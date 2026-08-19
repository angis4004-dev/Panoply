/**
 * The contract every exchange adapter satisfies.
 *
 * Provider-agnostic on purpose. The platform talks to this interface and never
 * to Binance, so a second venue is a new file rather than a rewrite, and the
 * paper adapter is a first-class implementation rather than a flag threaded
 * through live code.
 *
 * ## Precision
 *
 * Prices and quantities cross this boundary as numbers, not strings or
 * decimals. That is a deliberate, bounded choice: float64 carries ~15
 * significant decimal digits, and realistic crypto values sit well inside it
 * (a BTC price of 100000.12345678 is 14 digits; a quantity of 0.00012345 is
 * 8). What float64 is bad at is accumulating thousands of small additions, so
 * nothing here accumulates - realized P&L is derived from stored fills each
 * time rather than incremented, and the only place a running total exists is
 * the ledger, which is integer minor units.
 *
 * Money that reaches the ledger is always integer minor units. The conversion
 * happens once, at the boundary, in toMinorUnits.
 */

/** A platform-side trading pair, e.g. 'ETH/USDT'. Always base/quote, uppercase. */
export type Pair = string;

export type OrderSide = 'buy' | 'sell';

/**
 * Only market and limit. The exotic types are where adapters diverge most and
 * the strategies here need neither; adding one later is additive.
 */
export type OrderKind = 'market' | 'limit';

export type OrderStatus =
  /** Accepted by the venue, nothing filled. */
  | 'open'
  /** Some quantity filled, order still live. */
  | 'partial'
  /** Fully filled. */
  | 'filled'
  | 'cancelled'
  /** The venue refused it. `rejectReason` says why. */
  | 'rejected';

export interface OrderRequest {
  pair: Pair;
  side: OrderSide;
  kind: OrderKind;
  /** Base-asset quantity. Must already satisfy the symbol's lot step. */
  quantity: number;
  /** Required for limit orders, ignored for market. */
  limitPrice?: number;
  /**
   * Caller-supplied id, echoed back by the venue.
   *
   * The only thing that makes order placement safe to retry. A network timeout
   * on placement is ambiguous - the order may or may not exist - and without a
   * client id the recovery is "list recent orders and guess". With one, the
   * retry either creates the order or is rejected as a duplicate.
   */
  clientOrderId: string;
}

export interface Fill {
  /** Venue's fill id, unique per venue. */
  fillId: string;
  orderId: string;
  clientOrderId: string;
  pair: Pair;
  side: OrderSide;
  quantity: number;
  price: number;
  /** Fee charged, in whatever asset the venue took it in. */
  feeAmount: number;
  feeAsset: string;
  filledAt: Date;
}

export interface OrderResult {
  orderId: string;
  clientOrderId: string;
  status: OrderStatus;
  /** Cumulative base quantity filled so far. */
  filledQuantity: number;
  /** Volume-weighted average fill price, or null if nothing filled. */
  averagePrice: number | null;
  rejectReason?: string;
  fills: Fill[];
}

export interface Ticker {
  pair: Pair;
  /** Last traded price. */
  price: number;
  /** Best bid and ask, when the venue exposes them. */
  bid?: number;
  ask?: number;
  at: Date;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

/**
 * The venue's trading rules for one symbol.
 *
 * These are the cause of most first-time order rejections. A quantity with too
 * many decimals, a price off the tick grid, or a notional under the minimum
 * are all rejected by the venue, and the error messages are famously unhelpful.
 * Fetching them and rounding locally turns a runtime rejection into arithmetic.
 */
export interface SymbolRules {
  pair: Pair;
  /** Venue's own symbol string, e.g. 'ETHUSDT'. */
  venueSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** Quantity must be a multiple of this. */
  lotStep: number;
  minQuantity: number;
  maxQuantity: number;
  /** Price must be a multiple of this. */
  tickSize: number;
  /** quantity * price must be at least this. The one that catches small allocations. */
  minNotional: number;
}

/**
 * What the platform can ask a venue to do.
 *
 * Deliberately small. Everything the strategies need and nothing else - a
 * wider surface is a wider thing to implement correctly for each new venue,
 * and an untested adapter method is worse than an absent one.
 */
export interface ExchangeAdapter {
  /** Human-readable, for logs and the console. */
  readonly name: string;
  /**
   * Whether orders placed here move real money. The single most important
   * property in this file: risk checks, the console and the audit log all
   * branch on it, and it is a property of the adapter rather than a
   * configuration flag read separately at each site.
   */
  readonly isLive: boolean;

  getSymbolRules(pair: Pair): Promise<SymbolRules>;
  getTicker(pair: Pair): Promise<Ticker>;
  getBalances(): Promise<Balance[]>;
  placeOrder(request: OrderRequest): Promise<OrderResult>;
  getOrder(pair: Pair, clientOrderId: string): Promise<OrderResult | null>;
  cancelOrder(pair: Pair, clientOrderId: string): Promise<void>;
}

/** Raised when a venue refuses an order for a reason worth surfacing. */
export class ExchangeError extends Error {
  constructor(
    message: string,
    readonly venue: string,
    readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ExchangeError';
  }
}

// --- Symbols ---------------------------------------------------------------

/**
 * Split a platform pair into its two assets.
 *
 * Returns null rather than throwing for a malformed pair: these arrive from
 * user-created bots, and a bad one should be a validation message rather than
 * a 500.
 */
export function splitPair(pair: Pair): { base: string; quote: string } | null {
  const parts = pair.trim().toUpperCase().split('/');
  if (parts.length !== 2) return null;
  const [base, quote] = parts;
  if (!base || !quote) return null;
  if (!/^[A-Z0-9]{2,12}$/.test(base) || !/^[A-Z0-9]{2,12}$/.test(quote)) return null;
  return { base, quote };
}

/**
 * Platform pair to a venue symbol, for venues that simply concatenate.
 *
 * Binance, Bybit and OKX-spot all use BASEQUOTE. A venue that does not - Kraken
 * renames BTC to XBT, some use a dash - overrides this in its own adapter
 * rather than teaching this function about every exception.
 */
export function toVenueSymbol(pair: Pair): string | null {
  const split = splitPair(pair);
  return split ? `${split.base}${split.quote}` : null;
}

// --- Rounding --------------------------------------------------------------

/**
 * Decimal places implied by a step size, e.g. 0.001 -> 3.
 *
 * Derived from the string form rather than by taking a logarithm: log10(0.001)
 * is -2.9999999999999996 in float64, and Math.round hides that only until a
 * step where it does not.
 */
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = step.toExponential();
  const [mantissa, exponent] = text.split('e');
  const exp = Number(exponent);
  const mantissaDecimals = (mantissa.split('.')[1] ?? '').length;
  return Math.max(0, mantissaDecimals - exp);
}

/**
 * Round a value DOWN to a multiple of `step`.
 *
 * Down, never nearest. Rounding a sell quantity up produces an order for more
 * of an asset than is held, and rounding a buy up spends more quote currency
 * than was allocated. Both are rejected by the venue at best and an overdraw
 * at worst, so the bias is always toward doing slightly less than asked.
 *
 * The multiply-round-divide dance avoids the float error in a bare
 * `Math.floor(value / step) * step`, which for 0.29 / 0.01 yields 28.999...
 * and floors to 28, losing a whole step.
 */
export function roundDownToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  const decimals = decimalsForStep(step);
  const factor = Math.pow(10, decimals);
  const scaledStep = Math.round(step * factor);
  if (scaledStep <= 0) return 0;
  const scaledValue = Math.floor(Number((value * factor).toFixed(6)));
  const rounded = Math.floor(scaledValue / scaledStep) * scaledStep;
  return Number((rounded / factor).toFixed(decimals));
}

/** Round a price to the venue's tick grid. Down, for the same reason. */
export function roundPriceToTick(price: number, tickSize: number): number {
  return roundDownToStep(price, tickSize);
}

/**
 * Why an order cannot be placed as specified, or null if it can.
 *
 * Run before anything reaches a venue. Each of these is a rejection the
 * exchange would issue anyway, caught here where the message can name the
 * actual limit and the caller can adjust rather than retry blindly.
 */
export function checkOrderAgainstRules(
  rules: SymbolRules,
  quantity: number,
  price: number
): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'Order quantity must be greater than zero.';
  }
  if (!Number.isFinite(price) || price <= 0) {
    return 'Order price must be greater than zero.';
  }
  if (quantity < rules.minQuantity) {
    return `Quantity ${quantity} is below the ${rules.pair} minimum of ${rules.minQuantity}.`;
  }
  if (quantity > rules.maxQuantity) {
    return `Quantity ${quantity} is above the ${rules.pair} maximum of ${rules.maxQuantity}.`;
  }
  const notional = quantity * price;
  if (notional < rules.minNotional) {
    // The one that stops a small allocation dead. Worth naming precisely,
    // because the fix is "allocate more", not "try again".
    return `Order value of ${notional.toFixed(2)} ${rules.quoteAsset} is below the ${rules.pair} minimum of ${rules.minNotional}.`;
  }
  return null;
}

/**
 * The largest quantity of `pair` buyable with `quoteAmount`, respecting the
 * venue's lot step.
 *
 * Used to turn a bot's allocated capital into an order size. Returns 0 when
 * the allocation cannot buy even one lot, which the caller must treat as "this
 * bot cannot trade" rather than as an error to retry.
 */
export function quantityForQuote(quoteAmount: number, price: number, rules: SymbolRules): number {
  if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) return 0;
  if (!Number.isFinite(price) || price <= 0) return 0;
  return roundDownToStep(quoteAmount / price, rules.lotStep);
}

// --- Money -----------------------------------------------------------------

/**
 * A quote-currency amount to integer minor units, for the ledger.
 *
 * The single conversion point between the exchange's decimals and the
 * platform's integers. Rounds to nearest: this is a final settlement figure
 * rather than an order size, and systematically rounding a user's realized
 * profit down would quietly skim a fraction of a cent from every close.
 */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromMinorUnits(minor: number): number {
  return minor / 100;
}
