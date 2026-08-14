/**
 * End-to-end checks for the dashboard PIN gate.
 *
 * The PIN is no longer part of sign-in. A password produces an ordinary
 * session; the PIN is asked for at the dashboard door and answered with an
 * unlock token the client holds in memory and sends on every data request.
 * The properties that matter, and what would break if each were missing:
 *
 *   - Dashboard data is refused before the PIN. Without this the overlay is
 *     decoration: anything that can issue an HTTP request reads the balance.
 *   - The same requests succeed after it, on every dashboard endpoint rather
 *     than the one the gate happens to call first.
 *   - The unlock is bound to its session. A token from another account, or
 *     from before a sign-out, must not open anything.
 *   - Public pages are untouched. The landing page and the auth pages have to
 *     keep working for someone with no session at all.
 *   - The admin application is untouched. It has its own PIN, its own cookie
 *     and its own host, and none of them are this one.
 *
 * Creates and removes its own throwaway account, so the lockout test cannot
 * strand a real user.
 *
 *   npm run dev        # in another terminal
 *   node scripts/verify-dashboard-pin-gate.mjs
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4028';
const TARGET = new URL(BASE);

const ADMIN_HOST = (process.env.ADMIN_HOST || 'admin.localhost').replace(/^https?:\/\//, '');
const APP_HOST = (process.env.APP_HOST || TARGET.host).replace(/^https?:\/\//, '');

const STAMP = Date.now();
const EMAIL = `__gate_${STAMP}@invalid.test`;
const OTHER_EMAIL = `__gate_other_${STAMP}@invalid.test`;
const PASSWORD = 'GateTestPassword#2026';
const PIN = '498271';
const WRONG_PIN = '111213';
const NEW_PIN = '736194';

const UNLOCK_HEADER = 'x-dashboard-unlock';

/**
 * Every endpoint the dashboard touches. All of them must sit behind the gate.
 *
 * The method matters: a route with no GET handler answers 405 before any guard
 * runs, so probing it with the wrong verb would report "not 423" and pass for
 * entirely the wrong reason. Each entry names the verb the dashboard uses.
 */
const DASHBOARD_ENDPOINTS = [
  { path: '/api/wallet', method: 'GET' },
  { path: '/api/bots', method: 'GET' },
  { path: '/api/reports', method: 'GET' },
  { path: '/api/notifications', method: 'GET' },
  { path: '/api/deposits', method: 'GET' },
  { path: '/api/deposit-addresses', method: 'GET' },
  { path: '/api/kyc', method: 'GET' },
  { path: '/api/achievements', method: 'GET' },
  { path: '/api/user/vault-investments', method: 'GET' },
  { path: '/api/portfolio/history?days=1', method: 'GET' },
  // PATCH-only. Sent with an empty body: once past the gate it fails
  // validation instead, which is exactly the distinction being asserted.
  { path: '/api/user/profile', method: 'PATCH', body: {} },
  { path: '/api/achievements/visit', method: 'POST', body: { section: 'dashboard' } },
];

/** Reachable with no session at all. */
const PUBLIC_PATHS = [
  '/',
  '/sign-up-login-screen',
  '/forgot-password',
  '/reset-password',
  '/terms',
];

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

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.info(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.info(`  ✗ ${label}${detail ? `  → ${detail}` : ''}`);
  }
}

function section(title) {
  console.info(`\n${title}`);
}

/**
 * node:http rather than fetch, because the admin checks need a Host header and
 * fetch silently drops it - every request would arrive claiming the app's own
 * hostname and the isolation assertions would pass without testing anything.
 */
