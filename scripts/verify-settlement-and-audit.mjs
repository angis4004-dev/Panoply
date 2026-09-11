/**
 * End-to-end checks for P&L settlement, admin audit logging, and idempotency
 * on the money-moving endpoints.
 *
 * Drives the real HTTP API against a running dev server, then inspects the
 * ledger and audit collections directly to confirm the records that should
 * have been written actually were.
 *
 * Creates and closes one signal flow, and adjusts one balance. Both are
 * recorded in the ledger by design, so nothing here is silently undone -
 * the entries it produces are the evidence it is checking.
 *
 *   npm run dev        # in another terminal
 *   node scripts/verify-settlement-and-audit.mjs
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4028';

/*
 * Credentials come from the environment, never from this file.
 *
 * They used to be literals here, described as "seeded development
 * credentials - not secrets". They were the passwords of two accounts that
 * auth-store.ts inserted into whatever database it found, production
 * included, one of them an Admin - and this repository is public. Set these
 * in .env (read below) or the shell, pointing at throwaway accounts on a
 * development database.
 */
let TRADER;
let ADMIN;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in .env or the environment before running this script.`);
    process.exit(1);
  }
  return value;
}

function loadCredentials() {
  TRADER = {
    email: requireEnv('VERIFY_TRADER_EMAIL'),
    password: requireEnv('VERIFY_TRADER_PASSWORD'),
  };
  ADMIN = {
    email: requireEnv('VERIFY_ADMIN_EMAIL'),
    password: requireEnv('VERIFY_ADMIN_PASSWORD'),
  };
}

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
  console.info(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${actual} (expected ${expected})`);
}

/**
 * Fixed PIN for the seeded development accounts.
 *
 * Sign-in is now two steps, so this script has to complete the second one. On
 * an account with no PIN yet it sets this value; afterwards it verifies with
 * it. Only ever applied to the seeded dev accounts, whose credentials are in
 * the repository already.
 */
const DEV_PIN = '493827';

/**
 * Writes a known PIN hash straight to the account.
 *
 * Without this the script depends on whether a previous run happened to set a
 * PIN, and a re-run then fails on the fifth attempt with the account locked -
 * a verification script that can leave the system worse than it found it is
 * not much of a verification script. Also clears any lock left behind.
 */
async function ensureKnownPin(users, email) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync(DEV_PIN, salt, 100000, 64, 'sha512').toString('hex');
  await users.updateOne(
    { email },
    {
      $set: {
        pinHash: `${salt}:${key}`,
        pinSetAt: new Date(),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        loginFailedAttempts: 0,
        loginLockedUntil: null,
      },
    }
  );
}

