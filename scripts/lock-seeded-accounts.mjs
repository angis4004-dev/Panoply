#!/usr/bin/env node
/**
 * Locks the two accounts that src/lib/auth-store.ts used to seed.
 *
 * `alex.thornton@cryptotradeai.io` (Trader) and `admin@cryptotradeai.io`
 * (Admin) were inserted into whatever database the app found - production
 * included - with passwords written into the source, and the repository is
 * public. Removing them from the code stops new copies; it does nothing about
 * the accounts already there, whose passwords remain in git history for good.
 * This does.
 *
 *   node scripts/lock-seeded-accounts.mjs --dry-run   show what it would do
 *   node scripts/lock-seeded-accounts.mjs             lock both
 *   node scripts/lock-seeded-accounts.mjs --keep-alex lock admin, keep alex usable
 *
 * "Locked" means three things, so no single one has to hold on its own:
 *   - the password is replaced by the hash of a random secret that is never
 *     printed or stored, so the published one stops working;
 *   - `status` becomes 'suspended', which getSessionFromRequest refuses;
 *   - `tokenVersion` is bumped, which ends every session already open.
 *
 * `--keep-alex` is for when that account is your demo login. It still gets a
 * new password and loses its sessions, but stays active, and the new password
 * is printed once here. Run it yourself rather than through a tool that logs
 * output, for the same reason reset-admin-password.mjs says so.
 *
 * The admin account is locked either way. The Admin role on the trader side
 * can read, change and delete any trader's signal flows (/api/bots/[id]), it
 * is not used by anyone, and its password is public.
 *
 * Nothing is deleted: suspended accounts stay visible in the admin console,
 * with their history, and can be reactivated there.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');
const KEEP_ALEX = process.argv.includes('--keep-alex');

const ALEX = 'alex.thornton@cryptotradeai.io';
const ADMIN = 'admin@cryptotradeai.io';

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

/*
 * Same construction as hashPassword in src/lib/auth-store.ts (PBKDF2-SHA512,
 * 100k iterations, 64-byte key, `salt:key` hex). Duplicated because this runs
 * outside the Next build; a hash written with different parameters would
 * never verify, which for the locked account is fine but for --keep-alex
 * would lock you out of the demo login.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${key}`;
}

/** 24 characters from an alphabet with no look-alikes (no 0/O, 1/l/I). */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(24);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function main() {
  loadEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set (looked in the environment and .env).');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const users = mongoose.connection.collection('users');

  const plan = [
    { email: ADMIN, keep: false },
    { email: ALEX, keep: KEEP_ALEX },
  ];

  let revealed = null;
  for (const { email, keep } of plan) {
    const user = await users.findOne(
      { email },
      { projection: { email: 1, role: 1, status: 1, tokenVersion: 1 } }
    );
    if (!user) {
      console.info(`${email}: not in this database - nothing to do.`);
      continue;
    }

    const action = keep
      ? 'new password (printed below), sessions ended, stays active'
      : 'random password nobody knows, sessions ended, suspended';
    console.info(
      `${email}: role ${user.role}, status ${user.status ?? 'active'} -> ${action}${DRY_RUN ? ' [dry run]' : ''}`
    );
    if (DRY_RUN) continue;

    const secret = keep ? generatePassword() : crypto.randomBytes(32).toString('hex');
    const update = {
      $set: { passwordHash: hashPassword(secret) },
      $inc: { tokenVersion: 1 },
    };
    if (!keep) update.$set.status = 'suspended';
    const result = await users.updateOne({ _id: user._id }, update);
    if (result.modifiedCount !== 1) {
      console.error(`${email}: update did not apply (modified ${result.modifiedCount}).`);
      process.exitCode = 1;
      continue;
    }
    if (keep) revealed = { email, secret };
  }

  if (revealed) {
    console.info(
      `\nNew password for ${revealed.email} (shown once, store it now):\n\n  ${revealed.secret}\n`
    );
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
