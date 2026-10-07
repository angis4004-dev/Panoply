#!/usr/bin/env node
/**
 * Backfills the two dates the withdrawal term runs on.
 *
 * computeLockStatus needs both tradingStartedAt and a funding date before the
 * 14-day term can start. Both fields were declared on the user, read by the
 * rule, and written by nothing - so every account sat at 'not_started' and no
 * trader could withdraw, verified or not. The code now sets them going
 * forward; this fills them in for accounts that acted before it did.
 *
 *   node scripts/backfill-withdrawal-clock.mjs            show what it would set
 *   node scripts/backfill-withdrawal-clock.mjs --apply    write it
 *
 * Each date is read from what actually happened, not from today:
 *
 *   tradingStartedAt        the earliest signal flow the account created
 *   firstDepositApprovedAt  the earliest approved deposit
 *   firstCreditedAt         the earliest positive admin_adjustment
 *
 * Dating these from the run instead would restart a fourteen-day hold that
 * someone has already served, which is the one outcome worse than the bug.
 *
 * $min throughout, so an account that already carries a date keeps the
 * earlier one and the script is safe to run twice.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/load-app.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));

const APPLY = process.argv.includes('--apply');
const iso = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '-');

/** The earliest createdAt in a collection, per user. */
async function earliestByUser(collection, match, field = 'createdAt') {
  const rows = await collection
    .aggregate([{ $match: match }, { $group: { _id: '$userId', at: { $min: `$${field}` } } }])
    .toArray();
  return new Map(rows.map((row) => [String(row._id), row.at]));
}

async function main() {
  loadEnv(ROOT, readFileSync);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  const mongoose = require('mongoose');

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'aegis',
    });
    const db = mongoose.connection.db;

    const [trading, deposited, credited] = await Promise.all([
      earliestByUser(db.collection('tradingbots'), {}),
      // reviewedAt is when the operator approved it. createdAt is when the
      // trader claimed it, which is not the same thing and is always earlier.
      earliestByUser(db.collection('deposits'), { status: 'approved' }, 'reviewedAt'),
      earliestByUser(db.collection('ledgerentries'), {
        type: 'admin_adjustment',
        amountMinor: { $gt: 0 },
      }),
    ]);

    const ids = new Set([...trading.keys(), ...deposited.keys(), ...credited.keys()]);
    if (ids.size === 0) {
      console.info('No account has any history to date a clock from.');
      return;
    }

    const users = await db
      .collection('users')
      .find({ _id: { $in: [...ids].map((id) => new mongoose.Types.ObjectId(id)) } })
      .project({ email: 1, tradingStartedAt: 1, firstDepositApprovedAt: 1, firstCreditedAt: 1 })
      .toArray();

    const writes = [];
    console.info('account                              trading     funded      from');
    for (const user of users) {
      const id = String(user._id);
      const set = {};
      if (trading.has(id) && !user.tradingStartedAt) set.tradingStartedAt = trading.get(id);
      if (deposited.has(id) && !user.firstDepositApprovedAt) {
        set.firstDepositApprovedAt = deposited.get(id);
      }
      if (credited.has(id) && !user.firstCreditedAt) set.firstCreditedAt = credited.get(id);
      if (Object.keys(set).length === 0) continue;

      const fundedAt = set.firstDepositApprovedAt ?? set.firstCreditedAt;
      const source = set.firstDepositApprovedAt ? 'deposit' : set.firstCreditedAt ? 'credit' : '-';
      console.info(
        `${(user.email ?? id).padEnd(36)} ${iso(set.tradingStartedAt).padEnd(11)} ` +
          `${iso(fundedAt).padEnd(11)} ${source}`
      );
      writes.push({ updateOne: { filter: { _id: user._id }, update: { $min: set } } });
    }

    console.info(`\n${writes.length} account(s) to update, of ${users.length} with any history.`);

    if (writes.length === 0) return;
    if (!APPLY) {
      console.info('Dry run. Nothing was written. Re-run with --apply.');
      return;
    }

    const result = await db.collection('users').bulkWrite(writes, { ordered: false });
    console.info(`Updated ${result.modifiedCount} account(s).`);

    const stuck = await db.collection('users').countDocuments({
      $and: [
        { $or: [{ tradingStartedAt: null }, { tradingStartedAt: { $exists: false } }] },
        {
          $or: [
            { firstDepositApprovedAt: { $exists: true, $ne: null } },
            { firstCreditedAt: { $exists: true, $ne: null } },
          ],
        },
      ],
    });
    console.info(`${stuck} funded account(s) still awaiting a first signal flow.`);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
});
