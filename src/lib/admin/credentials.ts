import crypto from 'crypto';

/**
 * Password and PIN handling for admin accounts.
 *
 * The construction matches the trader side - PBKDF2-SHA512, 100k iterations,
 * stored as `salt:key` - so an account brought across by the migration keeps
 * its existing hash and the operator's password still works. What differs is
 * the comparison: this one is constant-time. The trader path compares hex
 * strings with `===`, which leaks how many leading characters matched; that is
 * a marginal concern against a slow KDF and a remote attacker, but there is no
 * reason to carry it into the surface that authorizes deposits.
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, storedHash: string | undefined | null): boolean {
  if (!storedHash) return false;
  const [salt, storedKey] = storedHash.split(':');
  if (!salt || !storedKey) return false;

  const derived = crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  let expected: Buffer;
  try {
    expected = Buffer.from(storedKey, 'hex');
  } catch {
    return false;
  }

  // Length first: timingSafeEqual throws on a mismatch rather than returning
  // false, and a thrown error here would read as a server fault.
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/** Failed attempts before an admin password locks. Tighter than the trader's. */
export const MAX_ADMIN_LOGIN_ATTEMPTS = 5;
export const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

/** Failed attempts before an admin PIN locks. */
export const MAX_ADMIN_PIN_ATTEMPTS = 3;
export const ADMIN_PIN_LOCKOUT_MS = 30 * 60 * 1000;

export interface LockState {
  failedAttempts?: number;
  lockedUntil?: Date | null;
}

export function lockRemainingMs(state: LockState, now: Date = new Date()): number {
  if (!state.lockedUntil) return 0;
  return Math.max(0, new Date(state.lockedUntil).getTime() - now.getTime());
}

/**
 * Minimum length for an admin password.
 *
 * Longer than the trader minimum of eight. An admin credential is worth more
 * and is typed by someone who can be asked to use a password manager.
 */
export const MIN_ADMIN_PASSWORD_LENGTH = 14;

/**
 * Rejects passwords that are long but not strong.
 *
 * A length rule alone is satisfied by `passwordpassword`. This asks for three
 * of the four character classes, which is a blunt instrument but catches the
 * cases a hurried operator actually types when creating an account for someone
 * else - which is precisely when a weak one gets set and never changed.
 */
export function passwordComplaint(password: string): string | null {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return `Admin passwords must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password));
  if (classes.length < 3) {
    return 'Admin passwords must combine at least three of: lowercase, uppercase, digits, symbols.';
  }
  if (/^(.)\1+$/.test(password)) {
    return 'That password is a single repeated character.';
  }
  return null;
}

/**
 * A password an admin can be given out-of-band and must immediately replace.
 *
 * Generated here rather than chosen by the creating admin, because a
 * human-chosen initial password is reused, guessable, and known to two people
 * indefinitely. This one is known to two people for one sign-in - the account
 * is created with mustChangePassword set.
 */
export function generateInitialPassword(): string {
  // Base64url over 18 bytes: 24 characters, no ambiguous padding, and it
  // satisfies the complexity rule with overwhelming probability. Checked
  // rather than assumed, and regenerated on the rare miss.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${crypto.randomBytes(18).toString('base64url')}#7`;
    if (!passwordComplaint(candidate)) return candidate;
  }
  // Deterministic fallback that cannot fail the rule.
  return `${crypto.randomBytes(18).toString('base64url')}#Aa7`;
}
