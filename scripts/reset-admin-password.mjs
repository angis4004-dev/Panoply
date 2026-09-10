#!/usr/bin/env node
/**
 * Sets a new password on an existing admin account.
 *
 * bootstrap-admin.mjs deliberately will not do this. It reports what already
 * exists and changes nothing, because the account it creates is the one that
 * can do everything and a script that silently overwrites its credentials is
 * a script that can be pointed at a live system by accident.
 *
 * This is the deliberate counterpart: it refuses to create anything, only
 * ever rewrites the password of an account that is already there, and names
 * the account it is about to touch before touching it.
 *
 *   ADMIN_RESET_EMAIL=ops@example.com npm run admin:reset-password
 *
 * With no ADMIN_RESET_PASSWORD it generates one and prints it once. That is
 * usually what you want: a password typed on a command line is a password in
 * your shell history, and this way it never goes near it.
 *
 * Either way the account is flagged `mustChangePassword`, so whatever this
 * script sets is a means of getting in once, not the password you keep.
 *
 * Pass --clear-pin to remove the PIN as well, which the console then asks the
 * operator to set again on the way in. The PIN is a separate factor, so it is
 * a separate flag - a lost password does not imply a lost PIN.
 *
 * Pass --dry-run to see what it would do without writing anything.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');
const CLEAR_PIN = process.argv.includes('--clear-pin');

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
 * Same PBKDF2 construction as src/lib/admin/credentials.ts, duplicated for the
 * same reason bootstrap-admin.mjs duplicates it: this runs outside the Next
 * build and cannot resolve the TypeScript sources or the `@/` alias. A hash
 * written with different parameters here would be silently unverifiable at
 * the login screen, so the numbers are stated rather than defaulted.
 */
const ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${derived}`;
}

const MIN_PASSWORD_LENGTH = 14;

function passwordComplaint(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Admin passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`;
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

/** Unambiguous alphabet: no O/0, l/1/I. These get read off a screen and retyped. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_=+.!?';
  let out = '';
  while (out.length < 20) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  // Regenerate rather than patch if the draw misses a character class - a
  // patched password is no longer uniformly random.
  return passwordComplaint(out) ? generatePassword() : out;
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

loadEnv();

const email = (process.env.ADMIN_RESET_EMAIL || '').trim().toLowerCase();
if (!email) fail('ADMIN_RESET_EMAIL must be set.');

const uri = process.env.MONGODB_URI;
if (!uri) fail('MONGODB_URI is not set. Check your .env.');

const supplied = process.env.ADMIN_RESET_PASSWORD;
if (supplied) {
  const complaint = passwordComplaint(supplied);
  if (complaint) fail(complaint);
}
const password = supplied || generatePassword();

console.log(`\n  Admin password reset${DRY_RUN ? ' (dry run)' : ''}`);
console.log(`  database: ${process.env.MONGODB_DB || '(from URI)'}`);
console.log(`  account:  ${email}\n`);

await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB || undefined,
  serverSelectionTimeoutMS: 20_000,
});

const admins = mongoose.connection.db.collection('adminusers');
const existing = await admins.findOne({ email });

if (!existing) {
  await mongoose.disconnect();
  fail(
    `No admin account with that email.\n` +
      `    This script only resets an account that already exists - it will not create one.\n` +
      `    Run "npm run admin:bootstrap:dry-run" to list what is there.`
  );
}

console.log(`  · found ${existing.role} (${existing.status})`);

if (existing.status !== 'active') {
  console.log(`  ! the account is ${existing.status}; a new password will not let it sign in`);
}

if (DRY_RUN) {
  console.log('\n  Would set a new password and require a change at next sign-in.');
  if (CLEAR_PIN) console.log('  Would also remove the PIN and require a new one to be set.');
  console.log('  Nothing was written.\n');
  await mongoose.disconnect();
  process.exit(0);
}

/*
 * The PIN is a second factor and clearing it is a second decision, so it takes
 * its own flag rather than riding along with --password.
 *
 * The console asks for the PIN after the password, so an operator who has lost
 * both is still locked out by the second one after a password reset. Removing
 * the hash and setting mustSetPin makes the console ask them to choose a new
 * PIN on the way in, which is the same path a newly created admin takes.
 */
const update = {
  $set: {
    passwordHash: hashSecret(password),
    // Whatever this script set is a way back in, not a password to keep -
    // it has been on a terminal, and possibly in a shell history.
    mustChangePassword: true,
    updatedAt: new Date(),
  },
};

if (CLEAR_PIN) {
  update.$set.mustSetPin = true;
  update.$unset = { pinHash: '' };
}

await admins.updateOne({ _id: existing._id }, update);

/*
 * Clear the sign-in rate limiter for this account too.
 *
 * Failed attempts are counted in the shared rate-limit collection, not on the
 * admin row, so a password reset alone can leave the operator locked out by
 * the attempts that made them reset it in the first place. Best-effort: the
 * key format is an implementation detail of src/lib/rate-limit.ts, and a miss
 * here only means waiting out the window.
 */
try {
  const buckets = mongoose.connection.db.collection('ratelimitbuckets');
  const cleared = await buckets.deleteMany({
    key: { $regex: email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
  });
  if (cleared.deletedCount > 0)
    console.log(`  · cleared ${cleared.deletedCount} rate-limit record(s)`);
} catch {
  // Not fatal. The password is already changed.
}

console.log('  · password updated');
if (CLEAR_PIN) console.log('  · PIN removed; a new one must be set at next sign-in');
console.log('  · a password change is required at next sign-in\n');

if (!supplied) {
  console.log('  ┌─────────────────────────────────────────────────');
  console.log(`    Sign in with:  ${password}`);
  console.log('  └─────────────────────────────────────────────────');
  console.log('  Shown once. It is not stored anywhere in readable form.\n');
}

await mongoose.disconnect();