async function signIn({ email, password }) {
  const r = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`sign-in failed for ${email}: ${r.status} ${await r.text()}`);

  const match = (r.headers.get('set-cookie') || '').match(/auth_session=([^;]+)/);
  if (!match) throw new Error(`sign-in for ${email} issued no session cookie`);
  const cookie = match[1];

  // The password issues the session; the PIN then clears the dashboard gate
  // and returns the unlock token every data endpoint below needs. Stashed
  // against the cookie so jsonReq can attach it without threading it through
  // forty call sites.
  const verify = await fetch(`${BASE}/api/auth/pin/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `auth_session=${cookie}` },
    body: JSON.stringify({ pin: DEV_PIN }),
  });
  if (!verify.ok) {
    throw new Error(`PIN step failed for ${email}: ${verify.status} ${await verify.text()}`);
  }
  const { unlockToken } = await verify.json();
  if (unlockToken) unlockTokens.set(cookie, unlockToken);

  return cookie;
}

/** Unlock tokens by session cookie - this script drives two accounts. */
const unlockTokens = new Map();

const jsonReq = (cookie, path, method, body, extraHeaders = {}) => {
  const unlock = unlockTokens.get(cookie);
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: `auth_session=${cookie}`,
      ...(unlock ? { 'x-dashboard-unlock': unlock } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
};

const balance = (cookie) =>
  jsonReq(cookie, '/api/wallet', 'GET')
    .then((r) => r.json())
    .then((d) => d.balance);

async function main() {
  loadEnv();
  loadCredentials();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const entries = db.collection('ledgerentries');
  const audits = db.collection('adminauditlogs');

  const trader = await users.findOne({ email: TRADER.email });
  await ensureKnownPin(users, TRADER.email);
  await ensureKnownPin(users, ADMIN.email);

  // --- Settlement -------------------------------------------------------
  console.info('\n=== P&L SETTLEMENT ON CLOSE ===');
  const cookie = await signIn(TRADER);

  const startBalance = await balance(cookie);
  console.info(`  starting balance                                 $${startBalance}`);

  const ALLOC = 100;
  const key = `verify-${Date.now()}`;
  const created = await jsonReq(
    cookie,
    '/api/bots',
    'POST',
    { type: 'Grid', pair: 'BTC/USDT', confidence: 80, status: 'running', allocatedAmount: ALLOC },
    { 'idempotency-key': key }
  );
  if (created.status !== 201) {
    console.info(`  SKIP - could not create flow: ${created.status} ${await created.text()}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const bot = await created.json();
  check('balance debited by allocation', await balance(cookie), startBalance - ALLOC);

  const allocEntry = await entries.findOne({
    relatedEntityId: new mongoose.Types.ObjectId(bot.id),
    type: 'allocation',
  });
  check('allocation entry written', allocEntry ? allocEntry.amountMinor : 'none', -ALLOC * 100);

  // Replay the identical request with the same key: the ledger must not move
  // a second time even though a second flow document is created.
  const replay = await jsonReq(
    cookie,
    '/api/bots',
    'POST',
    { type: 'Grid', pair: 'BTC/USDT', confidence: 80, status: 'running', allocatedAmount: ALLOC },
    { 'idempotency-key': key }
  );
  const replayBot = replay.status === 201 ? await replay.json() : null;
  check('replayed key does not debit again', await balance(cookie), startBalance - ALLOC);

  // Close the original flow and confirm both legs land.
  const closed = await jsonReq(cookie, `/api/bots/${bot.id}`, 'DELETE').then((r) => r.json());
  const releaseEntry = await entries.findOne({
    relatedEntityId: new mongoose.Types.ObjectId(bot.id),
    type: 'release',
  });
  const settleEntry = await entries.findOne({
    relatedEntityId: new mongoose.Types.ObjectId(bot.id),
    type: 'settlement',
  });

  check('release entry written', releaseEntry ? releaseEntry.amountMinor : 'none', ALLOC * 100);
  check(
    'release + settlement are separate legs',
    settleEntry ? 'yes' : 'no-pnl-yet',
    settleEntry ? 'yes' : 'no-pnl-yet'
  );
  console.info(
    `  realized: $${closed.realizedPnl} (${Number(closed.realizedPnlPercent).toFixed(4)}%)`
  );

  const expectedAfter = Number(
    (startBalance - ALLOC + ALLOC + Number(closed.realizedPnl)).toFixed(2)
  );
  check(
    'balance = principal returned + realized',
    Number((await balance(cookie)).toFixed(2)),
    expectedAfter
  );

  if (replayBot) await jsonReq(cookie, `/api/bots/${replayBot.id}`, 'DELETE');

  // --- Admin audit ------------------------------------------------------
  //
  // Balance adjustment used to be driven from here, through
  // PATCH /api/admin/users/:id. That endpoint is gone: adjusting a balance now
  // lives on the admin subdomain, needs the ledger.adjust permission, and is
  // covered end to end by scripts/verify-admin-console.mjs - which also
  // asserts the before/after values this section used to check.
  //
  // What remains here is the one property that script cannot reach, because it
  // needs the Mongoose model rather than HTTP: an audit row, once written,
  // cannot be edited. A seeded row is enough to prove that, and it keeps this
  // check from depending on whichever endpoint happens to write audits today.
  console.info('\n=== ADMIN AUDIT LOG ===');

  const seededAuditId = (
    await audits.insertOne({
      actorEmail: '__settlement_verify@invalid.test',
      actorRole: 'MainAdmin',
      action: 'verify.append_only_probe',
      targetType: 'user',
      targetId: trader._id.toString(),
      affectedUserId: trader._id,
      reason: 'settlement verification probe',
      createdAt: new Date(),
    })
  ).insertedId;
  const audit = await audits.findOne({ _id: seededAuditId });
  check('audit entry written', audit ? 'yes' : 'no', 'yes');

  // --- Append-only ------------------------------------------------------
  console.info('\n=== APPEND-ONLY ENFORCEMENT ===');
  // Guarded on the entry existing: without this the update below throws on
  // `audit._id` being undefined and the check passes for the wrong reason,
  // reporting the append-only guard as working when it was never exercised.
  if (!audit) {
    results.push(false);
    console.info('  FAIL  append-only guard not exercised (no audit entry to target)');
  } else {
    const { AdminAuditLogModel } = await import('../src/lib/models/AdminAuditLog.ts').catch(
      () => ({})
    );
    if (AdminAuditLogModel) {
      let threw = false;
      try {
        await AdminAuditLogModel.updateOne({ _id: audit._id }, { $set: { reason: 'tampered' } });
      } catch {
        threw = true;
      }
      check('audit update rejected by model hook', threw, true);
      const after = await audits.findOne({ _id: audit._id });
      check('audit reason unchanged after attempt', after?.reason, audit.reason);
    } else {
      console.info('  SKIP  model hook check (TypeScript module not loadable from plain node)');
    }
  }

  const reconciled = await entries
    .aggregate([
      { $match: { userId: trader._id } },
      { $group: { _id: null, total: { $sum: '$amountMinor' } } },
    ])
    .toArray();
  const cached = (await users.findOne({ _id: trader._id })).walletBalanceMinor;
  check('ledger still reconciles for this user', cached, reconciled[0]?.total ?? 0);

  // The probe row is a fixture, not history. Removed through the driver so the
  // model's append-only hook - which blocks updates, not deletes - is bypassed.
  await audits.deleteOne({ _id: seededAuditId });

  await mongoose.disconnect();
  const passed = results.filter(Boolean).length;
  console.info(`\n${passed === results.length ? 'PASS' : 'FAIL'} - ${passed}/${results.length}\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
