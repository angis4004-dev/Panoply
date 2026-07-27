/**
 * There's no real execution engine behind these bots, so P&L is derived
 * from the actual market move of the bot's base asset since it was
 * created, scaled by the bot's confidence threshold as a stand-in for
 * "how much of the move a lower-conviction strategy would have captured".
 * This is a simplification, not a trade simulation - it never trades, exits,
 * or reacts to risk - but it's tied to real prices rather than fabricated.
 */
export function computePnlPercent(
  entryPrice: number,
  currentPrice: number,
  confidence: number
): number {
  const rawChangePct = ((currentPrice - entryPrice) / entryPrice) * 100;
  return rawChangePct * (confidence / 100);
}

export function formatPnl(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
