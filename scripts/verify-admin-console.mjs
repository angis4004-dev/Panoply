/**
 * End-to-end checks for the admin console.
 *
 * The unit tests in src/lib/admin/*.test.ts prove the rules in isolation -
 * who may do what, which cookie is which, when a deposit may be decided. They
 * cannot prove the things that only exist when a server, a database and two
 * hostnames are involved, which is what this covers:
 *
 *   - Role enforcement over HTTP. An Admin without deposit.authorize gets 403
 *     from the endpoint, not just from a function.
 *   - Cross-subdomain session isolation. A valid trader session presented to
 *     the admin API gets nothing, and the admin API does not exist at all on
 *     the trader hostname.
 *   - Deposit authorization. A pending deposit credits exactly once, through
 *     the ledger, and cannot be decided twice.
 *   - Ledger integrity. The cached balance equals the sum of the entries
 *     afterwards, and the wallet field is never written outside the ledger.
 *   - Audit logging. Every decision leaves an entry naming the admin, the
 *     trader, the before/after values and the reference.
 *   - Concurrent balance updates. Five simultaneous approvals of the same
 *     deposit produce one credit, not five.
 *   - Platform-wide deposit addresses. One published address reaches a trader
 *     nobody assigned anything to, retired per-trader rows reach nobody, and
 *     the route that let a trader credit their own wallet is gone.
 *
 * Creates and removes its own fixtures: two traders, two admins, one published
 * address, several deposits. Run it against a development database.
 *
 *   npm run dev                     # in another terminal
 *   npm run verify:admin
 *
 * Also runs against a production build, which is worth doing because the
 * admin cookie only takes its __Host- prefix there:
 *
 *   npm run build
 *   ADMIN_HOST=admin.localhost:4028 APP_HOST=localhost:4028 npx next start -p 4028
 *   ADMIN_HOST=admin.localhost:4028 APP_HOST=localhost:4028 npm run verify:admin
 *
 * The admin surface is reached by sending an explicit Host header, which is
 * how the proxy and the guards decide which application answers. That means
 * this works against a plain `next dev` on one port with no DNS setup.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4028';

const STAMP = Date.now();
const TRADER_EMAIL = `__adm_trader_${STAMP}@invalid.test`;
const SECOND_TRADER_EMAIL = `__adm_trader2_${STAMP}@invalid.test`;
const MAIN_EMAIL = `__adm_main_${STAMP}@invalid.test`;
const LIMITED_EMAIL = `__adm_limited_${STAMP}@invalid.test`;
const TRADER_PASSWORD = 'TraderPassword#2026';
const TRADER_PIN = '620487';

// Unique per run: the active-address index is platform-wide now, so a fixed
// coin would collide with a real published address on a populated database.
const COIN = `VF${String(STAMP).slice(-6)}`;
const NETWORK = `VerifyNet${STAMP}`;
const ADMIN_PASSWORD = 'AdminConsole#Password2026';
const MAIN_PIN = '481902';
const LIMITED_PIN = '739104';

/**
 * Mirrors MAX_ADMIN_LOGIN_ATTEMPTS in src/lib/admin/credentials.ts.
 *
 * Restated rather than imported because this script runs on plain node and
 * cannot resolve the TypeScript sources or the `@/` alias - the same reason
 * scripts/bootstrap-admin.mjs restates the PBKDF2 parameters. If the limit
 * changes there it has to change here, and the lockout check below will say so
 * by failing.
 */
const MAX_ADMIN_LOGIN_ATTEMPTS = 5;

/**
 * Cookie names differ by environment: production adds the __Host- prefix,
 * which needs Secure and so cannot be used against http://admin.localhost.
 * The script has to find the cookie either way, or running it against a
 * production build reports three false failures.
 */
function findCookie(jar, baseName) {
  return jar[`__Host-${baseName}`] ?? jar[baseName] ?? null;
}

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