function raw(path, { host = APP_HOST, method = 'GET', body, cookie, unlock } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = http.request(
      {
        host: TARGET.hostname,
        port: TARGET.port || 80,
        path,
        method,
        headers: {
          Host: host,
          ...(cookie ? { Cookie: `auth_session=${cookie}` } : {}),
          ...(unlock ? { [UNLOCK_HEADER]: unlock } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          if ((response.headers['content-type'] ?? '').includes('application/json')) {
            try {
              json = JSON.parse(text);
            } catch {
              json = null;
            }
          }
          resolve({ status: response.statusCode, payload: json, text, headers: response.headers });
        });
      }
    );
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function sessionCookieFrom(headers) {
  for (const value of headers['set-cookie'] ?? []) {
    const match = value.match(/^auth_session=([^;]*)/);
    if (match && match[1]) return match[1];
  }
  return null;
}

const ITERATIONS = 100_000;
function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.pbkdf2Sync(secret, salt, ITERATIONS, 64, 'sha512').toString('hex')}`;
}

function fixture(email, extra = {}) {
  const now = new Date();
  return {
    name: 'Gate Fixture',
    email,
    role: 'Trader',
    passwordHash: hashSecret(PASSWORD),
    status: 'active',
    kycStatus: 'verified',
    walletBalanceMinor: 0,
    walletBalance: 0,
    tokenVersion: 0,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    loginFailedAttempts: 0,
    loginLockedUntil: null,
    emailVerified: true,
    lifetimeDeposited: 0,
    xp: 0,
    tier: 'unverified',
    currentStreak: 0,
    longestStreak: 0,
    visitedSections: [],
    distinctPortfolioAssets: [],
    portfolioReportCount: 0,
    distinctBotStrategyTypes: [],
    walletOwnershipConfirmed: false,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

async function main() {
  loadEnv();
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set - nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');

  console.info(`\nDashboard PIN gate verification against ${BASE}`);
  console.info(`app host: ${APP_HOST}   admin host: ${ADMIN_HOST}`);

  let userId;
  let otherId;

  try {
    userId = (await users.insertOne(fixture(EMAIL, { pinHash: hashSecret(PIN) }))).insertedId;
    // No PIN: exercises the "create your PIN" half of the gate.
    otherId = (await users.insertOne(fixture(OTHER_EMAIL))).insertedId;

    // --- sign-in ----------------------------------------------------------

    section('Sign-in no longer asks for the PIN');

    const signIn = await raw('/api/auth/signin', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    });
    const cookie = sessionCookieFrom(signIn.headers);

    check('the password alone signs in', signIn.status === 200, `got ${signIn.status}`);
    check('a session cookie is issued immediately', Boolean(cookie));
    check(
      'no pending PIN token comes back',
      !signIn.payload?.pendingToken && !signIn.payload?.pinRequired,
      JSON.stringify(signIn.payload)?.slice(0, 120)
    );

    const session = await raw('/api/auth/session', { cookie });
    check('the session resolves', session.status === 200, `got ${session.status}`);
    check('and reports that a PIN exists', session.payload?.user?.hasPin === true);

    // --- locked -----------------------------------------------------------

    section('The dashboard is locked until the PIN is given');

    let blocked = 0;
    for (const { path, method, body } of DASHBOARD_ENDPOINTS) {
      const response = await raw(path, { cookie, method, body });
      if (response.status === 423) blocked += 1;
      else console.info(`      ${method} ${path} → ${response.status}`);
    }
    check(
      `all ${DASHBOARD_ENDPOINTS.length} dashboard endpoints refuse a session with no PIN`,
      blocked === DASHBOARD_ENDPOINTS.length,
      `${blocked}/${DASHBOARD_ENDPOINTS.length} returned 423`
    );

    const lockedWallet = await raw('/api/wallet', { cookie });
    check(
      'the refusal is distinguishable from being signed out',
      lockedWallet.payload?.code === 'pin_required',
      JSON.stringify(lockedWallet.payload)
    );
    check(
      'and leaks no balance',
      !('balance' in (lockedWallet.payload ?? {})),
      lockedWallet.text.slice(0, 80)
    );

    const forged = await raw('/api/wallet', { cookie, unlock: 'dashboard-unlock.forged.deadbeef' });
    check('a forged unlock token is refused', forged.status === 423, `got ${forged.status}`);

    // --- unlocking --------------------------------------------------------

    section('The PIN unlocks it');

    const wrong = await raw('/api/auth/pin/verify', {
      method: 'POST',
      cookie,
      body: { pin: WRONG_PIN },
    });
    check('a wrong PIN is refused', wrong.status === 401, `got ${wrong.status}`);
    check('and returns no unlock token', !wrong.payload?.unlockToken);

    const verified = await raw('/api/auth/pin/verify', {
      method: 'POST',
      cookie,
      body: { pin: PIN },
    });
    const unlock = verified.payload?.unlockToken;
    check('the correct PIN is accepted', verified.status === 200, `got ${verified.status}`);
    check('and returns an unlock token', Boolean(unlock));

    let opened = 0;
    for (const { path, method, body } of DASHBOARD_ENDPOINTS) {
      const response = await raw(path, { cookie, unlock, method, body });
      if (response.status !== 423) opened += 1;
      else console.info(`      still locked: ${method} ${path}`);
    }
    check(
      `all ${DASHBOARD_ENDPOINTS.length} dashboard endpoints open with the token`,
      opened === DASHBOARD_ENDPOINTS.length,
      `${opened}/${DASHBOARD_ENDPOINTS.length} opened`
    );

    const wallet = await raw('/api/wallet', { cookie, unlock });
    check(
      'the wallet now returns a balance',
      wallet.status === 200 && typeof wallet.payload?.balance === 'number',
      `got ${wallet.status}`
    );

    // --- binding ----------------------------------------------------------

    section('The unlock is bound to its session');

    const otherSignIn = await raw('/api/auth/signin', {
      method: 'POST',
      body: { email: OTHER_EMAIL, password: PASSWORD },
    });
    const otherCookie = sessionCookieFrom(otherSignIn.headers);

    const crossed = await raw('/api/wallet', { cookie: otherCookie, unlock });
    check(
      "one account's unlock does not open another's dashboard",
      crossed.status === 423,
      `got ${crossed.status}`
    );

    const noSession = await raw('/api/wallet', { unlock });
    check(
      'an unlock token without a session is worthless',
      noSession.status === 401,
      `got ${noSession.status}`
    );

    // Signing out bumps tokenVersion, which the token names - so it dies with
    // the session rather than outliving it in an open tab.
    await raw('/api/auth/logout', { method: 'POST', cookie });
    const afterLogout = await raw('/api/wallet', { cookie, unlock });
    check(
      'signing out invalidates the unlock too',
      afterLogout.status === 401 || afterLogout.status === 423,
      `got ${afterLogout.status}`
    );

    // --- creating a PIN ---------------------------------------------------

    section('An account with no PIN is offered one');

    const otherSession = await raw('/api/auth/session', { cookie: otherCookie });
    check('the session reports no PIN', otherSession.payload?.user?.hasPin === false);

    const otherLocked = await raw('/api/wallet', { cookie: otherCookie });
    check(
      'the dashboard is locked for them too',
      otherLocked.status === 423,
      `got ${otherLocked.status}`
    );

    const created = await raw('/api/auth/pin/set', {
      method: 'POST',
      cookie: otherCookie,
      body: { pin: NEW_PIN, confirmPin: NEW_PIN },
    });
    check('a PIN can be created from the gate', created.status === 200, `got ${created.status}`);
    check('and unlocks without asking for it again', Boolean(created.payload?.unlockToken));

    const openedAfterCreate = await raw('/api/wallet', {
      cookie: otherCookie,
      unlock: created.payload?.unlockToken,
    });
    check(
      'the dashboard opens straight after creating it',
      openedAfterCreate.status === 200,
      `got ${openedAfterCreate.status}`
    );

    const weak = await raw('/api/auth/pin/set', {
      method: 'POST',
      cookie: otherCookie,
      body: { pin: '111111', confirmPin: '111111' },
    });
    check('a second PIN cannot be set silently', weak.status >= 400, `got ${weak.status}`);

    // --- lockout ----------------------------------------------------------

    section('Lockout still applies');

    const fresh = await raw('/api/auth/signin', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    });
    const freshCookie = sessionCookieFrom(fresh.headers);

    let sawLockout = false;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await raw('/api/auth/pin/verify', {
        method: 'POST',
        cookie: freshCookie,
        body: { pin: WRONG_PIN },
      });
      if (response.status === 429) {
        sawLockout = true;
        break;
      }
    }
    check('repeated wrong PINs lock the account', sawLockout);

    const lockedOut = await raw('/api/auth/pin/verify', {
      method: 'POST',
      cookie: freshCookie,
      body: { pin: PIN },
    });
    check(
      'and the correct PIN is refused while locked',
      lockedOut.status === 429,
      `got ${lockedOut.status}`
    );

    // --- public pages -----------------------------------------------------

    section('Public pages are unaffected');

    for (const path of PUBLIC_PATHS) {
      const response = await raw(path);
      check(`${path} serves without a session`, response.status === 200, `got ${response.status}`);
      if (response.status === 200) {
        check(
          `${path} shows no PIN gate`,
          !response.text.includes('Enter your PIN') &&
            !response.text.includes('Create your security PIN')
        );
      }
    }

    // --- admin ------------------------------------------------------------

    section('The admin application is unaffected');

    const adminLogin = await raw('/admin/login', { host: ADMIN_HOST });
    check(
      'the console sign-in still serves',
      adminLogin.status === 200,
      `got ${adminLogin.status}`
    );
    check(
      'and carries no dashboard PIN gate',
      !adminLogin.text.includes('Create your security PIN')
    );

    // The console has its own PIN step. It must not be satisfiable with a
    // token minted by the trader app's gate.
    const adminWithTraderUnlock = await raw('/api/admin/overview', {
      host: ADMIN_HOST,
      unlock,
      cookie,
    });
    check(
      'a trader unlock token grants nothing on the admin API',
      adminWithTraderUnlock.status === 401,
      `got ${adminWithTraderUnlock.status}`
    );

    const adminOnAppHost = await raw('/api/admin/overview', { host: APP_HOST });
    check(
      'the admin API still does not exist on the app host',
      adminOnAppHost.status === 404,
      `got ${adminOnAppHost.status}`
    );
  } finally {
    for (const id of [userId, otherId].filter(Boolean)) {
      await mongoose.connection.db.collection('notifications').deleteMany({ userId: id });
      await users.deleteOne({ _id: id });
    }
    await mongoose.connection.db.collection('ratelimitbuckets').deleteMany({
      key: { $regex: `(${EMAIL}|${OTHER_EMAIL})` },
    });

    console.info(`\n${passed} passed, ${failures.length} failed`);
    if (failures.length) {
      console.info('\nFailures:');
      for (const failure of failures) console.info(`  · ${failure}`);
    }
    await mongoose.disconnect();
    process.exit(failures.length ? 1 : 0);
  }
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
