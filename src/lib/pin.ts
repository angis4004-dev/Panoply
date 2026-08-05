import crypto from 'crypto';

/**
 * Six-digit login PIN.
 *
 * A PIN is a weak secret by construction: one million combinations is a few
 * seconds of work for anything that can submit requests freely. Everything
 * here exists to remove that freedom - the attempt counter and lockout live on
 * the user document rather than in memory, so they survive a restart and hold
 * across every server instance. The in-memory limiter used for password login
 * would reset on redeploy and is per-instance, which is not adequate for a
 * secret this small.
 *
 * The PIN is a second factor after the password, not a replacement for it. It
 * adds little against an attacker who already has the password, and is worth
 * most as a step-up gate on sensitive actions.
 */

export const PIN_LENGTH = 6;

/** Failed attempts before the PIN locks. */
export const MAX_PIN_ATTEMPTS = 5;

/** How long a lock lasts once tripped. */
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

/** Exactly six digits. No spaces, no separators, nothing else. */
export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/**
 * Rejects PINs that are trivially guessable.
 *
 * An attacker with a handful of attempts before lockout will spend them on
 * 000000, 123456 and birth years. Blocking the obvious patterns costs the user
 * very little and removes the cases where five attempts is actually enough.
 */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true; // 000000, 111111, ...

  const digits = pin.split('').map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (ascending || descending) return true; // 123456, 654321, ...

  if (/^(\d{2})\1{2}$/.test(pin)) return true; // 121212, 454545, ...
  if (/^(\d{3})\1$/.test(pin)) return true; // 123123, 987987, ...

  return false;
}

/** Same PBKDF2 construction the password hashes use, stored as `salt:key`. */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [salt, storedKey] = storedHash.split(':');
  if (!salt || !storedKey) return false;

  const derived = crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(storedKey, 'hex');

  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a thrown error here would read as a server fault.
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export interface PinLockState {
  pinFailedAttempts?: number;
  pinLockedUntil?: Date | null;
}

/** Milliseconds remaining on a lock, or 0 if not locked. */
export function lockRemainingMs(state: PinLockState, now: Date = new Date()): number {
  if (!state.pinLockedUntil) return 0;
  return Math.max(0, new Date(state.pinLockedUntil).getTime() - now.getTime());
}

export function attemptsRemaining(state: PinLockState): number {
  return Math.max(0, MAX_PIN_ATTEMPTS - (state.pinFailedAttempts ?? 0));
}

/** Human-readable lock duration for an error message. */
export function formatLockDuration(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
