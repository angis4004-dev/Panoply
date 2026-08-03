/**
 * Encrypts KYC identity numbers that are currently stored as plaintext.
 *
 * Before this, kycIdNumber held a passport or national-ID number in the clear
 * on the user document. This rewrites each one into the AES-256-GCM format
 * used by src/lib/pii-crypto.ts and records the last four characters
 * separately so masks can be rendered without decrypting.
 *
 * Idempotent: values already in `v1.` form are skipped, so re-running is safe.
 *
 * Prints only masks - running this script must not itself become a way to
 * print everyone's identity numbers to a terminal or CI log.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/migrate-encrypt-kyc-ids.mjs
 *   node scripts/migrate-encrypt-kyc-ids.mjs --apply
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

// Mirrors encryptPii in src/lib/pii-crypto.ts. Duplicated rather than imported
// because that module is TypeScript behind a path alias; the ciphertext format
// is fixed by the version prefix, so the two cannot drift silently.
function encryptPii(plaintext, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

function decryptPii(stored, key) {
  const [version, ivPart, tagPart, dataPart] = stored.split('.');
  if (version !== VERSION) throw new Error('unrecognized format');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function main() {
  loadEnv();

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set - nothing to connect to.');
    process.exit(1);
  }
  const key = Buffer.from(process.env.PII_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) {
    console.error('PII_ENCRYPTION_KEY must be set and decode to 32 bytes.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');

  const withId = await users
    .find(
      { kycIdNumber: { $exists: true, $nin: [null, ''] } },
      { projection: { kycIdNumber: 1, kycIdNumberLast4: 1, email: 1, kycStatus: 1 } }
    )
    .toArray();

  const plaintext = withId.filter((u) => !String(u.kycIdNumber).startsWith(`${VERSION}.`));
  const already = withId.length - plaintext.length;

  console.info('\n=== KYC IDENTITY NUMBER ENCRYPTION ===');
  console.info(`  records with an id number  ${withId.length}`);
  console.info(`  already encrypted          ${already}`);
  console.info(`  plaintext to encrypt       ${plaintext.length}`);

  if (plaintext.length) {
    console.info('\n  affected (masked):');
    for (const user of plaintext) {
      const last4 = String(user.kycIdNumber).replace(/\s+/g, '').slice(-4);
      console.info(
        `    ${String(user.email).padEnd(34)} ${String(user.kycStatus).padEnd(10)} ••••${last4}`
      );
    }
  }

  if (!APPLY) {
    console.info('\nDRY RUN - nothing written. Re-run with --apply to encrypt.\n');
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const user of plaintext) {
    const value = String(user.kycIdNumber);
    const encrypted = encryptPii(value, key);

    // Verified before the write lands: an unreadable ciphertext here would be
    // an unrecoverable identity number, since the plaintext is being replaced.
    if (decryptPii(encrypted, key) !== value) {
      throw new Error(`round-trip check failed for user ${user._id}`);
    }

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          kycIdNumber: encrypted,
          kycIdNumberLast4: value.replace(/\s+/g, '').slice(-4),
        },
      }
    );
    written += 1;
  }

  console.info(`\nAPPLIED - ${written} identity number(s) encrypted and round-trip verified.\n`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