// --- assertions -----------------------------------------------------------

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? `  → ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// --- request helpers ------------------------------------------------------

/**
 * The admin hostname, sent as a Host header.
 *
 * classifyHost falls back to "anything beginning with admin." when ADMIN_HOST
 * is unset, which is the development posture, so this works either way.
 */
const ADMIN_HOST = (process.env.ADMIN_HOST || 'admin.localhost').replace(/^https?:\/\//, '');
const APP_HOST = (process.env.APP_HOST || new URL(BASE).host).replace(/^https?:\/\//, '');

function parseSetCookie(setCookieHeaders) {
  const jar = {};
  for (const cookie of setCookieHeaders ?? []) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index === -1) continue;
    jar[pair.slice(0, index).trim()] = pair.slice(index + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

const TARGET = new URL(BASE);

/**
 * node:http rather than fetch, for one reason: Host.
 *
 * Host is a forbidden header name in fetch - undici drops it silently, so
 * every request arrives claiming the origin's own hostname and the whole
 * point of this script evaporates into passing tests. The lower-level client
 * lets the connection go to 127.0.0.1 while the Host header says
 * admin.localhost, which is exactly what a reverse proxy in front of two
 * hostnames does.
 */
function raw(path, { host, method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(body) : null;
    const request_ = http.request(
      {
        host: TARGET.hostname,
        port: TARGET.port || 80,
        path,
        method,
        headers: {
          ...headers,
          Host: host,
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    request_.on('error', reject);
    if (payload) request_.write(payload);
    request_.end();
  });
}

/**
 * A client IP belonging to this run and nothing else.
 *
 * Admin login is rate limited by IP at 20 attempts per 15 minutes, and this
 * script spends a dozen of them - deliberately, since it tests wrong passwords
 * and lockout. Sharing the default 'unknown' bucket with the developer's own
 * browser would mean the script and a human signing in eat the same allowance,
 * and two runs inside the window would exhaust it and fail for a reason that
 * has nothing to do with the code under test. A per-run address keeps the
 * bucket private and makes it exactly deletable at cleanup.
 *
 * getClientIp trusts x-forwarded-for, which is the whole reason IP is only
 * ever half a limit key in this application - see the note in rate-limit.ts.
 */
const RUN_IP = `203.0.113.${(Number(STAMP) % 254) + 1}`;

async function request(path, { host = ADMIN_HOST, jar = {}, method = 'GET', body, unlock } = {}) {
  const response = await raw(path, {
    host,
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
      'x-forwarded-for': RUN_IP,
      // The trader app's dashboard endpoints sit behind the PIN gate, so the
      // trader half of this script has to present an unlock token the same way
      // the real dashboard does.
      ...(unlock ? { 'x-dashboard-unlock': unlock } : {}),
    },
  });

  let payload = null;
  if ((response.headers['content-type'] ?? '').includes('application/json')) {
    try {
      payload = JSON.parse(response.body.toString('utf8'));
    } catch {
      payload = null;
    }
  }

  Object.assign(jar, parseSetCookie(response.headers['set-cookie']));
  return {
    status: response.status,
    payload,
    // Kept fetch-shaped so assertions read the same either way.
    headers: { get: (name) => response.headers[name.toLowerCase()] ?? null },
    jar,
  };
}

/** Signs an admin in through both factors and returns the cookie jar. */
async function signInAdmin(email, pin, { setPin = false } = {}) {
  const jar = {};
  const first = await request('/api/admin/auth/login', {
    jar,
    method: 'POST',
    body: { email, password: ADMIN_PASSWORD },
  });
  if (first.status !== 200) {
    throw new Error(
      `Password step failed for ${email}: ${first.status} ${JSON.stringify(first.payload)}`
    );
  }
  const second = await request('/api/admin/auth/pin', {
    jar,
    method: 'POST',
    body: setPin ? { pin, confirmPin: pin } : { pin },
  });
  if (second.status !== 200) {
    throw new Error(
      `PIN step failed for ${email}: ${second.status} ${JSON.stringify(second.payload)}`
    );
  }
  return { jar, admin: second.payload };
}

/** Signs a trader in to the trader app and returns the cookie jar. */
async function appSignIn(email, password) {
  const jar = {};
  const response = await request('/api/auth/signin', {
    host: APP_HOST,
    jar,
    method: 'POST',
    body: { email, password },
  });
  if (!jar.auth_session) {
    throw new Error(
      `Trader sign-in failed for ${email}: ${response.status} ${JSON.stringify(response.payload)}`
    );
  }
  return jar;
}

// --- fixtures -------------------------------------------------------------

const ITERATIONS = 100_000;

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.pbkdf2Sync(secret, salt, ITERATIONS, 64, 'sha512').toString('hex')}`;
}

