/**
 * End-to-end checks for the notification centre.
 *
 * The bell used to be a button with no handler and a permanently-lit red dot,
 * and achievement unlocks were announced only as a toast that faded. The
 * properties worth proving here are the ones that decide whether the panel can
 * be trusted:
 *
 *   - Notifications are per-user and scoped by session, not by a parameter.
 *     One account must never see another's, and there is no id to tamper with.
 *   - Achievements announce exactly once. The grant and the announcement are
 *     two writes, so a replay or a repair must not produce a second entry -
 *     the partial unique index on (userId, dedupeKey) is what guarantees it.
 *   - Genuinely repeatable events are NOT deduped. A second KYC rejection
 *     after a resubmission, or a second PIN change, must each produce their
 *     own entry; that is why the index is partial rather than covering nulls.
 *   - A failed announcement never fails the operation that triggered it.
 *   - Marking read is also scoped: another user's id in the body matches
 *     nothing rather than being updated.
 *
 * Uses two throwaway accounts it creates and removes.
 *
 *   npm run dev        # in another terminal
 *   node scripts/verify-notifications.mjs
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
const OWNER_EMAIL = `__notif_owner_${STAMP}@invalid.test`;
const OTHER_EMAIL = `__notif_other_${STAMP}@invalid.test`;
const ADMIN_EMAIL = `__notif_admin_${STAMP}@invalid.test`;
const PASSWORD = 'NotifPassword#2026';
// The console enforces a longer minimum than the trader app does.
const ADMIN_PASSWORD = 'NotifAdminPassword#2026';
const PIN = '481902';
const NEW_PIN = '739104';

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
  console.info(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)} ${actual} (expected ${expected})`);
}

/**
 * Notifications sit behind the dashboard PIN gate, so requests for them carry
 * an unlock token exactly as the real client does.
 *
 * Keyed by session cookie rather than held in one variable: this script runs
 * two accounts at once and signs the owner back in twice, and a single shared
 * token would silently be the wrong one for whichever account asked last.
 */
const unlockTokens = new Map();

const req = (method, path, body, cookie) => {
  const unlock = cookie ? unlockTokens.get(cookie) : null;
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `auth_session=${cookie}` } : {}),
      ...(unlock ? { 'x-dashboard-unlock': unlock } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};

const sessionCookie = (response) =>
  (response.headers.get('set-cookie') || '').match(/auth_session=([^;]+)/)?.[1] ?? null;

/**
 * Requests to the admin console, which lives on a different hostname.
 *
 * node:http rather than fetch, because Host is a forbidden header name in
 * fetch - undici drops it silently, and every request would arrive claiming
 * the trader origin, where /api/admin correctly 404s. The lower-level client
 * connects to the same port while the Host header says admin.localhost, which
 * is what a reverse proxy in front of two hostnames does.
 */
const ADMIN_HOST = (process.env.ADMIN_HOST || 'admin.localhost').replace(/^https?:\/\//, '');
const TARGET = new URL(BASE);

function adminReq(method, path, body, jar = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const cookie = Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: TARGET.hostname,
        port: TARGET.port || 80,
        path,
        method,
        headers: {
          Host: ADMIN_HOST,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          for (const raw of response.headers['set-cookie'] ?? []) {
            const [pair] = raw.split(';');
            const index = pair.indexOf('=');
            if (index !== -1) jar[pair.slice(0, index).trim()] = pair.slice(index + 1);
          }
          resolve({ status: response.statusCode, jar });
        });
      }
    );
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

/** Password then PIN, the only way an admin session is minted. */
async function signInAdmin(email) {
  const jar = {};
  await adminReq('POST', '/api/admin/auth/login', { email, password: ADMIN_PASSWORD }, jar);
  await adminReq('POST', '/api/admin/auth/pin', { pin: PIN, confirmPin: PIN }, jar);
  return jar;
}

/**
 * The admin session cookie takes a __Host- prefix in production, which needs
 * Secure and so cannot be used against http://admin.localhost. Look under both
 * names, or this script reports a false failure on a production build.
 */
function adminSessionCookie(jar) {
  return jar['__Host-aegis_admin_session'] ?? jar.aegis_admin_session ?? null;
}

