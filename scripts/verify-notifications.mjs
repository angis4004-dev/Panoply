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

const req = (method, path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie: `auth_session=${cookie}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const sessionCookie = (response) =>
  (response.headers.get('set-cookie') || '').match(/auth_session=([^;]+)/)?.[1] ?? null;

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

async function signIn(email, pin = PIN) {
  const r = await req('POST', '/api/auth/signin', { email, password: PASSWORD });
  const { pendingToken } = await r.json();
  const v = await req('POST', '/api/auth/pin/verify', { pendingToken, pin });
  return sessionCookie(v);
}

const listFor = async (cookie) =>
  (await req('GET', '/api/notifications', undefined, cookie)).json();

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');
  const notifications = mongoose.connection.db.collection('notifications');
  const achievements = mongoose.connection.db.collection('userachievements');

  const owner = await users.insertOne(
    fixture(OWNER_EMAIL, 'Trader', {
      kycStatus: 'pending',
      kycSubmittedAt: new Date(),
      kycFullName: 'Notification Fixture',
      kycIdType: 'passport',
      kycIdNumberLast4: '4321',
    })
  );
  const other = await users.insertOne(fixture(OTHER_EMAIL, 'Trader'));
  const admin = await users.insertOne(fixture(ADMIN_EMAIL, 'Admin'));

  const ownerId = owner.insertedId;
  const otherId = other.insertedId;

  try {
    let ownerCookie = await signIn(OWNER_EMAIL);
    const otherCookie = await signIn(OTHER_EMAIL);
    const adminCookie = await signIn(ADMIN_EMAIL);
    check('all three fixtures signed in', Boolean(ownerCookie && otherCookie && adminCookie), true);

    // --- Access control ---------------------------------------------------
    console.info('\n=== ACCESS CONTROL ===');
    check('unauthenticated list', (await req('GET', '/api/notifications')).status, 401);
    check('unauthenticated mark-read', (await req('PATCH', '/api/notifications')).status, 401);

    // --- KYC decision -----------------------------------------------------
    console.info('\n=== KYC DECISION ===');
    let r = await req(
      'PATCH',
      `/api/admin/kyc/${ownerId}`,
      { action: 'reject', reason: 'The document photo was too blurry to read.' },
      adminCookie
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
    await req(
      'PATCH',
      `/api/admin/kyc/${ownerId}`,
      { action: 'reject', reason: 'The name does not match the document.' },
      adminCookie
    );
    check(
      'a second rejection is a second notification',
      await notifications.countDocuments({ userId: ownerId, type: 'kyc' }),
      2
    );

    // --- Achievements -----------------------------------------------------
    console.info('\n=== ACHIEVEMENTS ===');
    r = await req('PATCH', `/api/admin/kyc/${ownerId}`, { action: 'approve' }, adminCookie);
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
    await req('PATCH', `/api/admin/kyc/${ownerId}`, { action: 'approve' }, adminCookie);
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
    await req('PATCH', `/api/admin/kyc/${ownerId}`, { action: 'approve' }, adminCookie);
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
    check('a malformed id is rejected, not thrown on', r.status, 200);

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
    await notifications.deleteMany({ userId: { $in: [ownerId, otherId, admin.insertedId] } });
    await achievements.deleteMany({ userId: { $in: [ownerId, otherId, admin.insertedId] } });
    await users.deleteMany({ email: { $in: [OWNER_EMAIL, OTHER_EMAIL, ADMIN_EMAIL] } });
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
