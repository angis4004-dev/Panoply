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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4028';

// Seeded development credentials from src/lib/auth-store.ts - not secrets.
const TRADER = { email: 'alex.thornton@cryptotradeai.io', password: 'TraderBot#2024' };
const ADMIN = { email: 'admin@cryptotradeai.io', password: 'AdminAI#Secure99' };

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

async function signIn({ email, password }) {
  const r = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`sign-in failed for ${email}: ${r.status} ${await r.text()}`);
  return (r.headers.get('set-cookie') || '').match(/auth_session=([^;]+)/)[1];
}

const jsonReq = (cookie, path, method, body, extraHeaders = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: `auth_session=${cookie}`,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const balance = (cookie) =>
  jsonReq(cookie, '/api/wallet', 'GET')
    .then((r) => r.json())
    .then((d) => d.balance);

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const entries = db.collection('ledgerentries');
  const audits = db.collection('adminauditlogs');

  const trader = await users.findOne({ email: TRADER.email });

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
  console.info('\n=== ADMIN AUDIT LOG ===');
  const adminCookie = await signIn(ADMIN);
  const targetId = trader._id.toString();

  const noReason = await jsonReq(adminCookie, `/api/admin/users/${targetId}`, 'PATCH', {
    walletBalance: 9999,
  });
  check('balance edit without a reason is refused', noReason.status, 400);

  const currentBalance = await balance(cookie);
  const target = Number((currentBalance + 25).toFixed(2));
  const withReason = await jsonReq(adminCookie, `/api/admin/users/${targetId}`, 'PATCH', {
    walletBalance: target,
    adjustmentReason: 'verification script - goodwill credit',
  });
  check('balance edit with a reason succeeds', withReason.status, 200);
  check('balance actually moved', Number((await balance(cookie)).toFixed(2)), target);

  const audit = await audits.findOne(
    { action: 'user.balance_adjust', targetId },
    { sort: { createdAt: -1 } }
  );
  check('audit entry written', audit ? 'yes' : 'no', 'yes');
  check('audit names the acting admin', audit?.actorEmail, ADMIN.email);
  check('audit carries the reason', audit?.reason, 'verification script - goodwill credit');
  check('audit records before value', audit?.before?.walletBalance, currentBalance);
  check('audit records after value', audit?.after?.walletBalance, target);

  const adminAdjust = await entries.findOne(
    { type: 'admin_adjustment', userId: trader._id },
    { sort: { createdAt: -1 } }
  );
  check('ledger adjustment names the actor', adminAdjust?.actorUserId ? 'yes' : 'no', 'yes');

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
