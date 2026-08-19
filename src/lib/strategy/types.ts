import type { PositionState } from '@/lib/exchange/position';
import type { SymbolRules, Ticker } from '@/lib/exchange/types';

/**
 * What a signal flow decides to do, and why.
 *
 * Strategies are pure functions from state to intent. They place no orders,
 * touch no database and read no clock - the executor does all of that. That
 * split is what makes the investment logic testable: "given this position and
 * this price, what would the flow do" is answerable in a unit test rather than
 * only by watching a market.
 *
 * Every intent carries a `reason`. It is stored on the resulting order and
 * shown to the trader, because a platform that trades someone's money owes
 * them an answer to "why did you buy that", and reconstructing it later from
 * price history is guesswork.
 */

export type StrategyKind = 'Grid' | 'DCA' | 'Arbitrage' | 'Trailing Stop';

export type Intent =
  | { action: 'hold'; reason: string }
  | {
      action: 'buy';
      /** Quote currency to spend. The executor converts to a lot-aligned quantity. */
      quoteAmount: number;
      reason: string;
    }
  | { action: 'sell'; quantity: number; reason: string }
  /**
   * The flow cannot run at all, and retrying will not help - an unsupported
   * strategy, or a configuration that cannot produce orders. Distinct from
   * `hold`, which means "correct to do nothing right now".
   */
  | { action: 'unsupported'; reason: string };

export interface StrategyState {
  kind: StrategyKind;
  pair: string;
  /** 0-100, the flow's own conviction setting. */
  confidence: number;
  /** Quote currency the trader committed to this flow. */
  allocatedCapital: number;
  /** When this flow last had an order placed, null if never. */
  lastOrderAt: Date | null;
  /**
   * Highest mark price seen while the current position has been open, for
   * trailing stops. Null when flat or not yet recorded.
   */
  peakPrice: number | null;
  /** When the flow started running. Used for interval-based strategies. */
  startedAt: Date;
}

export interface StrategyContext {
  state: StrategyState;
  position: PositionState;
  ticker: Ticker;
  rules: SymbolRules;
  now: Date;
}

/**
 * Capital the flow has not yet deployed.
 *
 * Allocation minus what the open position cost. Never negative: a position
 * worth more than its allocation has not borrowed anything, it has gained.
 */
export function undeployedCapital(context: StrategyContext): number {
  return Math.max(0, context.state.allocatedCapital - context.position.costBasis);
}

/** Whether the flow could place a buy of this size at all, per venue rules. */
export function canAffordOrder(context: StrategyContext, quoteAmount: number): boolean {
  return quoteAmount >= context.rules.minNotional && quoteAmount > 0;
}
