/**
 * Monetary amounts as integer minor units (US cents).
 *
 * Every balance and ledger amount in this app is an integer number of cents,
 * never a float. `0.1 + 0.2 !== 0.3` in IEEE-754, and a balance built up by
 * repeated `$inc` of float dollars accumulates that error permanently - there
 * is no later point at which it can be detected or corrected, because the
 * balance carries no record of how it was reached.
 *
 * Dollars exist only at the edges: parsed from a request body, formatted into
 * a response. Everything between those two points is minor units.
 */

export const MINOR_UNITS_PER_DOLLAR = 100;

/**
 * Largest amount accepted in a single operation, in minor units ($1B).
 *
 * Not a business rule - a representation guard. Balances are JS numbers, exact
 * only below Number.MAX_SAFE_INTEGER (2^53-1). Capping single amounts far below
 * that keeps any realistic sequence of operations inside the exact-integer
 * range, so the ledger cannot silently start rounding.
 */
export const MAX_AMOUNT_MINOR = 100_000_000_000;

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

/**
 * Converts a dollar amount from an untrusted source into minor units.
 *
 * Rounds to the nearest cent: a client sending 19.999 is charged $20.00, not
 * $19.99 plus an un-representable remainder. Throws rather than clamping,
 * because silently altering an amount a user asked for is worse than refusing.
 */
export function toMinor(dollars: unknown): number {
  const value = typeof dollars === 'string' ? Number(dollars) : dollars;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidAmountError('Amount must be a finite number.');
  }

  // toPrecision before rounding, because the multiplication itself introduces
  // error: 1.005 * 100 is 100.49999999999999 and 2.675 * 100 is
  // 267.49999999999994, so a plain Math.round silently loses a cent on inputs
  // a user would write by hand. Fifteen significant digits is comfortably
  // inside a double's ~15-17 digit precision, so this recovers the intended
  // decimal value without inventing one.
  const minor = Math.round(Number((value * MINOR_UNITS_PER_DOLLAR).toPrecision(15)));
  if (!Number.isSafeInteger(minor)) {
    throw new InvalidAmountError('Amount is too large to represent exactly.');
  }
  if (Math.abs(minor) > MAX_AMOUNT_MINOR) {
    throw new InvalidAmountError(
      `Amount exceeds the maximum of $${(MAX_AMOUNT_MINOR / MINOR_UNITS_PER_DOLLAR).toLocaleString()}.`
    );
  }
  return minor;
}

/** Minor units back to dollars, for API responses and display only. */
export function toDollars(minor: number): number {
  return minor / MINOR_UNITS_PER_DOLLAR;
}

/** Parses a positive amount, rejecting zero and negatives. */
export function toPositiveMinor(dollars: unknown): number {
  const minor = toMinor(dollars);
  if (minor <= 0) {
    throw new InvalidAmountError('Amount must be greater than 0.');
  }
  return minor;
}
