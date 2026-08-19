import { createHmac } from 'node:crypto';
import { binanceBaseUrl, getBinanceSymbolRules, getBinanceTicker } from './binance-public';
import {
  checkOrderAgainstRules,
  ExchangeError,
  toVenueSymbol,
  type Balance,
  type ExchangeAdapter,
  type Fill,
  type OrderRequest,
  type OrderResult,
  type OrderStatus,
  type Pair,
  type SymbolRules,
  type Ticker,
} from './types';

/**
 * Binance spot, over the signed REST API.
 *
 * Credentials arrive through the constructor from src/lib/exchange/config.ts,
 * which reads them from the environment. They are never read from the
 * database, never accepted from a request, and never logged - the error paths
 * below deliberately echo Binance's message but not the query string that
 * produced it, because the query string carries the signature.
 *
 * Market data comes from the shared public client, so this file contains only
 * what needs authenticating: balances and orders.
 */

interface BinanceOrderResponse {
  orderId: number;
  clientOrderId: string;
  status: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  fills?: Array<{
    tradeId?: number;
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
  transactTime?: number;
}

/**
 * Binance's order states, mapped to ours.
 *
 * EXPIRED is grouped with cancelled rather than rejected: it means the order
 * lived and then stopped, which is the same accounting outcome as a cancel -
 * whatever filled, filled. A rejection means nothing happened at all.
 */
const STATUS_MAP: Record<string, OrderStatus> = {
  NEW: 'open',
  PARTIALLY_FILLED: 'partial',
  FILLED: 'filled',
  CANCELED: 'cancelled',
  PENDING_CANCEL: 'cancelled',
  EXPIRED: 'cancelled',
  EXPIRED_IN_MATCH: 'cancelled',
  REJECTED: 'rejected',
};

export interface BinanceAdapterOptions {
  apiKey: string;
  apiSecret: string;
  network: 'testnet' | 'mainnet';
  /**
   * Whether this adapter may move real money. Passed in rather than derived
   * from `network` so that the single decision made in config.ts - which
   * requires three separate environment variables to agree - is the only place
   * that can conclude "live".
   */
  isLive: boolean;
}

export class BinanceAdapter implements ExchangeAdapter {
  readonly name = 'binance';
  readonly isLive: boolean;

  constructor(private readonly options: BinanceAdapterOptions) {
    if (!options.apiKey || !options.apiSecret) {
      throw new ExchangeError('Binance credentials are not configured.', 'binance');
    }
    this.isLive = options.isLive;
  }

  getSymbolRules(pair: Pair): Promise<SymbolRules> {
    return getBinanceSymbolRules(pair, this.options.network);
  }

  getTicker(pair: Pair): Promise<Ticker> {
    return getBinanceTicker(pair, this.options.network);
  }

  /**
   * HMAC-SHA256 over the query string, as Binance requires.
   *
   * recvWindow bounds how long a signed request stays valid. Five seconds is
   * Binance's default: long enough for ordinary latency, short enough that a
   * captured request cannot be replayed later.
   */
  private sign(params: Record<string, string | number>): string {
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      timestamp: String(Date.now()),
      recvWindow: '5000',
    }).toString();

