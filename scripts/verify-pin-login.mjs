/**
 * End-to-end checks for the six-digit login PIN.
 *
 * The property that matters most is that the password step alone grants
 * nothing: it must return a pending token and no session cookie, and that
 * token must be useless against anything except the PIN endpoints.
 *
 * Uses a throwaway account it creates and removes, so no real user is locked
 * out by the lockout test.
 *
 *   npm run dev        # in another terminal
 *   node scripts/verify-pin-login.mjs
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4028';

const EMAIL = `__pin_test_${Date.now()}@invalid.test`;
const PASSWORD = 'PinTestPassword#2026';
const GOOD_PIN = '498271';
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
  console.info(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} ${actual} (expected ${expected})`);
}

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${key}`;
}

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');

  const { insertedId } = await users.insertOne({
    name: 'PIN test fixture',
    email: EMAIL,
    role: 'Trader',
    passwordHash: hashPassword(PASSWORD),
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
    // --- Password no longer grants a session ----------------------------
    console.info('\n=== PASSWORD STEP GRANTS NOTHING ===');
    let r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    const first = await r.json();
    check('password accepted', r.status, 200);
    check(
      'no session cookie issued',
      /auth_session=[^;]/.test(r.headers.get('set-cookie') || ''),
      false
    );
    check('pin setup demanded for new account', first.pinSetupRequired, true);
    check('pending token returned', Boolean(first.pendingToken), true);

    // The pending token must not be usable as a session.
    const asSession = await fetch(`${BASE}/api/wallet`, {
      headers: { cookie: `auth_session=${first.pendingToken}` },
    });
    check('pending token rejected as a session', asSession.status, 401);

    // --- Setting a PIN ---------------------------------------------------
    console.info('\n=== SETTING A PIN ===');
    r = await post('/api/auth/pin/set', {
      pendingToken: first.pendingToken,
      pin: '123456',
      confirmPin: '123456',
    });
    check('sequential PIN refused', r.status, 400);

    r = await post('/api/auth/pin/set', {
      pendingToken: first.pendingToken,
      pin: '000000',
      confirmPin: '000000',
    });
    check('repeated-digit PIN refused', r.status, 400);

    r = await post('/api/auth/pin/set', {
      pendingToken: first.pendingToken,
      pin: GOOD_PIN,
      confirmPin: '498272',
    });
    check('mismatched confirmation refused', r.status, 400);

    r = await post('/api/auth/pin/set', {
      pendingToken: first.pendingToken,
      pin: '4982',
      confirmPin: '4982',
    });
    check('short PIN refused', r.status, 400);

    r = await post('/api/auth/pin/set', {
      pendingToken: first.pendingToken,
      pin: GOOD_PIN,
      confirmPin: GOOD_PIN,
    });
    check('valid PIN accepted', r.status, 200);
    const setCookieHeader = r.headers.get('set-cookie') || '';
    check('session issued after setting PIN', /auth_session=[^;]/.test(setCookieHeader), true);

    const cookie = setCookieHeader.match(/auth_session=([^;]+)/)[1];
    const wallet = await fetch(`${BASE}/api/wallet`, {
      headers: { cookie: `auth_session=${cookie}` },
    });
    check('session works', wallet.status, 200);

    const stored = await users.findOne({ _id: insertedId });
    check('PIN stored hashed, not plaintext', stored.pinHash.includes(GOOD_PIN), false);
    check('PIN hash is salt:key', /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(stored.pinHash), true);

    // --- Verifying on subsequent login ----------------------------------
    console.info('\n=== VERIFYING ON NEXT LOGIN ===');
    r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    const second = await r.json();
    check('existing PIN demanded', second.pinRequired, true);
    check('setup not demanded again', second.pinSetupRequired, false);

    r = await post('/api/auth/pin/set', {
      pendingToken: second.pendingToken,
      pin: '778899',
      confirmPin: '778899',
    });
    check('cannot overwrite an existing PIN via set', r.status, 409);

    r = await post('/api/auth/pin/verify', { pendingToken: second.pendingToken, pin: WRONG_PIN });
    check('wrong PIN rejected', r.status, 401);
    check(
      'no session on wrong PIN',
      /auth_session=[^;]/.test(r.headers.get('set-cookie') || ''),
      false
    );

    r = await post('/api/auth/pin/verify', { pendingToken: second.pendingToken, pin: GOOD_PIN });
    check('correct PIN accepted', r.status, 200);
    check(
      'attempt counter reset on success',
      (await users.findOne({ _id: insertedId })).pinFailedAttempts,
      0
    );

    // --- Lockout ---------------------------------------------------------
    console.info('\n=== LOCKOUT ===');
    r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    const third = (await r.json()).pendingToken;

    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      lastStatus = (await post('/api/auth/pin/verify', { pendingToken: third, pin: WRONG_PIN }))
        .status;
    }
    check('locks after 5 wrong attempts', lastStatus, 429);

    const locked = await users.findOne({ _id: insertedId });
    check('lock persisted to the database', Boolean(locked.pinLockedUntil), true);

    r = await post('/api/auth/pin/verify', { pendingToken: third, pin: GOOD_PIN });
    check('correct PIN refused while locked', r.status, 429);

    // --- Expired pending token -------------------------------------------
    console.info('\n=== PENDING TOKEN ===');
    r = await post('/api/auth/pin/verify', {
      pendingToken: 'pinpending.forged.deadbeef',
      pin: GOOD_PIN,
    });
    check('forged pending token refused', r.status, 401);
    r = await post('/api/auth/pin/verify', { pendingToken: cookie, pin: GOOD_PIN });
    check('a real session is not a pending token', r.status, 401);
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
