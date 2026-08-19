import { getBinanceSymbolRules, getBinanceTicker } from './binance-public';
import {
  checkOrderAgainstRules,
  ExchangeError,
  roundPriceToTick,
  type Balance,
  type ExchangeAdapter,
  type Fill,
  type OrderRequest,
  type OrderResult,
  type Pair,
  type SymbolRules,
  type Ticker,
} from './types';

/**
 * Paper trading against real market data.
 *
 * Prices, symbol rules and minimum notionals all come from Binance's public
 * API - only the fill is invented. That is the whole design: a strategy that
 * cannot get filled here because its order is under the minimum notional would
 * not get filled live either, and a paper mode built on made-up prices proves
 * nothing about a strategy.
 *
 * This is NOT src/lib/bot-pnl.ts. That produced a P&L number from a seeded
 * random walk with no strategy, no prices and no orders behind it. This
 * executes real strategy decisions against real prices and records real
 * orders; the only fiction is that the counterparty is imaginary. The
 * difference matters because these fills flow into the same position maths as
 * live ones, so a paper result is a genuine answer to "would this have
 * worked", and it is labelled paper wherever it is shown.
 *
 * ## What is modelled
 *
 * Immediate full fills at the crossing side of the book, plus slippage and the
 * venue's taker fee. Not modelled: partial fills, queue position, market
 * impact, or a limit order resting unfilled. Those matter for a real execution
 * simulator; here they would be false precision, because the thing being
 * checked is whether the strategy and the accounting work end to end.
 */

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export interface PaperAdapterOptions {
  /** Taker fee as a fraction, e.g. 0.001 for 0.1%. */
  feeRate: number;
  /** Adverse price movement applied at fill, as a fraction. */
  slippageRate: number;
  /** Which Binance environment supplies the market data. */
  network: 'testnet' | 'mainnet';
}

export class PaperAdapter implements ExchangeAdapter {
  readonly name = 'paper';
  /**
   * Always false, and not configurable. Every risk check, console badge and
   * audit row keys off this; a paper adapter that could claim to be live would
   * defeat all of them at once.
   */
  readonly isLive = false;

  constructor(private readonly options: PaperAdapterOptions) {}

  getSymbolRules(pair: Pair): Promise<SymbolRules> {
    return getBinanceSymbolRules(pair, this.options.network);
  }

  getTicker(pair: Pair): Promise<Ticker> {
    return getBinanceTicker(pair, this.options.network);
  }

  /**
   * Paper holds no balances.
   *
   * Returning an invented figure would let a caller "check" funds against a
   * number that means nothing. What constrains a paper order is the bot's
   * allocated capital, which the caller already knows.
   */
  async getBalances(): Promise<Balance[]> {
    return [];
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const rules = await this.getSymbolRules(request.pair);
    const ticker = await this.getTicker(request.pair);

    /*
     * Cross the spread, as a taker would. Using the mid here would make every
     * paper round trip start half a spread ahead of where a real one does,
     * which on a tight-margin strategy is the whole edge.
     */
    const bookSide =
      request.side === 'buy' ? (ticker.ask ?? ticker.price) : (ticker.bid ?? ticker.price);

    const slipped =
      request.side === 'buy'
        ? bookSide * (1 + this.options.slippageRate)
        : bookSide * (1 - this.options.slippageRate);

    const fillPrice = roundPriceToTick(slipped, rules.tickSize);
    if (fillPrice <= 0) {
      throw new ExchangeError(`Could not derive a fill price for ${request.pair}.`, 'paper', true);
    }

    /*
     * A limit order that the market has not reached does not fill. Modelled
     * because a strategy relying on limit entries would otherwise appear to
     * fill every time, which is the single most flattering possible bug in a
     * backtest.
     */
    if (request.kind === 'limit' && request.limitPrice) {
      const wouldFill =
        request.side === 'buy' ? fillPrice <= request.limitPrice : fillPrice >= request.limitPrice;
      if (!wouldFill) {
        return {
          orderId: nextId('paper'),
          clientOrderId: request.clientOrderId,
          status: 'open',
          filledQuantity: 0,
          averagePrice: null,
          fills: [],
        };
      }
    }

    const executionPrice =
      request.kind === 'limit' && request.limitPrice
        ? roundPriceToTick(request.limitPrice, rules.tickSize)
        : fillPrice;

    // The same rules a live order is checked against, applied identically -
    // this is what makes a paper rejection predictive of a live one.
    const complaint = checkOrderAgainstRules(rules, request.quantity, executionPrice);
    if (complaint) {
      return {
        orderId: nextId('paper'),
        clientOrderId: request.clientOrderId,
        status: 'rejected',
        filledQuantity: 0,
        averagePrice: null,
        rejectReason: complaint,
        fills: [],
      };
    }

    const notional = request.quantity * executionPrice;
    const fill: Fill = {
      fillId: nextId('paperfill'),
      orderId: nextId('paper'),
      clientOrderId: request.clientOrderId,
      pair: request.pair,
      side: request.side,
      quantity: request.quantity,
      price: executionPrice,
      feeAmount: notional * this.options.feeRate,
      // Quote-denominated, matching how Binance charges without the fee
      // discount token. Keeps the paper fee directly comparable to the live one.
      feeAsset: rules.quoteAsset,
      filledAt: new Date(),
    };

    return {
      orderId: fill.orderId,
      clientOrderId: request.clientOrderId,
      status: 'filled',
      filledQuantity: request.quantity,
      averagePrice: executionPrice,
      fills: [fill],
    };
  }

  /**
   * Paper orders settle synchronously, so there is nothing to look up after
   * the fact. Returning null is honest: this adapter keeps no order book, and
   * the platform's own ExchangeOrder row is the record.
   */
  async getOrder(): Promise<OrderResult | null> {
    return null;
  }

  async cancelOrder(): Promise<void> {
    // Nothing rests, so nothing can be cancelled. Not an error: a caller
    // cancelling on a timeout should not have to know which adapter it holds.
  }
}