async function main() {
  loadEnv();
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const adminUsers = db.collection('adminusers');
  const adminSessions = db.collection('adminsessions');
  const deposits = db.collection('deposits');
  const depositAddresses = db.collection('depositaddresses');
  const ledger = db.collection('ledgerentries');
  const auditLogs = db.collection('adminauditlogs');

  console.log(`\nAdmin console verification against ${BASE}`);
  console.log(`admin host: ${ADMIN_HOST}   app host: ${APP_HOST}`);

  const now = new Date();
  let traderId;
  let secondTraderId;
  let mainId;
  let limitedId;
  let lockoutId;
  let addressId;
  let traderUnlock;

  try {
    // --- fixtures ---------------------------------------------------------

    const trader = await users.insertOne({
      name: 'Verify Trader',
      email: TRADER_EMAIL,
      role: 'Trader',
      passwordHash: hashSecret(TRADER_PASSWORD),
      status: 'active',
      kycStatus: 'verified',
      walletBalanceMinor: 0,
      walletBalance: 0,
      tokenVersion: 0,
      pinFailedAttempts: 0,
      loginFailedAttempts: 0,
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
    });
    traderId = trader.insertedId;

    // A second trader with nothing assigned to them. Platform addresses are
    // meant to reach an account no operator has ever touched, and only a
    // second account can show that.
    const secondTrader = await users.insertOne({
      name: 'Verify Trader Two',
      email: SECOND_TRADER_EMAIL,
      role: 'Trader',
      passwordHash: hashSecret(TRADER_PASSWORD),
      status: 'active',
      kycStatus: 'verified',
      walletBalanceMinor: 0,
      walletBalance: 0,
      tokenVersion: 0,
      pinFailedAttempts: 0,
      loginFailedAttempts: 0,
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
    });
    secondTraderId = secondTrader.insertedId;

    const adminBase = {
      passwordHash: hashSecret(ADMIN_PASSWORD),
      status: 'active',
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      loginFailedAttempts: 0,
      loginLockedUntil: null,
      createdByAdminId: null,
      disabledAt: null,
      disabledByAdminId: null,
      disabledReason: '',
      mustChangePassword: false,
      // Set on first sign-in through the real endpoint, so the PIN path is
      // exercised rather than seeded around.
      mustSetPin: true,
      lastLoginAt: null,
      lastLoginIp: '',
      migratedFromUserId: null,
      createdAt: now,
      updatedAt: now,
    };

    // A second MainAdmin cannot exist, and the deployment may already have
    // one, so the "MainAdmin" of this run is an Admin holding every grantable
    // permission. The MainAdmin-only rules are asserted against it below -
    // which is the stronger test anyway: it proves those rules do not fall to
    // a fully-permissioned delegate.
    const main = await adminUsers.insertOne({
      ...adminBase,
      name: 'Verify Operator',
      email: MAIN_EMAIL,
      role: 'Admin',
      grantedPermissions: [
        'trader.create',
        'trader.update',
        'trader.suspend',
        'deposit_address.manage',
        'deposit.authorize',
        'ledger.adjust',
      ],
    });
    mainId = main.insertedId;

    const limited = await adminUsers.insertOne({
      ...adminBase,
      name: 'Verify Reviewer',
      email: LIMITED_EMAIL,
      role: 'Admin',
      grantedPermissions: [],
    });
    limitedId = limited.insertedId;

    // --- sign-in ----------------------------------------------------------

    section('Authentication');

    const wrongPassword = await request('/api/admin/auth/login', {
      method: 'POST',
      body: { email: MAIN_EMAIL, password: 'not-the-password' },
    });
    check(
      'wrong password is rejected',
      wrongPassword.status === 401,
      `got ${wrongPassword.status}`
    );

    const unknownAccount = await request('/api/admin/auth/login', {
      method: 'POST',
      body: { email: `__nobody_${STAMP}@invalid.test`, password: ADMIN_PASSWORD },
    });
    check(
      'unknown account answers identically to a wrong password',
      unknownAccount.status === wrongPassword.status &&
        unknownAccount.payload?.error === wrongPassword.payload?.error
    );

    // --- the limiter actually limits ---------------------------------------
    //
    // This script passed 75/75 for weeks while every rate limit in the
    // application was a no-op: consumeAttempt threw on every call (Mongoose 9
    // requires `updatePipeline: true` for pipeline updates), the catch logged
    // and returned `limited: false`, and nothing here ever asserted that a
    // limit was reached. Wrong passwords were rejected one at a time, which is
    // all the tests above check, so brute force was unthrottled and green.
    //
    // Runs against its own throwaway account: exhausting MAIN_EMAIL's window
    // would 429 every sign-in below it and cascade into a dozen false
    // failures.
    const lockoutEmail = `__lockout_${STAMP}@invalid.test`;
    const lockoutAdmin = await adminUsers.insertOne({
      name: 'Lockout fixture',
      email: lockoutEmail,
      role: 'Admin',
      status: 'active',
      passwordHash: hashSecret(ADMIN_PASSWORD),
      grantedPermissions: [],
      createdByAdminId: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      loginFailedAttempts: 0,
      loginLockedUntil: null,
      disabledAt: null,
      disabledByAdminId: null,
      disabledReason: '',
      mustChangePassword: false,
      mustSetPin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    lockoutId = lockoutAdmin.insertedId;

    const lockoutAttempts = [];
    for (let i = 0; i < MAX_ADMIN_LOGIN_ATTEMPTS + 1; i += 1) {
      const attempt = await request('/api/admin/auth/login', {
        method: 'POST',
        body: { email: lockoutEmail, password: 'not-the-password' },
      });
      lockoutAttempts.push(attempt);
    }

    const throttled = lockoutAttempts.filter((a) => a.status === 429);
    check(
      `wrong passwords stop being answered after ${MAX_ADMIN_LOGIN_ATTEMPTS}`,
      throttled.length > 0,
      `all ${lockoutAttempts.length} got through: ${lockoutAttempts.map((a) => a.status).join(',')}`
    );

    // Distinguishes the two throttles that can produce a 429 here. The
    // per-account `loginFailedAttempts` counter is a separate control and was
    // working the whole time; only the limiter's own message proves the
    // limiter fired.
    check(
      'and it is the rate limiter that refuses, not just the account lock',
      throttled.some((a) => /too many attempts for this account/i.test(a.payload?.error ?? '')),
      `messages: ${throttled.map((a) => a.payload?.error).join(' | ') || 'none'}`
    );

    // The correct password must not open the door while the window is closed.
    // Without this the limiter could be counting and still be bypassable.
    const rightPasswordWhileLimited = await request('/api/admin/auth/login', {
      method: 'POST',
      body: { email: lockoutEmail, password: ADMIN_PASSWORD },
    });
    check(
      'the correct password is refused while the window is closed',
      rightPasswordWhileLimited.status === 429,
      `got ${rightPasswordWhileLimited.status}`
    );

    const passwordOnly = await request('/api/admin/auth/login', {
      method: 'POST',
      body: { email: MAIN_EMAIL, password: ADMIN_PASSWORD },
    });
    check(
      'password step returns no admin session cookie',
      !findCookie(passwordOnly.jar, 'aegis_admin_session')
    );
    check(
      'password step issues a challenge cookie',
      Boolean(findCookie(passwordOnly.jar, 'aegis_admin_challenge'))
    );

    const noSession = await request('/api/admin/overview', { jar: passwordOnly.jar });
    check(
      'the challenge alone reaches nothing',
      noSession.status === 401,
      `got ${noSession.status}`
    );

    const operator = await signInAdmin(MAIN_EMAIL, MAIN_PIN, { setPin: true });
    check(
      'password + PIN mints a session',
      Boolean(findCookie(operator.jar, 'aegis_admin_session'))
    );

    const reviewer = await signInAdmin(LIMITED_EMAIL, LIMITED_PIN, { setPin: true });
    check(
      'a second admin can sign in independently',
      Boolean(findCookie(reviewer.jar, 'aegis_admin_session'))
    );

    const session = await request('/api/admin/auth/session', { jar: operator.jar });
    check(
      'session endpoint reports the signed-in admin',
      session.payload?.admin?.email === MAIN_EMAIL
    );
    check(
      'the operator holds deposit.authorize',
      session.payload?.permissions?.includes('deposit.authorize')
    );

    const reviewerSession = await request('/api/admin/auth/session', { jar: reviewer.jar });
    check(
      'the reviewer does not hold deposit.authorize',
      !reviewerSession.payload?.permissions?.includes('deposit.authorize')
    );
    check(
      'no Admin ever holds admin.manage, whatever is granted',
      !session.payload?.permissions?.includes('admin.manage') &&
        !reviewerSession.payload?.permissions?.includes('admin.manage')
    );

    // --- cross-subdomain isolation ---------------------------------------

    section('Cross-subdomain isolation');

    const traderJar = {};
    await request('/api/auth/signin', {
      host: APP_HOST,
      jar: traderJar,
      method: 'POST',
      body: { email: TRADER_EMAIL, password: TRADER_PASSWORD },
    });
    check('the trader can sign in to the trader app', Boolean(traderJar.auth_session));

    // The fixture has no PIN, so setting one is both how it gets past the
    // dashboard gate and a check that the create-PIN path hands back a working
    // unlock. Everything the trader does below carries this token.
    const traderPinSetup = await request('/api/auth/pin/set', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
      method: 'POST',
      body: { pin: TRADER_PIN, confirmPin: TRADER_PIN },
    });
    traderUnlock = traderPinSetup.payload?.unlockToken;
    check(
      'the trader can set a PIN and unlock their dashboard',
      Boolean(traderUnlock),
      `got ${traderPinSetup.status}`
    );

    const traderOnAdmin = await request('/api/admin/overview', { jar: { ...traderJar } });
    check(
      'a valid trader session buys nothing on the admin API',
      traderOnAdmin.status === 401,
      `got ${traderOnAdmin.status}`
    );

    const adminOnAppHost = await request('/api/admin/overview', {
      host: APP_HOST,
      jar: { ...operator.jar },
    });
    check(
      'the admin API does not exist on the trader hostname',
      adminOnAppHost.status === 404,
      `got ${adminOnAppHost.status}`
    );

    const consoleOnAppHost = await request('/admin', { host: APP_HOST, jar: { ...operator.jar } });
    check(
      'the console page does not exist on the trader hostname',
      consoleOnAppHost.status === 404,
      `got ${consoleOnAppHost.status}`
    );

    const traderApiOnAdminHost = await request('/api/notifications', {
      host: ADMIN_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
    });
    check(
      'trader endpoints are not served on the admin hostname',
      traderApiOnAdminHost.status === 404,
      `got ${traderApiOnAdminHost.status}`
    );

    const anonymous = await request('/admin/deposits');
    check(
      'an unauthenticated console page redirects to sign-in',
      anonymous.status === 307 || anonymous.status === 302,
      `got ${anonymous.status}`
    );

    const headers = await request('/admin/login');
    check('the console refuses to be framed', headers.headers.get('x-frame-options') === 'DENY');
    check(
      'the console sets frame-ancestors none',
      (headers.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'")
    );
    // Two assertions, because `next dev` is the exception.
    //
    // The API answer is no-store in both modes - it comes from the route
    // handler, which Next does not rewrite. The page answer is no-store in a
    // production build (the headers() block in next.config.mjs), but `next
    // dev` replaces Cache-Control on HTML with its own `no-cache,
    // must-revalidate` and there is no way to stop it. So the page is held to
    // "at minimum, revalidate before use", and the stronger claim is made
    // against the response that can carry it in both modes.
    const apiHeaders = await request('/api/admin/overview');
    check(
      'admin API responses are never stored',
      (apiHeaders.headers.get('cache-control') ?? '').includes('no-store'),
      apiHeaders.headers.get('cache-control') ?? 'absent'
    );
    check(
      'console pages are never served from cache without revalidating',
      (headers.headers.get('cache-control') ?? '').includes('no-cache'),
      headers.headers.get('cache-control') ?? 'absent'
    );
    check(
      'the console is not indexable',
      (headers.headers.get('x-robots-tag') ?? '').includes('noindex')
    );
    check('the console sets nosniff', headers.headers.get('x-content-type-options') === 'nosniff');

    // --- role enforcement --------------------------------------------------

    section('Role enforcement');

    const reviewerDeposits = await request('/api/admin/deposits', { jar: reviewer.jar });
    check(
      'the reviewer can read the deposit queue',
      reviewerDeposits.status === 200,
      `got ${reviewerDeposits.status}`
    );

    const reviewerAdmins = await request('/api/admin/admins', {
      jar: reviewer.jar,
      method: 'POST',
      body: { name: 'Nope', email: `__nope_${STAMP}@invalid.test`, permissions: [] },
    });
    check(
      'an Admin cannot create admin accounts',
      reviewerAdmins.status === 403,
      `got ${reviewerAdmins.status}`
    );

    const operatorAdmins = await request('/api/admin/admins', {
      jar: operator.jar,
      method: 'POST',
      body: { name: 'Nope', email: `__nope2_${STAMP}@invalid.test`, permissions: [] },
    });
    check(
      'even a fully-granted Admin cannot create admin accounts',
      operatorAdmins.status === 403,
      `got ${operatorAdmins.status}`
    );

    const reviewerAdjust = await request(`/api/admin/traders/${traderId}/balance`, {
      jar: reviewer.jar,
      method: 'POST',
      body: { targetBalanceMinor: 999999, expectedBalanceMinor: 0, reason: 'should not work' },
    });
    check(
      'an Admin without ledger.adjust cannot move a balance',
      reviewerAdjust.status === 403,
      `got ${reviewerAdjust.status}`
    );

    const reviewerAddress = await request('/api/admin/deposit-addresses', {
      jar: reviewer.jar,
      method: 'POST',
      body: {
        coin: 'BTC',
        network: 'Bitcoin',
        address: 'bc1qverify0000',
      },
    });
    check(
      'an Admin without deposit_address.manage cannot publish an address',
      reviewerAddress.status === 403,
      `got ${reviewerAddress.status}`
    );

    // --- deposit addresses -------------------------------------------------

    section('Deposit addresses');

    const published = await request('/api/admin/deposit-addresses', {
      jar: operator.jar,
      method: 'POST',
      body: {
        coin: COIN,
        network: NETWORK,
        address: `TVerify${STAMP}`,
        memoTag: `memo${STAMP}`,
        label: 'verification fixture',
      },
    });
    check('an address can be published', published.status === 201, `got ${published.status}`);
    addressId = published.payload?.address?.id;
    check(
      'a published address is platform-scoped, not owned by a trader',
      published.payload?.address?.scope === 'platform',
      `scope ${published.payload?.address?.scope}`
    );

    const duplicate = await request('/api/admin/deposit-addresses', {
      jar: operator.jar,
      method: 'POST',
      body: {
        coin: COIN,
        network: NETWORK,
        address: `TVerifyOther${STAMP}`,
      },
    });
    check(
      'a second active address for the same asset is refused',
      duplicate.status === 409,
      `got ${duplicate.status}`
    );

    const traderAddresses = await request('/api/deposit-addresses', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
    });
    const seen = Array.isArray(traderAddresses.payload)
      ? traderAddresses.payload.find((entry) => entry.id === addressId)
      : null;
    check('the trader is shown the published address', Boolean(seen));
    check(
      'the address carries its coin, network and memo',
      Boolean(seen) &&
        seen.coin === COIN &&
        seen.network === NETWORK &&
        seen.memoTag === `memo${STAMP}`,
      `got ${JSON.stringify(seen)}`
    );

    // The whole point of the change: one address serves everybody. A second
    // trader who was never assigned anything must still see it.
    const secondSession = await appSignIn(SECOND_TRADER_EMAIL, TRADER_PASSWORD);
    // Their own PIN, their own unlock. One trader's token opens nothing for
    // another, which is asserted directly in verify-dashboard-pin-gate.mjs.
    const secondSetup = await request('/api/auth/pin/set', {
      host: APP_HOST,
      jar: { ...secondSession },
      method: 'POST',
      body: { pin: '905132', confirmPin: '905132' },
    });
    const secondAddresses = await request('/api/deposit-addresses', {
      host: APP_HOST,
      jar: { ...secondSession },
      unlock: secondSetup.payload?.unlockToken,
    });
    check(
      'every trader is shown the same address, with nothing assigned to them',
      Array.isArray(secondAddresses.payload) &&
        secondAddresses.payload.some((entry) => entry.id === addressId)
    );

    // The retired per-trader rows must not resurface as deposit targets.
    const legacyId = (
      await depositAddresses.insertOne({
        scope: 'trader',
        userId: traderId,
        coin: 'LEGACY',
        network: 'Legacy',
        address: `TLegacy${STAMP}`,
        status: 'inactive',
        createdAt: now,
        updatedAt: now,
      })
    ).insertedId;

    const legacyVisible = await request('/api/deposit-addresses', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
    });
    check(
      'a retired per-trader address is never shown to the trader',
      Array.isArray(legacyVisible.payload) &&
        !legacyVisible.payload.some((entry) => entry.id === String(legacyId))
    );

    const legacyClaim = await request('/api/deposits', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
      method: 'POST',
      body: {
        depositAddressId: String(legacyId),
        assetAmount: '1',
        txReference: `0xlegacy${STAMP}`,
      },
    });
    check(
      'a deposit cannot be claimed against a retired address',
      legacyClaim.status === 404,
      `got ${legacyClaim.status}`
    );

    // --- deposit authorization --------------------------------------------

    section('Deposit authorization');

    const claim = await request('/api/deposits', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
      method: 'POST',
      body: {
        depositAddressId: addressId,
        assetAmount: '250.5',
        txReference: `0xverify${STAMP}`,
      },
    });
    const claimed = claim.payload ?? {};
    check('a trader can declare a deposit', claim.status === 201, `got ${claim.status}`);
    check('a declared deposit starts pending', claimed.status === 'pending');

    const balanceBefore = (await users.findOne({ _id: traderId })).walletBalanceMinor ?? 0;
    check('declaring a deposit credits nothing', balanceBefore === 0, `balance ${balanceBefore}`);

    // The route that used to let a trader credit themselves any amount. If it
    // ever comes back, everything above it stops meaning anything.
    const selfCredit = await request('/api/wallet', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
      method: 'POST',
      body: { amount: 100000 },
    });
    check(
      'a trader cannot credit their own wallet',
      selfCredit.status === 405,
      `got ${selfCredit.status}`
    );
    const afterSelfCredit = (await users.findOne({ _id: traderId })).walletBalanceMinor ?? 0;
    check(
      'the refused self-credit moved nothing',
      afterSelfCredit === balanceBefore,
      `balance ${afterSelfCredit}`
    );

    const reviewerApprove = await request(`/api/admin/deposits/${claimed.id}`, {
      jar: reviewer.jar,
      method: 'PATCH',
      body: { action: 'approve', creditAmountMinor: 25050, txReference: claimed.id },
    });
    check(
      'an Admin without deposit.authorize cannot approve',
      reviewerApprove.status === 403,
      `got ${reviewerApprove.status}`
    );

    const noReference = await request(`/api/admin/deposits/${claimed.id}`, {
      jar: operator.jar,
      method: 'PATCH',
      body: { action: 'approve', creditAmountMinor: 25050, txReference: '' },
    });
    check(
      'approving without a transaction reference is refused',
      noReference.status === 400,
      `got ${noReference.status}`
    );

    const approved = await request(`/api/admin/deposits/${claimed.id}`, {
      jar: operator.jar,
      method: 'PATCH',
      body: {
        action: 'approve',
        creditAmountMinor: 25050,
        txReference: `0xverify${STAMP}`,
        reviewNote: '6 confirmations',
      },
    });
    check('the operator can authorize', approved.status === 200, `got ${approved.status}`);
    check('the wallet is credited', approved.payload?.balanceMinor === 25050);

    const reApprove = await request(`/api/admin/deposits/${claimed.id}`, {
      jar: operator.jar,
      method: 'PATCH',
      body: { action: 'approve', creditAmountMinor: 25050, txReference: `0xverify${STAMP}` },
    });
    check(
      'an approved deposit cannot be approved again',
      reApprove.status === 409,
      `got ${reApprove.status}`
    );

    // --- concurrency -------------------------------------------------------

    section('Concurrent authorization');

    const raceClaim = await request('/api/deposits', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
      method: 'POST',
      body: {
        depositAddressId: addressId,
        assetAmount: '100',
        txReference: `0xrace${STAMP}`,
      },
    });
    const raceDeposit = raceClaim.payload ?? {};

    const before = (await users.findOne({ _id: traderId })).walletBalanceMinor ?? 0;
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(`/api/admin/deposits/${raceDeposit.id}`, {
          // A fresh jar copy per attempt: a shared object would be mutated by
          // five concurrent Set-Cookie merges.
          jar: { ...operator.jar },
          method: 'PATCH',
          body: {
            action: 'approve',
            creditAmountMinor: 10000,
            txReference: `0xrace${STAMP}`,
          },
        })
      )
    );
    const successes = attempts.filter((attempt) => attempt.status === 200).length;
    const after = (await users.findOne({ _id: traderId })).walletBalanceMinor ?? 0;

    check(
      'five simultaneous approvals produce exactly one success',
      successes === 1,
      `${successes} succeeded`
    );
    check(
      'the balance moved by exactly one credit',
      after - before === 10000,
      `moved ${after - before}`
    );
    check(
      'exactly one deposit ledger entry exists for the race',
      (await ledger.countDocuments({
        userId: traderId,
        idempotencyKey: `deposit:${raceDeposit.id}`,
      })) === 1
    );

    // --- rejection ---------------------------------------------------------

    section('Rejection');

    const rejectClaim = await request('/api/deposits', {
      host: APP_HOST,
      jar: { ...traderJar },
      unlock: traderUnlock,
      method: 'POST',
      body: {
        depositAddressId: addressId,
        assetAmount: '5',
        txReference: `0xreject${STAMP}`,
      },
    });
    const rejectDeposit = rejectClaim.payload ?? {};

    const noReason = await request(`/api/admin/deposits/${rejectDeposit.id}`, {
      jar: operator.jar,
      method: 'PATCH',
      body: { action: 'reject', reason: '' },
    });
    check(
      'rejecting without a reason is refused',
      noReason.status === 400,
      `got ${noReason.status}`
    );

    const balanceBeforeReject = (await users.findOne({ _id: traderId })).walletBalanceMinor ?? 0;
    const rejected = await request(`/api/admin/deposits/${rejectDeposit.id}`, {
      jar: operator.jar,
      method: 'PATCH',
      body: { action: 'reject', reason: 'Sent on the wrong network.' },
    });
    check('a deposit can be rejected', rejected.status === 200, `got ${rejected.status}`);
    check(
      'rejection moves no money',
      ((await users.findOne({ _id: traderId })).walletBalanceMinor ?? 0) === balanceBeforeReject
    );

    // --- ledger integrity --------------------------------------------------

    section('Ledger integrity');

    const adjust = await request(`/api/admin/traders/${traderId}/balance`, {
      jar: operator.jar,
      method: 'POST',
      body: {
        targetBalanceMinor: 30000,
        expectedBalanceMinor: after,
        reason: 'Verification fixture correction',
      },
    });
    check('the operator can post an adjustment', adjust.status === 200, `got ${adjust.status}`);

    const stale = await request(`/api/admin/traders/${traderId}/balance`, {
      jar: operator.jar,
      method: 'POST',
      // Deliberately the balance from before the adjustment above.
      body: {
        targetBalanceMinor: 50000,
        expectedBalanceMinor: after,
        reason: 'Should be refused as stale',
      },
    });
    check(
      'an adjustment prepared from a stale balance is refused',
      stale.status === 409,
      `got ${stale.status}`
    );

    const noReasonAdjust = await request(`/api/admin/traders/${traderId}/balance`, {
      jar: operator.jar,
      method: 'POST',
      body: { targetBalanceMinor: 40000, expectedBalanceMinor: 30000, reason: '' },
    });
    check(
      'an adjustment without a reason is refused',
      noReasonAdjust.status === 400,
      `got ${noReasonAdjust.status}`
    );

    const entries = await ledger.find({ userId: traderId }).toArray();
    const summed = entries.reduce((total, entry) => total + entry.amountMinor, 0);
    const cached = (await users.findOne({ _id: traderId })).walletBalanceMinor ?? 0;
    check(
      'the cached balance equals the sum of the ledger entries',
      cached === summed,
      `cached ${cached}, summed ${summed}`
    );
    check(
      'every entry amount is a whole number of minor units',
      entries.every((entry) => Number.isSafeInteger(entry.amountMinor))
    );
    check(
      'the adjustment names the admin who made it',
      entries.some(
        (entry) =>
          entry.type === 'admin_adjustment' && String(entry.actorAdminId) === String(mainId)
      )
    );

    // --- audit logging -----------------------------------------------------

    section('Audit logging');

    const trail = await auditLogs.find({ affectedUserId: traderId }).toArray();
    const actions = new Set(trail.map((entry) => entry.action));

    for (const action of ['deposit.approve', 'deposit.reject', 'ledger.adjust']) {
      check(`${action} is recorded`, actions.has(action));
    }

    // Publishing names no trader - the address is everybody's - so it is not
    // in the trail above and has to be found by what it does identify: the
    // admin who published it and the address itself.
    const publishEntry = await auditLogs.findOne({
      action: 'deposit_address.publish',
      reference: `TVerify${STAMP}`,
    });
    check('deposit_address.publish is recorded', Boolean(publishEntry));
    check(
      'the publication names the acting admin and no trader',
      String(publishEntry?.actorAdminId) === String(mainId) &&
        (publishEntry?.affectedUserId ?? null) === null,
      `actor ${publishEntry?.actorAdminId}, affected ${publishEntry?.affectedUserId}`
    );

    const approval = trail.find((entry) => entry.action === 'deposit.approve');
    check('the approval names the acting admin', String(approval?.actorAdminId) === String(mainId));
    check('the approval names the admin email', approval?.actorEmail === MAIN_EMAIL);
    check('the approval carries the transaction reference', Boolean(approval?.reference));
    check('the approval records the session it came from', Boolean(approval?.sessionId));
    check('the approval records an IP', typeof approval?.ip === 'string');
    check(
      'the approval records before and after balances',
      typeof approval?.before?.walletBalanceMinor === 'number' &&
        typeof approval?.after?.walletBalanceMinor === 'number'
    );

    const adjustment = trail.find((entry) => entry.action === 'ledger.adjust');
    check('the adjustment records a reason', Boolean(adjustment?.reason));

    // Not asserted here: that audit rows cannot be rewritten. The Mongoose
    // pre-hooks refuse update and delete, but this script talks to the raw
    // driver, which bypasses them - and so would anyone with the database
    // credentials. The durable control is a database role holding insert-only
    // rights on this collection, which is a deployment concern and not
    // something a request-level test can demonstrate either way.

    const loggedRead = await request('/api/admin/audit-logs?targetType=deposit', {
      jar: operator.jar,
    });
    check('the audit log is queryable', loggedRead.status === 200, `got ${loggedRead.status}`);
    check(
      'the audit filter narrows by target type',
      Array.isArray(loggedRead.payload?.entries) &&
        loggedRead.payload.entries.every((entry) => entry.targetType === 'deposit')
    );

    // --- revocation --------------------------------------------------------

    section('Session revocation');

    await request('/api/admin/auth/logout', { jar: reviewer.jar, method: 'POST' });
    const afterLogout = await request('/api/admin/auth/session', { jar: reviewer.jar });
    check(
      'a signed-out session stops working',
      afterLogout.status === 401,
      `got ${afterLogout.status}`
    );

    await adminUsers.updateOne({ _id: mainId }, { $set: { status: 'suspended' } });
    const afterSuspend = await request('/api/admin/overview', { jar: operator.jar });
    check(
      'suspending an admin ends their access immediately',
      afterSuspend.status === 401,
      `got ${afterSuspend.status}`
    );
    await adminUsers.updateOne({ _id: mainId }, { $set: { status: 'active' } });
  } finally {
    // --- teardown ---------------------------------------------------------

    for (const id of [traderId, secondTraderId].filter(Boolean)) {
      await deposits.deleteMany({ userId: id });
      await depositAddresses.deleteMany({ userId: id });
      await ledger.deleteMany({ userId: id });
      await auditLogs.deleteMany({ affectedUserId: id });
      await db.collection('notifications').deleteMany({ userId: id });
      await users.deleteOne({ _id: id });
    }

    // Published addresses belong to no trader, so the loop above misses them.
    // Matched on the run's own coin and network, which nothing else uses.
    await depositAddresses.deleteMany({ coin: COIN, network: NETWORK });
    await auditLogs.deleteMany({ reference: { $regex: `Verify.*${STAMP}` } });
    await db.collection('notifications').deleteMany({
      dedupeKey: { $regex: `^deposit-address-(publish|withdraw|rotate):` },
      title: { $regex: `^${COIN} ` },
    });
    for (const id of [mainId, limitedId, lockoutId].filter(Boolean)) {
      await adminSessions.deleteMany({ adminId: id });
      await auditLogs.deleteMany({ actorAdminId: id });
      await adminUsers.deleteOne({ _id: id });
    }
    /*
     * Every bucket this run created.
     *
     * Until the limiter was fixed, consumeAttempt threw on every call and no
     * bucket document was ever written, so this cleanup had nothing to do and
     * its gaps could not show. Now that the writes land, they have to be
     * accounted for:
     *
     *   admin-login-ip:<RUN_IP>       the run's own IP allowance. Left behind,
     *                                 consecutive runs would share the
     *                                 20-per-15-minute cap and the second
     *                                 would 429 on a correct password.
     *   admin-login-account:<email>   the two fixture admins, the lockout
     *                                 fixture, and the __nobody_ address used
     *                                 by the account-enumeration check.
     *   deposit-claim:<traderId>      written by the trader half of the
     *                                 script; its accounts are deleted above.
     *
     * The TTL index would eventually reclaim all of these, but "eventually" is
     * up to an hour for the deposit window, and a verification script should
     * not leave state behind that outlives the thing it was verifying.
     */
    await db.collection('ratelimitbuckets').deleteMany({
      $or: [
        {
          key: { $regex: `(${MAIN_EMAIL}|${LIMITED_EMAIL}|__lockout_${STAMP}|__nobody_${STAMP})` },
        },
        // Exact match, so the dots stay literal - no escaping here.
        { key: `admin-login-ip:${RUN_IP}` },
        {
          key: {
            $in: [traderId, secondTraderId].filter(Boolean).map((id) => `deposit-claim:${id}`),
          },
        },
      ],
    });

    console.log(`\n${passed} passed, ${failures.length} failed`);
    if (failures.length) {
      console.log('\nFailures:');
      for (const failure of failures) console.log(`  · ${failure}`);
    }
    await mongoose.disconnect();
    process.exit(failures.length ? 1 : 0);
  }
}

main().catch(async (error) => {
  console.error('\nVerification aborted:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
