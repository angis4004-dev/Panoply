export class StaleBalanceError extends Error {
  constructor() {
    super(
      'The wallet balance changed while this adjustment was being prepared. Refresh and try again.'
    );
    this.name = 'StaleBalanceError';
  }
}

/**
 * Computes a target-balance adjustment only when the caller is still acting
 * on the balance they reviewed. The database transaction supplies
 * `currentMinor`; callers supply the value they originally observed.
 */
export function targetBalanceDelta({
  expectedMinor,
  currentMinor,
  targetMinor,
}: {
  expectedMinor: number;
  currentMinor: number;
  targetMinor: number;
}): number {
  if (expectedMinor !== currentMinor) throw new StaleBalanceError();
  return targetMinor - currentMinor;
}
