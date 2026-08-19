import { ExchangeOrderModel } from '@/lib/models/ExchangeOrder';
import { TradingBotModel } from '@/lib/models/TradingBot';
import { loadRiskLimits } from '@/lib/models/TradingControl';
import { decide, type Intent, type StrategyKind } from '@/lib/strategy';
import { getExchange } from './index';
import { computeFlowPnl, realizedLossTodayMinor, userExposure } from './pnl';
import { quoteFeeFromFill } from './position';
import { checkRisk } from './risk';
import {
  ExchangeError,
  quantityForQuote,
  roundDownToStep,
  splitPair,
  type OrderSide,
  type SymbolRules,
} from './types';

/**
 * One cycle of one signal flow: decide, check, place, record.
 *
 * The only place in the platform that causes an order to exist. Everything
 * upstream is a pure decision and everything downstream is a record of what
 * happened, which keeps the dangerous part small enough to read in one sitting.
 *
 * ## The order of operations is the safety property
 *
 *   1. Load state and price.
 *   2. Ask the strategy what it wants. Pure - cannot place anything.
 *   3. Convert the intent into a venue-legal order.
 *   4. Risk gate. The last chance to refuse.
 *   5. Write the local row FIRST, in `submitting`.
 *   6. Call the venue.
 *   7. Update the row with what came back.
 *
 * Step 5 before step 6 is what makes a timeout survivable. If the process dies
 * between them there is a local row saying an order may exist upstream, and
 * reconciliation can ask the venue about that exact clientOrderId. The other
 * ordering loses the order entirely and the only recovery is to list recent
 * trades and guess.
 */

export interface CycleResult {
  botId: string;
  action: Intent['action'];
  reason: string;
  /** Set when an order was actually placed. */
  orderId?: string;
  /** Set when something refused: risk, venue rules, or an error. */
  refusedBy?: 'risk' | 'venue' | 'error';
  filledQuantity?: number;
  averagePrice?: number | null;
}

/**
 * A client order id that is unique and says where it came from.
 *
 * Binance allows 36 characters. The bot id is truncated to keep the whole
 * thing inside that while remaining traceable, and the random suffix means a
 * retry after an ambiguous timeout generates a *new* id rather than colliding
 * with the order that may already exist.
 */
function makeClientOrderId(botId: string): string {
  const shortBot = botId.slice(-8);
  const stamp = Date.now().toString(36);
  const nonce = Math.random().toString(36).slice(2, 7);
  return `pnp-${shortBot}-${stamp}-${nonce}`;
}

/**
 * Turn an intent into a quantity the venue will accept, or a reason it cannot.
 *
 * Everything the venue would reject is caught here, where the message can name
 * the real limit and no round trip is wasted.
 */
function sizeOrder(
  intent: Intent,
  rules: SymbolRules,
  price: number,
  heldQuantity: number
): { side: OrderSide; quantity: number } | { error: string } {
  if (intent.action === 'buy') {
    const quantity = quantityForQuote(intent.quoteAmount, price, rules);
    if (quantity <= 0) {
      return {
        error: `${intent.quoteAmount.toFixed(2)} ${rules.quoteAsset} cannot buy one lot of ${rules.pair}.`,
      };
    }
    return { side: 'buy', quantity };
  }

  if (intent.action === 'sell') {
    /*
     * Never sell more than is held, whatever the strategy asked for. The
     * strategies are tested against this, but the executor is the boundary
     * that touches real money and it does not take that on trust.
     */
    const capped = Math.min(intent.quantity, heldQuantity);
    const quantity = roundDownToStep(capped, rules.lotStep);
    if (quantity <= 0) {
      return { error: `Position is too small to sell one lot of ${rules.pair}.` };
    }
    return { side: 'sell', quantity };
  }

  return { error: 'No order to size.' };
}

/**
 * Run one cycle for one flow.
 *
 * Never throws. A cycle is called from a scheduler iterating many flows, and
 * one flow failing must not stop the rest - every failure comes back as a
 * CycleResult describing it.
 */
