import { describe, it, expect, beforeAll } from 'vitest';
import { clearBinanceCaches, getBinanceSymbolRules, getBinanceTicker } from './binance-public';
import { PaperAdapter } from './paper';
import { positionFromFills, valuePosition, type PositionFill } from './position';
import { quantityForQuote } from './types';

/**
 * Does the venue integration still work against the real Binance API?
 *
 * Opt-in, because it makes network calls: an ordinary `npm test` must not
 * fail because someone's wifi dropped or Binance rate-limited a CI runner.
 * Run it deliberately when the adapter changes, or when a live symbol starts
 * behaving oddly:
 *
 *   EXCHANGE_INTEGRATION=1 npx vitest run src/lib/exchange/live-data.integration.test.ts
 *
 * Read-only throughout. It touches only public market-data endpoints and the
 * paper adapter, so it needs no credentials and cannot place an order.
 */

const ENABLED = Boolean(process.env.EXCHANGE_INTEGRATION);

describe.skipIf(!ENABLED)('Binance public market data', () => {
  beforeAll(() => clearBinanceCaches());

  it('returns usable symbol rules for ETH/USDT', async () => {
    const rules = await getBinanceSymbolRules('ETH/USDT', 'mainnet');

    expect(rules.venueSymbol).toBe('ETHUSDT');
    expect(rules.baseAsset).toBe('ETH');
    expect(rules.quoteAsset).toBe('USDT');
    // Every one of these is a live order rejection if it comes back as zero.
    expect(rules.lotStep).toBeGreaterThan(0);
    expect(rules.tickSize).toBeGreaterThan(0);
    expect(rules.minNotional).toBeGreaterThan(0);
  });

  it('returns a two-sided book with a sane spread', async () => {
    const ticker = await getBinanceTicker('ETH/USDT', 'mainnet');

    expect(ticker.bid).toBeGreaterThan(0);
    expect(ticker.ask).toBeGreaterThan(0);
    expect(ticker.ask!).toBeGreaterThanOrEqual(ticker.bid!);
    expect(ticker.price).toBeGreaterThan(0);

    // A spread wider than 1% on ETH/USDT means the parse is wrong, not that
    // the market is unusual.
    const spread = (ticker.ask! - ticker.bid!) / ticker.price;
    expect(spread).toBeLessThan(0.01);
  });

  it('rejects a pair Binance does not list, rather than returning nonsense', async () => {
    await expect(getBinanceSymbolRules('NOTACOIN/USDT', 'mainnet')).rejects.toThrow(
      /not.*valid|does not list/i
    );
  });
});

describe.skipIf(!ENABLED)('paper adapter against real prices', () => {
  const adapter = new PaperAdapter({ feeRate: 0.001, slippageRate: 0.0005, network: 'mainnet' });

  it('is never live, whatever it is constructed with', () => {
    expect(adapter.isLive).toBe(false);
  });

  it('fills a market buy at a real market price', async () => {
    const rules = await adapter.getSymbolRules('ETH/USDT');
    const ticker = await adapter.getTicker('ETH/USDT');
    const quantity = quantityForQuote(500, ticker.price, rules);

    const result = await adapter.placeOrder({
      pair: 'ETH/USDT',
      side: 'buy',
      kind: 'market',
      quantity,
      clientOrderId: `test-${Date.now()}`,
    });

    expect(result.status).toBe('filled');
    expect(result.filledQuantity).toBe(quantity);
    expect(result.fills).toHaveLength(1);
    // Within 5% of the mark: proves it filled against the real book rather
    // than an invented number.
    expect(result.averagePrice!).toBeGreaterThan(ticker.price * 0.95);
    expect(result.averagePrice!).toBeLessThan(ticker.price * 1.05);
  });

  it('charges the taker fee in quote currency', async () => {
    const rules = await adapter.getSymbolRules('ETH/USDT');
    const ticker = await adapter.getTicker('ETH/USDT');
    const quantity = quantityForQuote(500, ticker.price, rules);

    const result = await adapter.placeOrder({
      pair: 'ETH/USDT',
      side: 'buy',
      kind: 'market',
      quantity,
      clientOrderId: `test-fee-${Date.now()}`,
    });

    const fill = result.fills[0];
    expect(fill.feeAsset).toBe('USDT');
    expect(fill.feeAmount).toBeCloseTo(fill.quantity * fill.price * 0.001, 6);
  });

  /*
   * The rule that stops a small allocation dead. Worth asserting against the
   * live minimum rather than a hardcoded one, because Binance changes it.
   */
  it('rejects an order below the real minimum notional', async () => {
    const rules = await adapter.getSymbolRules('ETH/USDT');
    const ticker = await adapter.getTicker('ETH/USDT');
    // Deliberately one lot step - far under any sane minNotional.
    const tiny = rules.lotStep;

    const result = await adapter.placeOrder({
      pair: 'ETH/USDT',
      side: 'buy',
      kind: 'market',
      quantity: tiny,
      clientOrderId: `test-tiny-${Date.now()}`,
    });

    if (tiny * ticker.price < rules.minNotional) {
      expect(result.status).toBe('rejected');
      expect(result.rejectReason).toMatch(/below/i);
    }
  });

  /*
   * A limit order the market has not reached must not fill. Without this, a
   * strategy using limit entries appears to fill every time - the most
   * flattering possible bug in a backtest.
   */
  it('leaves an unreachable limit buy open rather than filling it', async () => {
    const ticker = await adapter.getTicker('ETH/USDT');
    const rules = await adapter.getSymbolRules('ETH/USDT');
    const farBelow = ticker.price * 0.5;

    const result = await adapter.placeOrder({
      pair: 'ETH/USDT',
      side: 'buy',
      kind: 'limit',
      quantity: quantityForQuote(500, ticker.price, rules),
      limitPrice: farBelow,
      clientOrderId: `test-limit-${Date.now()}`,
    });

    expect(result.status).toBe('open');
    expect(result.filledQuantity).toBe(0);
  });

  /*
   * End to end: real prices in, orders through the adapter, fills through the
   * position maths, a P&L figure out. This is the pipeline that replaces
   * bot-pnl.ts, exercised in one test.
   */
  it('produces a P&L figure from a real round trip', async () => {
    const rules = await adapter.getSymbolRules('ETH/USDT');
    const ticker = await adapter.getTicker('ETH/USDT');
    const quantity = quantityForQuote(1000, ticker.price, rules);

    const opened = await adapter.placeOrder({
      pair: 'ETH/USDT',
      side: 'buy',
      kind: 'market',
      quantity,
      clientOrderId: `test-rt-buy-${Date.now()}`,
    });
    const closed = await adapter.placeOrder({
      pair: 'ETH/USDT',
      side: 'sell',
      kind: 'market',
      quantity,
      clientOrderId: `test-rt-sell-${Date.now()}`,
    });

    const fills: PositionFill[] = [...opened.fills, ...closed.fills].map((fill) => ({
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
      fee: fill.feeAmount,
    }));

    const position = positionFromFills(fills);
    expect(position.quantity).toBe(0);

    const valuation = valuePosition(position, ticker.price, 1000);
    expect(Number.isFinite(valuation.totalPnl)).toBe(true);
    expect(valuation.pnlPercent).not.toBeNull();

    /*
     * An immediate round trip must lose money: it crosses the spread twice
     * and pays two fees. A profit here would mean the cost model is wrong in
     * the direction that makes every strategy look good.
     */
    expect(valuation.realizedPnl).toBeLessThan(0);
  });
});
