/**
 * Checks the ledger's central invariant: for every user, the cached balance
 * equals the sum of that user's ledger entries.
 *
 * If those two ever disagree, some code path wrote walletBalanceMinor outside
 * src/lib/ledger.ts, or a transaction committed partially. Neither is
 * detectable from the balance alone - which is the entire reason the ledger is
 * authoritative rather than advisory.
 *
 * Read-only by default. `--stress` additionally runs a concurrency probe
 * against a throwaway user to demonstrate that concurrent debits cannot
 * overdraw; it creates and then removes its own fixture.
 *
 *   node scripts/verify-ledger.mjs
 *   node scripts/verify-ledger.mjs --stress
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STRESS = process.argv.includes('--stress');

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

const usd = (minor) => `$${(minor / 100).toFixed(2)}`;

async function reconcile(db) {
  const users = db.collection('users');
  const entries = db.collection('ledgerentries');

  const sums = await entries
    .aggregate([{ $group: { _id: '$userId', total: { $sum: '$amountMinor' } } }])
    .toArray();
  const sumByUser = new Map(sums.map((s) => [String(s._id), s.total]));

  const all = await users.find({}, { projection: { walletBalanceMinor: 1, email: 1 } }).toArray();

  const mismatches = [];
  let integerViolations = 0;

  for (const user of all) {
    const cached = user.walletBalanceMinor ?? 0;
    const summed = sumByUser.get(String(user._id)) ?? 0;
    if (!Number.isSafeInteger(cached)) integerViolations += 1;
    if (cached !== summed) {
      mismatches.push({ email: user.email, cached, summed });
    }
  }

  console.info('\n=== RECONCILIATION ===');
  console.info(`  users checked        ${all.length}`);
  console.info(`  ledger entries       ${await entries.countDocuments({})}`);
  console.info(`  non-integer balances ${integerViolations}`);
  console.info(`  mismatches           ${mismatches.length}`);

  for (const m of mismatches) {
    console.info(
      `    ${String(m.email).padEnd(34)} cached ${usd(m.cached)} vs entries ${usd(m.summed)}`
    );
  }

  return mismatches.length === 0 && integerViolations === 0;
}

/**
 * Fires many concurrent debits at a balance that can only fund some of them.
 *
 * Exercises the same primitive src/lib/ledger.ts relies on - a conditional
 * $gte filter inside a transaction - so it demonstrates the database-level
 * guarantee rather than the TypeScript wrapper around it.
 */
async function stress(db) {
  const users = db.collection('users');
  const entries = db.collection('ledgerentries');
  const client = mongoose.connection.getClient();

  const START_MINOR = 10_000; // $100.00
  const DEBIT_MINOR = 1_000; // $10.00 each
  const ATTEMPTS = 25; // only 10 can possibly succeed

  const { insertedId } = await users.insertOne({
    name: 'ledger stress fixture',
    email: `__ledger_stress_${Date.now()}@invalid.test`,
    role: 'Trader',
    walletBalanceMinor: START_MINOR,
    kycStatus: 'unverified',
    emailVerified: false,
    walletOwnershipConfirmed: false,
    lifetimeDeposited: 0,
    xp: 0,
    tier: 'unverified',
    currentStreak: 0,
    longestStreak: 0,
    visitedSections: [],
    distinctPortfolioAssets: [],
    portfolioReportCount: 0,
    distinctBotStrategyTypes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const attemptDebit = async () => {
    const session = client.startSession();
    try {
      let ok = false;
      await session.withTransaction(async () => {
        const updated = await users.findOneAndUpdate(
          { _id: insertedId, walletBalanceMinor: { $gte: DEBIT_MINOR } },
          { $inc: { walletBalanceMinor: -DEBIT_MINOR } },
          { returnDocument: 'after', session }
        );
        const doc = updated?.value ?? updated;
        if (!doc) {
          ok = false;
          return;
        }
        await entries.insertOne(
          {
            userId: insertedId,
            type: 'allocation',
            amountMinor: -DEBIT_MINOR,
            balanceAfterMinor: doc.walletBalanceMinor,
            createdAt: new Date(),
          },
          { session }
        );
        ok = true;
      });
      return ok;
    } catch {
      return false;
    } finally {
      await session.endSession();
    }
  };

  const results = await Promise.all(Array.from({ length: ATTEMPTS }, attemptDebit));
  const succeeded = results.filter(Boolean).length;

  const finalUser = await users.findOne({ _id: insertedId });
  const finalBalance = finalUser.walletBalanceMinor;
  const entryCount = await entries.countDocuments({ userId: insertedId });
  const entrySum = (
    await entries
      .aggregate([
        { $match: { userId: insertedId } },
        { $group: { _id: null, total: { $sum: '$amountMinor' } } },
      ])
      .toArray()
  )[0];

  await entries.deleteMany({ userId: insertedId });
  await users.deleteOne({ _id: insertedId });

  const expectedSucceeded = START_MINOR / DEBIT_MINOR;
  const balanceOk = finalBalance === START_MINOR - succeeded * DEBIT_MINOR;
  const noOverdraw = finalBalance >= 0;
  const entriesMatch = entryCount === succeeded;
  const sumMatches = START_MINOR + (entrySum?.total ?? 0) === finalBalance;

  console.info('\n=== CONCURRENCY PROBE ===');
  console.info(`  starting balance     ${usd(START_MINOR)}`);
  console.info(`  concurrent debits    ${ATTEMPTS} x ${usd(DEBIT_MINOR)}`);
  console.info(`  succeeded            ${succeeded} (expected ${expectedSucceeded})`);
  console.info(`  final balance        ${usd(finalBalance)}`);
  console.info(`  entries written      ${entryCount}`);
  console.info(`  never overdrawn      ${noOverdraw ? 'yes' : 'NO'}`);
  console.info(`  balance = start+sum  ${sumMatches ? 'yes' : 'NO'}`);
  console.info('  fixture removed');

  return noOverdraw && balanceOk && entriesMatch && sumMatches && succeeded === expectedSucceeded;
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

  const db = mongoose.connection.db;
  let ok = await reconcile(db);
  if (STRESS) {
    ok = (await stress(db)) && ok;
  }

  console.info(`\n${ok ? 'PASS - ledger is consistent.' : 'FAIL - see above.'}\n`);
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
