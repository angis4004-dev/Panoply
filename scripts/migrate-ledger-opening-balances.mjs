/**
 * Seeds the ledger from pre-ledger wallet balances.
 *
 * Before the ledger existed, User.walletBalance was a float dollar amount
 * mutated in place with no history. This writes one `opening_balance` entry per
 * user carrying that value, and sets walletBalanceMinor to match, so every
 * balance from this point forward is explained by an entry.
 *
 * MUST run before the ledger code is serving traffic. New code reads
 * walletBalanceMinor, which does not exist on documents written by the old
 * code; Mongo treats a missing field as 0 on $inc, so an un-migrated user
 * would appear to have a zero balance.
 *
 * Idempotent: users that already have an opening_balance entry are skipped, so
 * re-running is safe and will not double-credit.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/migrate-ledger-opening-balances.mjs
 *   node scripts/migrate-ledger-opening-balances.mjs --apply
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

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
  const users = db.collection('users');
  const entries = db.collection('ledgerentries');

  const alreadySeeded = await entries.distinct('userId', { type: 'opening_balance' });
  const seededIds = new Set(alreadySeeded.map(String));

  const all = await users.find({}, { projection: { walletBalance: 1, email: 1 } }).toArray();
  const pending = all.filter((u) => !seededIds.has(String(u._id)));

  let totalMinor = 0;
  const rows = pending.map((user) => {
    const dollars = Number(user.walletBalance) || 0;
    const minor = Math.round(dollars * 100);
    totalMinor += minor;
    return { id: user._id, email: user.email, dollars, minor };
  });

  console.info('\n=== OPENING BALANCE BACKFILL ===');
  console.info(`  users total          ${all.length}`);
  console.info(`  already seeded       ${seededIds.size}`);
  console.info(`  to seed              ${rows.length}`);
  console.info(`  capital represented  ${usd(totalMinor)}`);

  if (rows.length) {
    console.info('\n  per user:');
    for (const row of rows) {
      const rounding = row.minor / 100 !== row.dollars ? '  (rounded to cent)' : '';
      console.info(`    ${String(row.email).padEnd(34)} ${usd(row.minor).padStart(14)}${rounding}`);
    }
  }

  if (!APPLY) {
    console.info('\nDRY RUN - nothing written. Re-run with --apply to seed.\n');
    await mongoose.disconnect();
    return;
  }

  const session = mongoose.connection.getClient().startSession();
  let written = 0;
  try {
    for (const row of rows) {
      // One transaction per user rather than one for all: a partial run leaves
      // a consistent subset that a re-run completes, instead of an all-or-
      // nothing batch that gets harder to reason about the more users exist.
      await session.withTransaction(async () => {
        await users.updateOne(
          { _id: row.id },
          { $set: { walletBalanceMinor: row.minor } },
          { session }
        );
        await entries.insertOne(
          {
            userId: row.id,
            type: 'opening_balance',
            amountMinor: row.minor,
            balanceAfterMinor: row.minor,
            relatedEntityType: null,
            relatedEntityId: null,
            idempotencyKey: `opening_balance:${row.id}`,
            actorUserId: null,
            memo: 'Opening balance carried over from pre-ledger walletBalance',
            createdAt: new Date(),
          },
          { session }
        );
      });
      written += 1;
    }
  } finally {
    await session.endSession();
  }

  console.info(`\nAPPLIED - ${written} opening balance entr(ies) written.`);
  console.info('Legacy walletBalance left in place; it is no longer read.\n');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
