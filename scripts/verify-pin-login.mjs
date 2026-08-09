/**
 * End-to-end checks for the six-digit login PIN.
 *
 * The property that matters most is that for an account which HAS a PIN, the
 * password step alone grants nothing: no session cookie, only a pending token,
 * and that token must be useless against anything except the PIN endpoints.
 *
 * An account with no PIN yet signs in on the password alone. Choosing a PIN
 * moved out of the auth flow and into the dashboard, so /api/auth/pin/set is
 * authenticated by a session rather than by a pending token. Both halves are
 * checked below, because the interesting failure is the boundary between them.
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

const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `auth_session=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });

/** The session cookie value from a response, or null if none was set. */
const sessionCookie = (response) =>
  (response.headers.get('set-cookie') || '').match(/auth_session=([^;]+)/)?.[1] ?? null;

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
    // --- An account with no PIN signs in on the password alone ------------
    // Sign-in used to divert here into a "choose a PIN" step. It no longer
    // does; the dashboard asks instead.
    console.info('\n=== NO PIN YET: PASSWORD IS ENOUGH ===');
    let r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    const first = await r.json();
    check('password accepted', r.status, 200);
    const sessionNoPin = sessionCookie(r);
    check('session issued', Boolean(sessionNoPin), true);
    check('no pending token', Boolean(first.pendingToken), false);
    check('setup not demanded mid-flow', 'pinSetupRequired' in first, false);

    let session = await fetch(`${BASE}/api/auth/session`, {
      headers: { cookie: `auth_session=${sessionNoPin}` },
    }).then((res) => res.json());
    check('session reports hasPin false', session.user.hasPin, false);

    // --- Setting a PIN is session-authenticated ---------------------------
    console.info('\n=== SETTING A PIN (FROM A SESSION) ===');
    r = await post('/api/auth/pin/set', { pin: GOOD_PIN, confirmPin: GOOD_PIN });
    check('refused without a session', r.status, 401);

    r = await post('/api/auth/pin/set', { pin: '123456', confirmPin: '123456' }, sessionNoPin);
    check('sequential PIN refused', r.status, 400);

    r = await post('/api/auth/pin/set', { pin: '000000', confirmPin: '000000' }, sessionNoPin);
    check('repeated-digit PIN refused', r.status, 400);

    r = await post('/api/auth/pin/set', { pin: GOOD_PIN, confirmPin: '498272' }, sessionNoPin);
    check('mismatched confirmation refused', r.status, 400);

    r = await post('/api/auth/pin/set', { pin: '4982', confirmPin: '4982' }, sessionNoPin);
    check('short PIN refused', r.status, 400);

    r = await post('/api/auth/pin/set', { pin: GOOD_PIN, confirmPin: GOOD_PIN }, sessionNoPin);
    check('valid PIN accepted', r.status, 200);
    // Adding a factor is not a revocation, so the caller keeps the session
    // they already had and nothing is re-issued.
    check('no new cookie needed', Boolean(sessionCookie(r)), false);

    const stillValid = await fetch(`${BASE}/api/wallet`, {
      headers: { cookie: `auth_session=${sessionNoPin}` },
    });
    check('existing session still works', stillValid.status, 200);

    session = await fetch(`${BASE}/api/auth/session`, {
      headers: { cookie: `auth_session=${sessionNoPin}` },
    }).then((res) => res.json());
    check('session reports hasPin true', session.user.hasPin, true);
    check('pin hash never leaves the server', 'pinHash' in session.user, false);

    const stored = await users.findOne({ _id: insertedId });
    check('PIN stored hashed, not plaintext', stored.pinHash.includes(GOOD_PIN), false);
    check('PIN hash is salt:key', /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(stored.pinHash), true);

    r = await post('/api/auth/pin/set', { pin: '778899', confirmPin: '778899' }, sessionNoPin);
    check('cannot overwrite an existing PIN via set', r.status, 409);

    // --- With a PIN set, the password step grants nothing -----------------
    console.info('\n=== PIN SET: PASSWORD STEP GRANTS NOTHING ===');
    r = await post('/api/auth/signin', { email: EMAIL, password: PASSWORD });
    const second = await r.json();
    check('existing PIN demanded', second.pinRequired, true);
    check('no session cookie issued', Boolean(sessionCookie(r)), false);
    check('pending token returned', Boolean(second.pendingToken), true);

    const asSession = await fetch(`${BASE}/api/wallet`, {
      headers: { cookie: `auth_session=${second.pendingToken}` },
    });
    check('pending token rejected as a session', asSession.status, 401);

    r = await post('/api/auth/pin/verify', { pendingToken: second.pendingToken, pin: WRONG_PIN });
    check('wrong PIN rejected', r.status, 401);
    check('no session on wrong PIN', Boolean(sessionCookie(r)), false);

    r = await post('/api/auth/pin/verify', { pendingToken: second.pendingToken, pin: GOOD_PIN });
    check('correct PIN accepted', r.status, 200);
    const cookie = sessionCookie(r);
    check('session issued after PIN', Boolean(cookie), true);
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

    // --- Pending token boundaries ------------------------------------------
    console.info('\n=== PENDING TOKEN ===');
    r = await post('/api/auth/pin/verify', {
      pendingToken: 'pinpending.forged.deadbeef',
      pin: GOOD_PIN,
    });
    check('forged pending token refused', r.status, 401);
    r = await post('/api/auth/pin/verify', { pendingToken: cookie, pin: GOOD_PIN });
    check('a real session is not a pending token', r.status, 401);
  } finally {
    // Setting or changing a PIN now writes a notification, so removing only
    // the user would leave orphans behind in a collection that has no owner
    // to attribute them to.
    await mongoose.connection.db.collection('notifications').deleteMany({ userId: insertedId });
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