function pbkdf2(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(value, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${key}`;
}

function fixture(email, role, extra = {}) {
  return {
    name: `Notification fixture (${role})`,
    email,
    role,
    passwordHash: pbkdf2(PASSWORD),
    pinHash: pbkdf2(PIN),
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
    distinctBotStrategyTypes: [],
    portfolioReportCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

/**
 * Signs in and clears the dashboard gate, returning the session cookie.
 *
 * The password issues the session on its own now; the PIN is answered against
 * that session and yields an unlock token, which is stashed against the cookie
 * so every later request for dashboard data carries it.
 */
async function signIn(email, pin = PIN) {
  const r = await req('POST', '/api/auth/signin', { email, password: PASSWORD });
  const cookie = sessionCookie(r);
  const v = await req('POST', '/api/auth/pin/verify', { pin }, cookie);
  const { unlockToken } = await v.json().catch(() => ({}));
  if (unlockToken) unlockTokens.set(cookie, unlockToken);
  return cookie;
}

const listFor = async (cookie) =>
  (await req('GET', '/api/notifications', undefined, cookie)).json();

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');
  const adminUsers = mongoose.connection.db.collection('adminusers');
  const adminSessions = mongoose.connection.db.collection('adminsessions');
  const auditLogs = mongoose.connection.db.collection('adminauditlogs');
  const notifications = mongoose.connection.db.collection('notifications');
  const achievements = mongoose.connection.db.collection('userachievements');

  const owner = await users.insertOne(
    fixture(OWNER_EMAIL, 'Trader', {
      kycStatus: 'pending',
      kycSubmittedAt: new Date(),
      kycFullName: 'Notification Fixture',
      kycIdType: 'passport',
      kycIdNumberLast4: '4321',
      kycDocumentData: 'fixture-encrypted-document',
      kycDocumentProvided: true,
    })
  );
  const other = await users.insertOne(fixture(OTHER_EMAIL, 'Trader'));

  // The reviewer is an admin console account, not a user with role:'Admin'.
  // Since the console was split onto its own subdomain those are different
  // collections on different hostnames, and a trader session grants no admin
  // authority at all - which is why this fixture cannot just be another user.
  const admin = await adminUsers.insertOne({
    name: 'Notification fixture (reviewer)',
    email: ADMIN_EMAIL,
    role: 'Admin',
    status: 'active',
    passwordHash: pbkdf2(ADMIN_PASSWORD),
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
    lastLoginAt: null,
    lastLoginIp: '',
    migratedFromUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const ownerId = owner.insertedId;
  const otherId = other.insertedId;

  try {
    let ownerCookie = await signIn(OWNER_EMAIL);
    const otherCookie = await signIn(OTHER_EMAIL);
    const adminJar = await signInAdmin(ADMIN_EMAIL);
    check(
      'all three fixtures signed in',
      Boolean(ownerCookie && otherCookie && adminSessionCookie(adminJar)),
      true
    );

    // --- Access control ---------------------------------------------------
    console.info('\n=== ACCESS CONTROL ===');
    check('unauthenticated list', (await req('GET', '/api/notifications')).status, 401);
    check('unauthenticated mark-read', (await req('PATCH', '/api/notifications')).status, 401);

    // --- KYC decision -----------------------------------------------------
    console.info('\n=== KYC DECISION ===');
    let r = await adminReq(
      'PATCH',
      `/api/admin/kyc/${ownerId}`,
      { action: 'reject', reason: 'The document photo was too blurry to read.' },
      adminJar
    );
    check('admin rejected the application', r.status, 200);

    let list = await listFor(ownerCookie);
    const rejection = list.notifications.find((n) => n.type === 'kyc');
    check('a KYC notification was written', Boolean(rejection), true);
    check(
      "the reviewer's reason reached the applicant",
      rejection?.body?.includes('too blurry to read'),
      true
    );
    check('it links to the KYC page', rejection?.href, '/dashboard/kyc');
    check('it starts unread', rejection?.read, false);

    // A resubmission that is rejected again must produce a second entry. This
    // is the case a naive unique index would silently swallow.
    await adminReq(
      'PATCH',
      `/api/admin/kyc/${ownerId}`,
      { action: 'reject', reason: 'The name does not match the document.' },
      adminJar
    );
    check(
      'a second rejection is a second notification',
      await notifications.countDocuments({ userId: ownerId, type: 'kyc' }),
      2
    );

    // --- Achievements -----------------------------------------------------
    console.info('\n=== ACHIEVEMENTS ===');
    r = await adminReq('PATCH', `/api/admin/kyc/${ownerId}`, { action: 'approve' }, adminJar);
    check('admin approved the application', r.status, 200);

    check(
      'the verified_identity achievement was granted',
      await achievements.countDocuments({ userId: ownerId, achievementKey: 'verified_identity' }),
      1
    );
    check(
      'and announced exactly once',
      await notifications.countDocuments({
        userId: ownerId,
        dedupeKey: 'achievement:verified_identity',
      }),
      1
    );

    // Re-approving replays grantAchievement. The grant is already idempotent;
    // this proves the announcement is too, which is the half that is two
    // writes away from the thing it describes.
    const xpBeforeReplay = (await users.findOne({ _id: ownerId })).xp;
    await adminReq('PATCH', `/api/admin/kyc/${ownerId}`, { action: 'approve' }, adminJar);
    check(
      'replaying the grant does not announce twice',
      await notifications.countDocuments({
        userId: ownerId,
        dedupeKey: 'achievement:verified_identity',
      }),
      1
    );
    // The announcement is now attempted even when nothing was granted, so the
    // XP award must stay inside the new-grant branch or a replay would pay
    // out twice.
    check(
      'and does not award XP twice',
      (await users.findOne({ _id: ownerId })).xp,
      xpBeforeReplay
    );

    // The failure this guards against: the grant lands, the announcement does
    // not. Because the grant is idempotent it can never happen again, so if
    // the announcement were only attempted on a new grant the user would
    // never learn about an unlock they hold. Simulated by deleting the
    // notification while leaving the achievement in place.
    await notifications.deleteOne({
      userId: ownerId,
      dedupeKey: 'achievement:verified_identity',
    });
    await adminReq('PATCH', `/api/admin/kyc/${ownerId}`, { action: 'approve' }, adminJar);
    check(
      'a lost announcement is repaired on the next call',
      await notifications.countDocuments({
        userId: ownerId,
        dedupeKey: 'achievement:verified_identity',
      }),
      1
    );

    // --- Security events --------------------------------------------------
    console.info('\n=== SECURITY EVENTS ===');
    const beforePinChange = await notifications.countDocuments({
      userId: ownerId,
      type: 'security',
    });
    r = await req(
      'POST',
      '/api/auth/pin/change',
      { currentPin: PIN, pin: NEW_PIN, confirmPin: NEW_PIN },
      ownerCookie
    );
    check('PIN changed', r.status, 200);
    check(
      'the change was recorded as a security notification',
      (await notifications.countDocuments({ userId: ownerId, type: 'security' })) - beforePinChange,
      1
    );

    const security = await notifications.findOne({ userId: ownerId, type: 'security' });
    check(
      'it tells the user what to do if it was not them',
      /if this was not you/i.test(security?.body || ''),
      true
    );

    // Changing a PIN bumps tokenVersion, so the cookie that made the request
    // is now dead. Worth asserting rather than just working around: the
    // notification above was written for a session that no longer exists,
    // which is exactly the case where a durable record earns its keep.
    const staleCookie = ownerCookie;
    check(
      'the PIN change revoked the session that made it',
      (await req('GET', '/api/notifications', undefined, staleCookie)).status,
      401
    );
    ownerCookie = await signIn(OWNER_EMAIL, NEW_PIN);

    // --- Isolation between accounts ---------------------------------------
    console.info('\n=== ISOLATION ===');
    const otherList = await listFor(otherCookie);
    check("the other account's panel is empty", otherList.notifications.length, 0);
    check('and its unread count is zero', otherList.unreadCount, 0);

    const ownerNotificationIds = (await listFor(ownerCookie)).notifications.map((n) => n.id);
    r = await req('PATCH', '/api/notifications', { ids: ownerNotificationIds }, otherCookie);
    check("one account cannot mark another's as read", (await r.json()).updated, 0);

    // --- Unread accounting ------------------------------------------------
    console.info('\n=== UNREAD ACCOUNTING ===');
    list = await listFor(ownerCookie);
    const trueUnread = await notifications.countDocuments({ userId: ownerId, readAt: null });
    check('the badge matches the database', list.unreadCount, trueUnread);
    check('the panel returned entries', list.notifications.length > 0, true);
    check(
      'newest first',
      new Date(list.notifications[0].createdAt) >=
        new Date(list.notifications[list.notifications.length - 1].createdAt),
      true
    );

    r = await req('PATCH', '/api/notifications', undefined, ownerCookie);
    check('mark-all-read with no body succeeded', r.status, 200);
    check(
      'nothing is left unread',
      await notifications.countDocuments({ userId: ownerId, readAt: null }),
      0
    );
    check('and the badge agrees', (await listFor(ownerCookie)).unreadCount, 0);

    r = await req('PATCH', '/api/notifications', { ids: ['not-an-object-id'] }, ownerCookie);
    check('a malformed id is rejected, not thrown on', r.status, 400);

    // --- Repeatable events are not deduped --------------------------------
    console.info('\n=== REPEATABLE EVENTS ===');
    const beforeSecondChange = await notifications.countDocuments({
      userId: ownerId,
      type: 'security',
    });
    const freshCookie = await signIn(OWNER_EMAIL, NEW_PIN);
    r = await req(
      'POST',
      '/api/auth/pin/change',
      { currentPin: NEW_PIN, pin: PIN, confirmPin: PIN },
      freshCookie
    );
    check('a second PIN change succeeds', r.status, 200);
    check(
      'and produces its own notification',
      (await notifications.countDocuments({ userId: ownerId, type: 'security' })) -
        beforeSecondChange,
      1
    );
  } finally {
    await notifications.deleteMany({ userId: { $in: [ownerId, otherId] } });
    await achievements.deleteMany({ userId: { $in: [ownerId, otherId] } });
    await users.deleteMany({ email: { $in: [OWNER_EMAIL, OTHER_EMAIL] } });
    // The reviewer lives in the admin collections now, and leaves a session
    // and an audit trail behind it that the trader teardown never touched.
    await adminSessions.deleteMany({ adminId: admin.insertedId });
    await auditLogs.deleteMany({ actorAdminId: admin.insertedId });
    await auditLogs.deleteMany({ affectedUserId: ownerId });
    await adminUsers.deleteOne({ _id: admin.insertedId });
    console.info('\n  removed fixtures');
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