export async function runFlowCycle(botId: string): Promise<CycleResult> {
  const base: CycleResult = { botId, action: 'hold', reason: '' };

  try {
    const bot = await TradingBotModel.findById(botId);
    if (!bot) return { ...base, action: 'unsupported', reason: 'Signal flow not found.' };
    if (bot.status !== 'running') {
      return { ...base, reason: `Flow is ${bot.status}; no action taken.` };
    }

    const assets = splitPair(bot.pair);
    if (!assets) {
      return { ...base, action: 'unsupported', reason: `"${bot.pair}" is not a valid pair.` };
    }

    const { adapter } = getExchange();
    const [rules, ticker, pnl] = await Promise.all([
      adapter.getSymbolRules(bot.pair),
      adapter.getTicker(bot.pair),
      computeFlowPnl(bot._id, bot.pair, bot.allocatedAmount ?? 0),
    ]);

    const lastOrder = await ExchangeOrderModel.findOne({ botId: bot._id })
      .sort({ submittedAt: -1 })
      .select('submittedAt')
      .lean();

    const intent = decide({
      state: {
        kind: bot.type as StrategyKind,
        pair: bot.pair,
        confidence: bot.confidence,
        allocatedCapital: bot.allocatedAmount ?? 0,
        lastOrderAt: lastOrder?.submittedAt ?? null,
        peakPrice: pnl.peakPrice,
        startedAt: bot.createdAt,
      },
      position: pnl.position,
      ticker,
      rules,
      now: new Date(),
    });

    if (intent.action === 'hold' || intent.action === 'unsupported') {
      return { ...base, action: intent.action, reason: intent.reason };
    }

    const sized = sizeOrder(intent, rules, ticker.price, pnl.position.quantity);
    if ('error' in sized) {
      return { ...base, action: intent.action, reason: sized.error, refusedBy: 'venue' };
    }

    const notional = sized.quantity * ticker.price;

    const [limits, exposure, lossToday] = await Promise.all([
      loadRiskLimits(),
      userExposure(bot.userId),
      realizedLossTodayMinor(),
    ]);

    const risk = checkRisk(limits, {
      orderNotional: notional,
      currentBotPositionValue: pnl.position.costBasis,
      currentUserExposure: exposure,
      realizedLossTodayMinor: lossToday,
      lastOrderAt: lastOrder?.submittedAt ?? null,
      now: new Date(),
      side: sized.side,
    });

    if (!risk.allowed) {
      return {
        ...base,
        action: intent.action,
        reason: risk.reason ?? 'Refused by risk controls.',
        refusedBy: 'risk',
      };
    }

    const clientOrderId = makeClientOrderId(String(bot._id));

    // Written before the venue is called. See the header: this is what makes
    // a timeout recoverable rather than a lost order.
    const row = await ExchangeOrderModel.create({
      userId: bot.userId,
      botId: bot._id,
      venue: adapter.name,
      isLive: adapter.isLive,
      pair: bot.pair,
      baseAsset: assets.base,
      quoteAsset: assets.quote,
      side: sized.side,
      kind: 'market',
      requestedQuantity: sized.quantity,
      clientOrderId,
      status: 'submitting',
      rationale: intent.reason,
      submittedAt: new Date(),
    });

    try {
      const result = await adapter.placeOrder({
        pair: bot.pair,
        side: sized.side,
        kind: 'market',
        quantity: sized.quantity,
        clientOrderId,
      });

      row.venueOrderId = result.orderId || null;
      row.status = result.status;
      row.filledQuantity = result.filledQuantity;
      row.averagePrice = result.averagePrice;
      row.rejectReason = result.rejectReason ?? '';
      row.fills = result.fills.map((fill) => ({
        fillId: fill.fillId,
        quantity: fill.quantity,
        price: fill.price,
        feeAmount: fill.feeAmount,
        feeAsset: fill.feeAsset,
        // Converted once, at ingest, so the position maths never has to know
        // which asset a venue happened to charge in.
        feeQuote: quoteFeeFromFill(fill, assets.base, assets.quote),
        filledAt: fill.filledAt,
      }));
      row.settledAt = result.status === 'filled' ? new Date() : null;
      await row.save();

      if (result.status === 'rejected') {
        return {
          ...base,
          action: intent.action,
          reason: result.rejectReason ?? 'The venue rejected the order.',
          refusedBy: 'venue',
          orderId: String(row._id),
        };
      }

      return {
        ...base,
        action: intent.action,
        reason: intent.reason,
        orderId: String(row._id),
        filledQuantity: result.filledQuantity,
        averagePrice: result.averagePrice,
      };
    } catch (error) {
      /*
       * The venue was called and did not answer usefully. The order may exist.
       * `unknown` for a retryable failure - a timeout, a 5xx - marks it for
       * reconciliation; anything else definitively failed and is marked
       * rejected so the flow is not blocked forever by a row nobody resolves.
       */
      const ambiguous = error instanceof ExchangeError && error.retryable;
      row.status = ambiguous ? 'unknown' : 'rejected';
      row.rejectReason = error instanceof Error ? error.message : 'Unknown error';
      await row.save();

      return {
        ...base,
        action: intent.action,
        reason: ambiguous
          ? `Venue did not confirm the order; it will be reconciled. ${row.rejectReason}`
          : row.rejectReason,
        refusedBy: 'error',
        orderId: String(row._id),
      };
    }
  } catch (error) {
    return {
      ...base,
      action: 'unsupported',
      reason: explainCycleFailure(error),
      refusedBy: 'error',
    };
  }
}