    const signature = createHmac('sha256', this.options.apiSecret).update(query).digest('hex');
    return `${query}&signature=${signature}`;
  }

  private async signedRequest<T>(
    path: string,
    params: Record<string, string | number>,
    method: 'GET' | 'POST' | 'DELETE' = 'GET'
  ): Promise<T> {
    const query = this.sign(params);
    const url = `${binanceBaseUrl(this.options.network)}${path}?${query}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method,
        headers: { 'X-MBX-APIKEY': this.options.apiKey },
        signal: controller.signal,
        cache: 'no-store',
      });

      const text = await response.text();
      if (!response.ok) {
        /*
         * Binance's message is echoed; the URL is not. The query string
         * carries the HMAC signature, and an error log is exactly the sort of
         * place a signature should never end up.
         */
        const retryable =
          response.status === 429 || response.status === 418 || response.status >= 500;
        throw new ExchangeError(
          `Binance rejected the request (${response.status}): ${text.slice(0, 200)}`,
          'binance',
          retryable
        );
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof ExchangeError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        // Ambiguous by nature: the order may exist upstream. The caller must
        // reconcile by clientOrderId rather than assume failure and retry.
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

  async getBalances(): Promise<Balance[]> {
    const account = await this.signedRequest<{
      balances?: Array<{ asset: string; free: string; locked: string }>;
    }>('/api/v3/account', {});

    return (account.balances ?? [])
      .map((entry) => ({
        asset: entry.asset,
        free: Number(entry.free) || 0,
        locked: Number(entry.locked) || 0,
      }))
      .filter((balance) => balance.free > 0 || balance.locked > 0);
  }

  private toResult(
    response: BinanceOrderResponse,
    request: Pick<OrderRequest, 'pair' | 'side'>
  ): OrderResult {
    const fills: Fill[] = (response.fills ?? []).map((raw, index) => ({
      fillId: raw.tradeId ? String(raw.tradeId) : `${response.orderId}-${index}`,
      orderId: String(response.orderId),
      clientOrderId: response.clientOrderId,
      pair: request.pair,
      side: request.side,
      quantity: Number(raw.qty) || 0,
      price: Number(raw.price) || 0,
      feeAmount: Number(raw.commission) || 0,
      feeAsset: raw.commissionAsset,
      filledAt: response.transactTime ? new Date(response.transactTime) : new Date(),
    }));

    const filledQuantity = Number(response.executedQty) || 0;
    const quoteSpent = Number(response.cummulativeQuoteQty) || 0;

    return {
      orderId: String(response.orderId),
      clientOrderId: response.clientOrderId,
      status: STATUS_MAP[response.status] ?? ('unknown' as OrderStatus),
      filledQuantity,
      // Derived from the venue's own cumulative quote total rather than
      // averaged from the fills array, which is absent on a status lookup.
      averagePrice: filledQuantity > 0 ? quoteSpent / filledQuantity : null,
      fills,
    };
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const venueSymbol = toVenueSymbol(request.pair);
    if (!venueSymbol) {
      throw new ExchangeError(`"${request.pair}" is not a valid trading pair.`, 'binance');
    }

    const rules = await this.getSymbolRules(request.pair);

    /*
     * Checked locally first. The venue would reject these anyway, but its
     * error codes are opaque and a local check produces a message naming the
     * actual limit - and costs no round trip.
     */
    const referencePrice =
      request.kind === 'limit' && request.limitPrice
        ? request.limitPrice
        : (await this.getTicker(request.pair)).price;

    const complaint = checkOrderAgainstRules(rules, request.quantity, referencePrice);
    if (complaint) {
      return {
        orderId: '',
        clientOrderId: request.clientOrderId,
        status: 'rejected',
        filledQuantity: 0,
        averagePrice: null,
        rejectReason: complaint,
        fills: [],
      };
    }

    const params: Record<string, string | number> = {
      symbol: venueSymbol,
      side: request.side.toUpperCase(),
      type: request.kind.toUpperCase(),
      quantity: request.quantity,
      newClientOrderId: request.clientOrderId,
      // Full response, so fills come back with the placement rather than
      // needing a second call that might race the fill.
      newOrderRespType: 'FULL',
    };

    if (request.kind === 'limit') {
      if (!request.limitPrice) {
        throw new ExchangeError('A limit order needs a limit price.', 'binance');
      }
      params.price = request.limitPrice;
      // Good-til-cancelled. The platform cancels explicitly rather than
      // relying on an immediate-or-cancel that would silently drop the order.
      params.timeInForce = 'GTC';
    }

    const response = await this.signedRequest<BinanceOrderResponse>(
      '/api/v3/order',
      params,
      'POST'
    );
    return this.toResult(response, request);
  }

  /**
   * Look an order up by the client id the platform generated.
   *
   * The recovery path for an ambiguous placement. Returns null when Binance
   * has never heard of the id, which is the one outcome that definitively
   * means the order does not exist and it is safe to place again.
   */
  async getOrder(pair: Pair, clientOrderId: string): Promise<OrderResult | null> {
    const venueSymbol = toVenueSymbol(pair);
    if (!venueSymbol) return null;

    try {
      const response = await this.signedRequest<BinanceOrderResponse>('/api/v3/order', {
        symbol: venueSymbol,
        origClientOrderId: clientOrderId,
      });
      return this.toResult(response, { pair, side: 'buy' });
    } catch (error) {
      // -2013 is "Order does not exist". Anything else is a real failure and
      // must propagate: treating a network error as "no order" would authorise
      // placing a duplicate.
      if (error instanceof ExchangeError && error.message.includes('-2013')) {
        return null;
      }
      throw error;
    }
  }

  async cancelOrder(pair: Pair, clientOrderId: string): Promise<void> {
    const venueSymbol = toVenueSymbol(pair);
    if (!venueSymbol) return;

    try {
      await this.signedRequest(
        '/api/v3/order',
        { symbol: venueSymbol, origClientOrderId: clientOrderId },
        'DELETE'
      );
    } catch (error) {
      // Already gone is the desired end state, not a failure.
      if (error instanceof ExchangeError && error.message.includes('-2011')) return;
      throw error;
    }
  }
}
