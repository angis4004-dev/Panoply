import crypto from 'crypto';

/**
 * Field-level encryption for personally identifying data at rest.
 *
 * Government identity numbers were previously stored as plaintext strings on
 * the user document, alongside legal name and date of birth, and returned in
 * full by GET /api/kyc. Anyone with a database dump, a backup, a read replica,
 * or an admin session had the complete set - which is exactly the combination
 * used to open accounts in someone else's name.
 *
 * AES-256-GCM rather than CBC: it authenticates as well as encrypts, so a
 * ciphertext modified in the database fails to decrypt instead of silently
 * yielding different plaintext.
 *
 * This protects data at rest. It does not protect against an attacker who has
 * both the database and the application's key, which is why the key belongs in
 * a secret manager and must differ per environment.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const VERSION = 'v1';

export class PiiCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PiiCryptoError';
  }
}

/**
 * Resolved per call rather than at module load: an app instance that never
 * touches KYC should not fail to boot over a key it will not use. The failure
 * still happens before anything is written, so a missing key can never result
 * in silently storing plaintext.
 */
function getKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) {
    throw new PiiCryptoError(
      "PII_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new PiiCryptoError(
      `PII_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes; got ${key.length}.`
    );
  }
  return key;
}

/** True if a stored value is in this module's ciphertext format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`);
}

/**
 * Returns `v1.<iv>.<authTag>.<ciphertext>`, base64url throughout.
 *
 * The version prefix is what makes key rotation possible later without having
 * to guess how any given row was encrypted.
 */
export function encryptPii(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Same construction, same `v1.<iv>.<tag>.<data>` envelope, for binary input.
 *
 * Identity document images go through here. Routing them through encryptPii
 * would mean base64-encoding the image first and encrypting that text, which
 * inflates the stored value to roughly 1.8x the original - base64 once for the
 * plaintext and again for the ciphertext. Encrypting the bytes directly costs
 * only the single base64url pass, about 1.33x, which matters against MongoDB's
 * 16MB document ceiling.
 */
export function encryptPiiBuffer(plaintext: Buffer): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptPiiBuffer(stored: string): Buffer {
  const [version, ivPart, tagPart, dataPart] = stored.split('.');
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new PiiCryptoError('Value is not in a recognized encrypted format.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]);
}

export function decryptPii(stored: string): string {
  const [version, ivPart, tagPart, dataPart] = stored.split('.');
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new PiiCryptoError('Value is not in a recognized encrypted format.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Last four characters of an identity number, stored alongside the ciphertext.
 *
 * Lets the owner confirm which document is on file, and lets support recognize
 * a record, without anything having to decrypt. Every read that only needs
 * recognition should use this rather than the real value.
 */
export function lastFour(value: string): string {
  return value.replace(/\s+/g, '').slice(-4);
}

/** Display form, e.g. `••••4471`. */
export function maskFromLastFour(last4: string | null | undefined): string {
  return last4 ? `••••${last4}` : '';
}
