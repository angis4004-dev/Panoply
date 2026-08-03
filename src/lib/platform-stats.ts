import { STRATEGY_CATEGORIES } from '@/lib/about-content';

/**
 * Figures shown in the homepage stats band.
 *
 * TVL and USERS are supplied by the Aegis team and maintained by hand - there
 * is no endpoint behind them yet. Two consequences worth knowing before
 * editing:
 *
 * 1. They go stale silently. `AS_OF` exists so the page can say when the
 *    numbers were last confirmed rather than implying they are live. Update it
 *    whenever you touch a figure.
 * 2. Do not add a "volume" stat here without real data behind it. The schema
 *    records no trades (see the note in app/api/yield/route.ts), so any volume
 *    figure would be invented - on a page asking people to deposit funds, that
 *    is a false claim rather than a placeholder. This was raised and
 *    deliberately left out.
 *
 * STRATEGY_COUNT is different: it is derived from the strategy list that
 * actually drives the About page, so it cannot drift out of sync with what the
 * product offers.
 */

/** Total value locked, in USD. Confirmed by the Aegis team. */
export const TVL_USD = 35_500_000;

/** Platform user count. Confirmed by the Aegis team. */
export const USERS = 23_980;

/** Derived, not hand-maintained - stays correct as the strategy list changes. */
export const STRATEGY_COUNT = STRATEGY_CATEGORIES.length;

/** When TVL and USERS were last confirmed. Update alongside them. */
export const AS_OF = 'August 2026';
