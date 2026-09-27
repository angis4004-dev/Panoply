export type MarketPnlStrategy = 'Grid' | 'DCA' | 'Trailing Stop' | 'Arbitrage';

export interface MarketPricePoint {
  timestamp: number;
  baseUsd: number;
  quoteUsd: number;
}

export interface MarketPnlInput {
  strategy: MarketPnlStrategy;
  allocatedCapital: number;
  prices: MarketPricePoint[];
}

export const MARKET_PNL_INTERVAL_MS = 5 * 60 * 1000;
const GRID_STEP = 0.01;
const GRID_ORDER_SHARE = 0.1;
const DCA_TRANCHES = 30;
const DCA_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TRAILING_STOP = 0.02;
const TRAILING_REENTRY = 0.01;
const FEE_RATE = 0.001;

function isValidPoint(point: MarketPricePoint): boolean {
  return (
    Number.isFinite(point.timestamp) &&
    Number.isFinite(point.baseUsd) &&
    point.baseUsd > 0 &&
    Number.isFinite(point.quoteUsd) &&
    point.quoteUsd > 0
  );
}

/**
 * Replays the supported paper strategies against historical market marks.
 * The portfolio starts with quote-asset cash; fees are charged on every fill.
 */
export function marketPnlSeries(input: MarketPnlInput): number[] | null {
  const { strategy, allocatedCapital } = input;
  const prices = input.prices.filter(isValidPoint).sort((a, b) => a.timestamp - b.timestamp);

  if (strategy === 'Arbitrage' || prices.length === 0 || allocatedCapital <= 0) return null;

  const first = prices[0];
  const initialQuote = allocatedCapital / first.quoteUsd;
  let quoteBalance = initialQuote;
  let baseBalance = 0;
  const initialPairPrice = first.baseUsd / first.quoteUsd;

  const buy = (quoteNotional: number, price: MarketPricePoint) => {
    const affordable = Math.min(quoteNotional, quoteBalance / (1 + FEE_RATE));
    if (affordable <= 0) return;
    quoteBalance -= affordable * (1 + FEE_RATE);
    baseBalance += affordable / (price.baseUsd / price.quoteUsd);
  };

  const sell = (quoteNotional: number, price: MarketPricePoint) => {
    const pairPrice = price.baseUsd / price.quoteUsd;
    const requestedBase = quoteNotional / pairPrice;
    const soldBase = Math.min(requestedBase, baseBalance);
    if (soldBase <= 0) return;
    baseBalance -= soldBase;
    quoteBalance += soldBase * pairPrice * (1 - FEE_RATE);
  };

  const results: number[] = [];
  let previousGridLevel = 0;
  let nextDcaAt = first.timestamp;
  let dcaTranchesBought = 0;
  let trailingPeak = initialPairPrice;
  let trailingTrough = initialPairPrice;
  let trailingExited = false;

  for (let index = 0; index < prices.length; index++) {
    const price = prices[index];
    const pairPrice = price.baseUsd / price.quoteUsd;

    if (index === 0) {
      if (strategy === 'Grid') {
        buy(initialQuote * 0.5, price);
      } else if (strategy === 'DCA') {
        buy(initialQuote / DCA_TRANCHES, price);
        dcaTranchesBought = 1;
        nextDcaAt += DCA_INTERVAL_MS;
      } else if (strategy === 'Trailing Stop') {
        buy(initialQuote, price);
      }
    } else if (strategy === 'Grid') {
      const level = Math.floor((pairPrice / initialPairPrice - 1 + 1e-9) / GRID_STEP);
      const orderSize = initialQuote * GRID_ORDER_SHARE;

      if (level > previousGridLevel) {
        for (let crossed = previousGridLevel + 1; crossed <= level; crossed++) {
          sell(orderSize, {
            ...price,
            baseUsd: initialPairPrice * (1 + crossed * GRID_STEP) * price.quoteUsd,
          });
        }
      } else if (level < previousGridLevel) {
        for (let crossed = previousGridLevel - 1; crossed >= level; crossed--) {
          buy(orderSize, {
            ...price,
            baseUsd: initialPairPrice * (1 + crossed * GRID_STEP) * price.quoteUsd,
          });
        }
      }
      previousGridLevel = level;
    } else if (strategy === 'DCA') {
      while (dcaTranchesBought < DCA_TRANCHES && price.timestamp >= nextDcaAt) {
        buy(initialQuote / DCA_TRANCHES, price);
        dcaTranchesBought++;
        nextDcaAt += DCA_INTERVAL_MS;
      }
    } else if (strategy === 'Trailing Stop') {
      if (trailingExited) {
        trailingTrough = Math.min(trailingTrough, pairPrice);
        if (pairPrice >= trailingTrough * (1 + TRAILING_REENTRY)) {
          buy(quoteBalance, price);
          trailingExited = false;
          trailingPeak = pairPrice;
          trailingTrough = pairPrice;
        }
      } else {
        trailingPeak = Math.max(trailingPeak, pairPrice);
        if (pairPrice <= trailingPeak * (1 - TRAILING_STOP)) {
          sell(quoteBalance + baseBalance * pairPrice, price);
          trailingExited = true;
          trailingTrough = pairPrice;
        }
      }
    }

    const equityUsd = quoteBalance * price.quoteUsd + baseBalance * price.baseUsd;
    results.push(equityUsd - allocatedCapital);
  }

  return results;
}
