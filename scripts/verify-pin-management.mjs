/**
 * End-to-end checks for changing a PIN and recovering a forgotten one.
 *
 * verify-pin-login.mjs covers choosing a PIN and signing in with it. This
 * covers what happens afterwards, and the properties here are the ones that
 * are easy to get subtly wrong:
 *
 *   - /pin/change shares the persisted lockout with /pin/verify. Without that,
 *     a stolen session would be an unthrottled oracle for guessing the current
 *     PIN, which is the one secret the session does not already grant.
 *   - Changing or resetting a PIN bumps tokenVersion, so other devices lose
 *     their sessions - but /pin/change re-issues the caller's own cookie, so
 *     the person doing it is not signed out of the device they are using.
 *   - A reset link grants no session. If it did, read access to the inbox
 *     alone would take the account and the password would stop mattering.
 *   - The reset token is single-use and is also cleared by /pin/change, so a
 *     stale email cannot overwrite a PIN that has since been set another way.
 *
 * Uses a throwaway account it creates and removes.
 *
 *   npm run dev        # in another terminal
 *   node scripts/verify-pin-management.mjs
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4028';

const EMAIL = `__pin_mgmt_${Date.now()}@invalid.test`;
const PASSWORD = 'PinMgmtPassword#2026';
const FIRST_PIN = '498271';
const SECOND_PIN = '517402';
const THIRD_PIN = '305974';
const WRONG_PIN = '111213';

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const results = [];
function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  results.push(ok);
  console.info(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${actual} (expected ${expected})`);
}

const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `auth_session=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });

const sessionCookie = (response) =>
  (response.headers.get('set-cookie') || '').match(/auth_session=([^;]+)/)?.[1] ?? null;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${key}`;
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${key}`;
}

/** Password step, then PIN, returning the session cookie. */
async function signIn(users, id, pin) {
  const r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
  const { pendingToken } = await r.json();
  const v = await post('/api/auth/pin/verify', { pendingToken, pin });
  return sessionCookie(v);
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');

  // Seeded with a PIN already set, since this script is about what comes after.
  const { insertedId } = await users.insertOne({
    name: 'PIN management fixture',
    email: EMAIL,
    role: 'Trader',
    passwordHash: hashPassword(PASSWORD),
    pinHash: hashPin(FIRST_PIN),
    pinSetAt: new Date(),
    walletBalanceMinor: 0,
    kycStatus: 'unverified',
    emailVerified: true,
    walletOwnershipConfirmed: false,
    lifetimeDeposited: 0,
    xp: 0,
    tier: 'unverified',
    currentStreak: 0,
    longestStreak: 0,
    tokenVersion: 0,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    visitedSections: [],
    distinctPortfolioAssets: [],
    portfolioReportCount: 0,
    distinctBotStrategyTypes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  try {
    let cookie = await signIn(users, insertedId, FIRST_PIN);
    check('signed in with the seeded PIN', Boolean(cookie), true);

    // --- Changing a PIN ---------------------------------------------------
    console.info('\n=== CHANGING A PIN ===');
    let r = await post('/api/auth/pin/change', {
      currentPin: FIRST_PIN,
      pin: SECOND_PIN,
      confirmPin: SECOND_PIN,
    });
    check('refused without a session', r.status, 401);

    r = await post(
      '/api/auth/pin/change',
      { currentPin: FIRST_PIN, pin: SECOND_PIN, confirmPin: '517403' },
      cookie
    );
    check('mismatched confirmation refused', r.status, 400);

    r = await post(
      '/api/auth/pin/change',
      { currentPin: FIRST_PIN, pin: FIRST_PIN, confirmPin: FIRST_PIN },
      cookie
    );
    check('reusing the current PIN refused', r.status, 400);

    r = await post(
      '/api/auth/pin/change',
      { currentPin: FIRST_PIN, pin: '123456', confirmPin: '123456' },
      cookie
    );
    check('weak new PIN refused', r.status, 400);

    r = await post(
      '/api/auth/pin/change',
      { currentPin: WRONG_PIN, pin: SECOND_PIN, confirmPin: SECOND_PIN },
      cookie
    );
    check('wrong current PIN refused', r.status, 401);
    check(
      'wrong current PIN spends an attempt',
      (await users.findOne({ _id: insertedId })).pinFailedAttempts,
      1
    );

    const versionBefore = (await users.findOne({ _id: insertedId })).tokenVersion;
    r = await post(
      '/api/auth/pin/change',
      { currentPin: FIRST_PIN, pin: SECOND_PIN, confirmPin: SECOND_PIN },
      cookie
    );
    check('valid change accepted', r.status, 200);

    const rotated = sessionCookie(r);
    check('caller gets a fresh cookie', Boolean(rotated), true);
    check(
      'tokenVersion bumped',
      (await users.findOne({ _id: insertedId })).tokenVersion > versionBefore,
      true
    );
    check(
      'attempt counter cleared by a successful change',
      (await users.findOne({ _id: insertedId })).pinFailedAttempts,
      0
    );

    // The bump is what signs other devices out; the re-issued cookie is what
    // keeps this one alive. Both halves matter.
    let res = await fetch(`${BASE}/api/wallet`, { headers: { cookie: `auth_session=${cookie}` } });
    check('pre-change session is dead (other devices out)', res.status, 401);
    res = await fetch(`${BASE}/api/wallet`, { headers: { cookie: `auth_session=${rotated}` } });
    check('re-issued session still works (this device in)', res.status, 200);
    cookie = rotated;

    // --- The new PIN is the one that works --------------------------------
    console.info('\n=== THE CHANGE TOOK EFFECT ===');
    r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    let pending = (await r.json()).pendingToken;
    r = await post('/api/auth/pin/verify', { pendingToken: pending, pin: FIRST_PIN });
    check('old PIN no longer works', r.status, 401);
    r = await post('/api/auth/pin/verify', { pendingToken: pending, pin: SECOND_PIN });
    check('new PIN works', r.status, 200);
    cookie = sessionCookie(r);
    await users.updateOne({ _id: insertedId }, { $set: { pinFailedAttempts: 0 } });

    // --- The lockout is shared with /pin/verify ---------------------------
    // The reason this matters: a session cookie is the one thing an attacker
    // may hold without the PIN. If guessing the current PIN here were free,
    // the PIN would protect nothing against them.
    console.info('\n=== LOCKOUT IS SHARED, NOT PER-ENDPOINT ===');
    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      lastStatus = (
        await post(
          '/api/auth/pin/change',
          { currentPin: WRONG_PIN, pin: THIRD_PIN, confirmPin: THIRD_PIN },
          cookie
        )
      ).status;
    }
    check('change locks after 5 wrong attempts', lastStatus, 429);

    r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    pending = (await r.json()).pendingToken;
    r = await post('/api/auth/pin/verify', { pendingToken: pending, pin: SECOND_PIN });
    check('guesses spent on change lock sign-in too', r.status, 429);

    // --- Forgotten PIN ----------------------------------------------------
    console.info('\n=== FORGOTTEN PIN ===');
    r = await post('/api/auth/pin/forgot', { pendingToken: 'pinpending.forged.deadbeef' });
    check('forged pending token refused', r.status, 401);

    // Requested while locked out on purpose: being locked is the usual reason
    // someone needs this at all.
    r = await post('/api/auth/pin/forgot', { pendingToken: pending });
    // The mail itself may fail in a dev environment (Resend rejects unroutable
    // recipient domains), which is a 502. What must hold either way is that the
    // token was persisted, so the flow is not blocked on delivery succeeding
    // here.
    check('forgot request handled', [200, 502].includes(r.status), true);
    const withToken = await users.findOne({ _id: insertedId });
    check('reset token persisted', Boolean(withToken.pinResetToken), true);
    check('reset token has an expiry', Boolean(withToken.pinResetExpires), true);
    const resetToken = withToken.pinResetToken;

    r = await post('/api/auth/pin/reset', {
      token: 'deadbeef',
      pin: THIRD_PIN,
      confirmPin: THIRD_PIN,
    });
    check('unknown reset token refused', r.status, 400);

    r = await post('/api/auth/pin/reset', {
      token: resetToken,
      pin: '111111',
      confirmPin: '111111',
    });
    check('weak PIN refused via the link', r.status, 400);

    r = await post('/api/auth/pin/reset', {
      token: resetToken,
      pin: THIRD_PIN,
      confirmPin: '305975',
    });
    check('mismatched confirmation refused', r.status, 400);

    const versionBeforeReset = (await users.findOne({ _id: insertedId })).tokenVersion;
    r = await post('/api/auth/pin/reset', {
      token: resetToken,
      pin: THIRD_PIN,
      confirmPin: THIRD_PIN,
    });
    check('valid reset accepted', r.status, 200);
    check('reset grants NO session', Boolean(sessionCookie(r)), false);

    const afterReset = await users.findOne({ _id: insertedId });
    check('reset token cleared (single use)', Boolean(afterReset.pinResetToken), false);
    check('lockout cleared by the reset', Boolean(afterReset.pinLockedUntil), false);
    check('attempts cleared by the reset', afterReset.pinFailedAttempts, 0);
    check('tokenVersion bumped by the reset', afterReset.tokenVersion > versionBeforeReset, true);

    r = await post('/api/auth/pin/reset', {
      token: resetToken,
      pin: '664218',
      confirmPin: '664218',
    });
    check('reset token cannot be reused', r.status, 400);

    // The point of clearing the lock: the owner is not stranded for 15 minutes
    // with a PIN they have only just chosen.
    r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    pending = (await r.json()).pendingToken;
    r = await post('/api/auth/pin/verify', { pendingToken: pending, pin: THIRD_PIN });
    check('reset PIN works immediately, not after the lock', r.status, 200);
    cookie = sessionCookie(r);

    // --- A change invalidates any outstanding reset link ------------------
    console.info('\n=== A CHANGE VOIDS A PENDING RESET LINK ===');
    r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    const pendingForLink = (await r.json()).pendingToken;
    await post('/api/auth/pin/forgot', { pendingToken: pendingForLink });
    const staleToken = (await users.findOne({ _id: insertedId })).pinResetToken;
    check('a reset link was issued', Boolean(staleToken), true);

    r = await post(
      '/api/auth/pin/change',
      { currentPin: THIRD_PIN, pin: SECOND_PIN, confirmPin: SECOND_PIN },
      cookie
    );
    check('PIN changed by other means', r.status, 200);
    check(
      'the outstanding link was cleared',
      Boolean((await users.findOne({ _id: insertedId })).pinResetToken),
      false
    );

    r = await post('/api/auth/pin/reset', {
      token: staleToken,
      pin: '664218',
      confirmPin: '664218',
    });
    check('stale link cannot overwrite the new PIN', r.status, 400);
  } finally {
    await users.deleteOne({ _id: insertedId });
    console.info(`\n  removed fixture ${EMAIL}`);
    await mongoose.disconnect();
  }

  const passed = results.filter(Boolean).length;
  console.info(`\n${passed === results.length ? 'PASS' : 'FAIL'} - ${passed}/${results.length}\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
