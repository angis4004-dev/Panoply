import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import {
  decryptPii,
  encryptPii,
  isEncrypted,
  lastFour,
  maskFromLastFour,
  PiiCryptoError,
} from './pii-crypto';

const TEST_KEY = crypto.randomBytes(32).toString('base64');
const OTHER_KEY = crypto.randomBytes(32).toString('base64');

let original: string | undefined;

beforeAll(() => {
  original = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  if (original === undefined) delete process.env.PII_ENCRYPTION_KEY;
  else process.env.PII_ENCRYPTION_KEY = original;
});

describe('round trip', () => {
  it('recovers the original value', () => {
    for (const value of ['X1234567', 'AB-98 76 54 C', '000000001', 'ÜBER-123']) {
      expect(decryptPii(encryptPii(value))).toBe(value);
    }
  });

  it('never contains the plaintext', () => {
    const plaintext = 'P1234567';
    const encrypted = encryptPii(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(Buffer.from(encrypted).includes(Buffer.from(plaintext))).toBe(false);
  });

  it('produces a different ciphertext each time', () => {
    // A fresh IV per encryption. Without it, two users with the same passport
    // number would store identical ciphertext, which leaks that they match.
    const a = encryptPii('SAME-VALUE');
    const b = encryptPii('SAME-VALUE');
    expect(a).not.toBe(b);
    expect(decryptPii(a)).toBe(decryptPii(b));
  });
});

describe('tamper resistance', () => {
  it('rejects a modified ciphertext', () => {
    // GCM authenticates as well as encrypts. Under CBC this would decrypt to
    // different plaintext instead of failing, which is the whole reason for
    // the choice.
    const encrypted = encryptPii('X1234567');
    const parts = encrypted.split('.');
    const bytes = Buffer.from(parts[3], 'base64url');
    bytes[0] ^= 0xff;
    parts[3] = bytes.toString('base64url');

    expect(() => decryptPii(parts.join('.'))).toThrow();
  });

  it('rejects a modified auth tag', () => {
    const parts = encryptPii('X1234567').split('.');
    const tag = Buffer.from(parts[2], 'base64url');
    tag[0] ^= 0xff;
    parts[2] = tag.toString('base64url');

    expect(() => decryptPii(parts.join('.'))).toThrow();
  });

  it('rejects unrecognized formats', () => {
    for (const bad of ['', 'plaintext', 'v2.a.b.c', 'v1.only.two']) {
      expect(() => decryptPii(bad)).toThrow(PiiCryptoError);
    }
  });

  it('cannot be decrypted with a different key', () => {
    const encrypted = encryptPii('X1234567');
    process.env.PII_ENCRYPTION_KEY = OTHER_KEY;
    expect(() => decryptPii(encrypted)).toThrow();
    process.env.PII_ENCRYPTION_KEY = TEST_KEY;
  });
});

describe('key handling', () => {
  it('refuses to encrypt without a key rather than storing plaintext', () => {
    delete process.env.PII_ENCRYPTION_KEY;
    expect(() => encryptPii('X1234567')).toThrow(PiiCryptoError);
    process.env.PII_ENCRYPTION_KEY = TEST_KEY;
  });

  it('refuses a key of the wrong length', () => {
    process.env.PII_ENCRYPTION_KEY = crypto.randomBytes(16).toString('base64');
    expect(() => encryptPii('X1234567')).toThrow(PiiCryptoError);
    process.env.PII_ENCRYPTION_KEY = TEST_KEY;
  });
});

describe('masking', () => {
  it('identifies encrypted values', () => {
    expect(isEncrypted(encryptPii('X1234567'))).toBe(true);
    expect(isEncrypted('X1234567')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });

  it('takes the last four characters, ignoring whitespace', () => {
    expect(lastFour('X1234567')).toBe('4567');
    expect(lastFour('AB 98 76 54')).toBe('7654');
    expect(lastFour('12')).toBe('12');
  });

  it('renders a mask, or nothing when there is no value', () => {
    expect(maskFromLastFour('4567')).toBe('••••4567');
    expect(maskFromLastFour(null)).toBe('');
    expect(maskFromLastFour(undefined)).toBe('');
  });
});
