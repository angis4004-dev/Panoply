import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL = process.argv[2] || 'alex.thornton@cryptotradeai.io';
const TEST_PIN = process.argv[3] || '498271';

if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
  console.error('Refusing to seed a test user in production.');
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL) || !/^\d{6}$/.test(TEST_PIN)) {
  console.error('Usage: node scripts/seed-test-user.mjs <existing-email> <six-digit-pin>');
  process.exit(1);
}

function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match && !(match[1] in process.env)) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // The process environment may already contain the required values.
  }
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${key}`;
}

async function main() {
  loadEnv();
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });

  const result = await mongoose.connection.db.collection('users').updateOne(
    { email: EMAIL },
    {
      $set: {
        pinHash: hashPin(TEST_PIN),
        pinSetAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        pinResetToken: null,
        pinResetExpires: null,
      },
    }
  );

  if (result.matchedCount !== 1) {
    throw new Error(`No existing user found for ${EMAIL}.`);
  }

  console.info(`Development test user ready: ${EMAIL}`);
  console.info(`PIN: ${TEST_PIN}`);
}

main()
  .catch((error) => {
    console.error('Failed to seed test user:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