/**
 * Turn a failure from the setup phase into something a trader can act on.
 *
 * The raw text here reaches the flow card on the dashboard, and a venue's own
 * wording is not written for that audience: `Binance responded 400:
 * {"code":-1121,"msg":"Invalid symbol."}` tells the reader nothing about what
 * they should do.
 *
 * Only the cases with a genuine plain-English translation are rewritten. The
 * rest pass through unchanged, because an accurate message nobody enjoys
 * reading beats a friendly one that hides which thing broke.
 */
function explainCycleFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Unknown error';

  if (/invalid symbol/i.test(raw)) {
    return 'This trading pair is not listed on the connected exchange, so no order can be placed. Close this flow and create one on a supported pair.';
  }

  return raw;
}

/**
 * Resolve orders whose fate is unknown.
 *
 * Asks the venue about each ambiguous clientOrderId. A venue that has never
 * heard of the id is the one answer that definitively means no order exists,
 * so the row can be closed as rejected; anything else is recorded as it stands.
 *
 * Must run before new orders are placed for an affected flow, or the platform
 * risks doubling a position it already holds without knowing.
 */
export async function reconcileUnknownOrders(limit = 50): Promise<number> {
  const { adapter } = getExchange();
  const stale = await ExchangeOrderModel.find({ status: { $in: ['unknown', 'submitting'] } })
    .sort({ submittedAt: 1 })
    .limit(limit);

  let resolved = 0;

  for (const row of stale) {
    try {
      const result = await adapter.getOrder(row.pair, row.clientOrderId);
      row.lastReconciledAt = new Date();

      if (!result) {
        row.status = 'rejected';
        row.rejectReason = 'The venue has no record of this order.';
      } else {
        row.venueOrderId = result.orderId;
        row.status = result.status;
        row.filledQuantity = result.filledQuantity;
        row.averagePrice = result.averagePrice;
        const assets = splitPair(row.pair);
        row.fills = result.fills.map((fill) => ({
          fillId: fill.fillId,
          quantity: fill.quantity,
          price: fill.price,
          feeAmount: fill.feeAmount,
          feeAsset: fill.feeAsset,
          feeQuote: assets ? quoteFeeFromFill(fill, assets.base, assets.quote) : null,
          filledAt: fill.filledAt,
        }));
      }

      await row.save();
      resolved += 1;
    } catch (error) {
      // Left as-is for the next sweep. An unresolvable row is a thing an
      // operator needs to see, not something to guess at.
      console.error(
        `[exchange] Could not reconcile ${row.clientOrderId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return resolved;
}

/**
 * Sell everything a flow holds, so its result can be settled in cash.
 *
 * Called when a trader closes a flow. Bypasses the strategy entirely - the
 * decision has been made by the person whose money it is - but NOT the venue's
 * rules, which still apply to the sale.
 *
 * Returns ok only when the flow ends genuinely flat. A partial close would
 * leave the platform holding an asset while paying out as though it had sold,
 * so anything short of fully closed is a refusal and the caller must not
 * settle.
 *
 * The risk gate is deliberately not consulted. Every limit in it exists to
 * stop the platform taking on risk, and this reduces risk to zero; a halt or
 * an exposure ceiling must never trap a trader in a position they have asked
 * to exit.
 */
export async function liquidateFlow(
  botId: string
): Promise<{ ok: true; sold: number } | { ok: false; reason: string }> {
  try {
    const bot = await TradingBotModel.findById(botId);
    if (!bot) return { ok: false, reason: 'Signal flow not found.' };

    const assets = splitPair(bot.pair);
    if (!assets) return { ok: false, reason: `"${bot.pair}" is not a valid pair.` };

    const pnl = await computeFlowPnl(bot._id, bot.pair, bot.allocatedAmount ?? 0);
    if (pnl.position.quantity <= 0) {
      return { ok: true, sold: 0 };
    }

    const { adapter } = getExchange();
    const rules = await adapter.getSymbolRules(bot.pair);
    const quantity = roundDownToStep(pnl.position.quantity, rules.lotStep);

    if (quantity <= 0) {
      /*
       * A residue smaller than one lot, left by rounding across many partial
       * sells. It cannot be sold at any venue, so holding it is not a choice
       * the platform is making. Treated as closed, and the dust simply stays
       * in the pooled wallet rather than blocking the trader's exit forever.
       */
      return { ok: true, sold: 0 };
    }

    const clientOrderId = makeClientOrderId(String(bot._id));

    const row = await ExchangeOrderModel.create({
      userId: bot.userId,
      botId: bot._id,
      venue: adapter.name,
      isLive: adapter.isLive,
      pair: bot.pair,
      baseAsset: assets.base,
      quoteAsset: assets.quote,
      side: 'sell',
      kind: 'market',
      requestedQuantity: quantity,
      clientOrderId,
      status: 'submitting',
      rationale: 'Flow closed by the trader; liquidating to settle.',
      submittedAt: new Date(),
    });

    try {
      const result = await adapter.placeOrder({
        pair: bot.pair,
        side: 'sell',
        kind: 'market',
        quantity,
        clientOrderId,
      });

      row.venueOrderId = result.orderId || null;
      row.status = result.status;
      row.filledQuantity = result.filledQuantity;
      row.averagePrice = result.averagePrice;
      row.rejectReason = result.rejectReason ?? '';
      row.fills = result.fills.map((fill) => ({
        fillId: fill.fillId,
        quantity: fill.quantity,
        price: fill.price,
        feeAmount: fill.feeAmount,
        feeAsset: fill.feeAsset,
        feeQuote: quoteFeeFromFill(fill, assets.base, assets.quote),
        filledAt: fill.filledAt,
      }));
      row.settledAt = result.status === 'filled' ? new Date() : null;
      await row.save();

      if (result.status !== 'filled') {
        return {
          ok: false,
          reason: result.rejectReason ?? `The venue returned "${result.status}" for the sale.`,
        };
      }

      return { ok: true, sold: result.filledQuantity };
    } catch (error) {
      const ambiguous = error instanceof ExchangeError && error.retryable;
      row.status = ambiguous ? 'unknown' : 'rejected';
      row.rejectReason = error instanceof Error ? error.message : 'Unknown error';
      await row.save();
      return { ok: false, reason: row.rejectReason };
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface RunAllOptions {
  /**
   * Epoch milliseconds after which no new flow is started. Flows already in
   * progress finish; the loop simply stops handing out more work.
   */
  deadline?: number;
}

export interface RunAllSummary {
  results: CycleResult[];
  /** Flows that were running but not reached before the deadline. */
  skipped: number;
  /** True when the deadline, rather than the work, ended the run. */
  ranOutOfTime: boolean;
}

/**
 * Run a cycle for every running flow. Used by the scheduler.
 *
 * Ordered least-recently-cycled first. That matters because of the deadline: a
 * run that stops halfway through must not stop at the same halfway point every
 * time, or the flows sorting last would never trade at all. Ordering by
 * lastCycleAt makes each run pick up where the previous one gave up, so
 * every flow is reached eventually even when the platform has more flows than
 * one invocation has time for.
 */
export async function runAllFlows(options: RunAllOptions = {}): Promise<RunAllSummary> {
  await reconcileUnknownOrders();

  const bots = await TradingBotModel.find({ status: 'running' })
    // Nulls sort first in MongoDB, so flows that have never run go to the
    // front - which is what a trader who just started one expects.
    .sort({ lastCycleAt: 1 })
    .select('_id')
    .lean();

  const results: CycleResult[] = [];
  let index = 0;

  /*
   * Sequential, not parallel. These share one venue rate limit and one set of
   * platform-wide risk counters; running them concurrently would let several
   * flows each pass a daily-loss check that only one of them should have.
   */
  for (const bot of bots) {
    if (options.deadline !== undefined && Date.now() >= options.deadline) break;
    index += 1;

    const result = await runFlowCycle(String(bot._id));
    results.push(result);

    /*
     * Stamped even for a hold. The timestamp is the fairness key, so a flow
     * that holds must still advance or it stays at the front of the queue
     * forever and starves everything behind it. The reason is stamped with it
     * because "why is my flow doing nothing" is unanswerable without it.
     */
    await TradingBotModel.updateOne(
      { _id: bot._id },
      { $set: { lastCycleAt: new Date(), lastCycleReason: result.reason.slice(0, 300) } }
    ).catch((error) => {
      // A failed bookkeeping write must not discard a cycle that may have
      // placed a real order. The order row is the record that matters.
      console.error(`[scheduler] Could not stamp cycle for ${bot._id}:`, error);
    });
  }

  return {
    results,
    skipped: bots.length - index,
    ranOutOfTime: index < bots.length,
  };
}

export type { Intent };
