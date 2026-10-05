#!/usr/bin/env node
/**
 * Credits or debits an existing trader's wallet balance.
 *
 * The same thing the admin console's balance panel does, for when it is easier
 * to do from a terminal. It is deliberately not a deposit: a deposit asserts
 * an on-chain transfer happened and carries the hash to prove it. Money that
 * never touched a chain goes in as an `admin_adjustment`, which is the entry
 * type the ledger already has for money an operator put there on their own
 * authority.
 *
 *   node scripts/credit-trader-balance.mjs --email a@b.com --credit 250 \
 *     --reason "Bank transfer received 4 Oct"
 *   ... --apply
 *
 * Required: --email, --reason, and exactly one of --credit (a change, which
 * may be negative) or --target (an absolute balance to land on).
 *
 * Prefer --target, or give --credit a --key. --credit adds to whatever the
 * balance is at the moment it runs, so running it twice credits twice - which
 * has already cost one account $250, from the same command being run in two
 * places fifteen seconds apart. --key becomes a ledger idempotency key, and
 * the unique index behind it makes a repeat a no-op. Without one the script
 * refuses an identical adjustment posted in the last ten minutes unless
 * --force. --target needs none of this: landing on a number twice lands on
 * it once.
 *
 * --reason is required because the app requires it: adjusting a balance
 * through the console will not submit without one (adminBalanceSchema in
 * src/lib/validation.ts). A terminal is not a reason to drop the rule - it is
 * the only thing that will tell anyone later why the number moved.
 *
 * The write goes through setBalanceToTarget, which posts the ledger entry, the
 * balance and the AdminAuditLog row inside one transaction, and refuses if the
 * balance moved between being read and being written. --admin names the
 * operator, and is only needed when the console has more than one active one.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp, loadEnv, resolveAdmin } from './lib/load-app.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? fallback : argv[index + 1];
  };
  return {
    apply: argv.includes('--apply'),
    email: flag('email', null),
    credit: flag('credit', null),
    target: flag('target', null),
    reason: flag('reason', null),
    adminEmail: flag('admin', null),
    key: flag('key', null),
    force: argv.includes('--force'),
  };
}

/**
 * Refuses a --credit that looks like one already posted.
 *
 * --credit is a change, not a destination, so running it twice credits twice.
 * The expectedBalanceMinor guard does not help: a second run reads the balance
 * the first one produced and adds to that quite happily. This has already cost
 * one account $250, when the same command was run from two places within
 * fifteen seconds of each other.
 *
 * --key is the real fix, because the ledger's unique index makes a repeat a
 * no-op. This is the net under it, for the runs that forget one. --target
 * needs neither: landing on a number twice lands on it once.
 */
async function findRecentTwin(db, userId, amountMinor, reason, withinMs = 10 * 60 * 1000) {
  const since = new Date(Date.now() - withinMs);
  return db.collection('ledgerentries').findOne({
    userId,
    type: 'admin_adjustment',
    amountMinor,
    createdAt: { $gte: since },
    memo: { $regex: reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' },
  });
}

const money = (minor) => `${minor < 0 ? '-' : ''}$${Math.abs(minor / 100).toFixed(2)}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.email === null || args.reason === null) {
    throw new Error(
      'Usage: node scripts/credit-trader-balance.mjs --email <address> ' +
        '(--credit <dollars> | --target <dollars>) --reason "<why>" ' +
        '[--key <unique-id>] [--admin <address>] [--force] [--apply]'
    );
  }
  if ((args.credit === null) === (args.target === null)) {
    throw new Error('Give exactly one of --credit (a change) or --target (an absolute balance).');
  }
  if (args.reason.trim() === '') throw new Error('--reason cannot be blank.');

  const asMinor = (value, label) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) throw new Error(`${label} must be a number. Got: ${value}`);
    return Math.round(amount * 100);
  };

  loadEnv(ROOT, readFileSync);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  const mongoose = require('mongoose');
  const { app, cleanup } = await loadApp(ROOT, {
    '@/lib/ledger': ['setBalanceToTarget', 'getBalanceMinor'],
    '@/lib/models/user': ['UserModel'],
  });

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'aegis',
    });

    const user = await app.UserModel.findOne({ email: args.email.toLowerCase() })
      .select('_id email name')
      .lean();
    if (!user) throw new Error(`No account for ${args.email}.`);

    const currentMinor = await app.getBalanceMinor(user._id);
    const targetMinor =
      args.target !== null
        ? asMinor(args.target, '--target')
        : currentMinor + asMinor(args.credit, '--credit');

    if (targetMinor < 0) {
      throw new Error(`That would leave ${money(targetMinor)}. A balance cannot go negative.`);
    }

    const admin = await resolveAdmin(mongoose.connection.db, args.adminEmail);

    console.info(`database      ${mongoose.connection.db.databaseName}`);
    console.info(`account       ${user.email} (${user.name})`);
    console.info(`balance       ${money(currentMinor)} -> ${money(targetMinor)}`);
    console.info(`change        ${money(targetMinor - currentMinor)} as admin_adjustment`);
    console.info(`reason        ${args.reason}`);
    console.info(`recorded by   ${admin.email} (${admin.role})`);
    console.info(
      `idempotency   ${args.key ?? (args.target !== null ? 'not needed for --target' : 'none - see below')}`
    );

    if (targetMinor === currentMinor) {
      console.info('\nAlready at that balance. Nothing to do.');
      return;
    }

    // Checked in the dry run too, so the warning arrives before the run that
    // would have doubled the money, not after it.
    if (args.credit !== null && args.key === null) {
      const twin = await findRecentTwin(
        mongoose.connection.db,
        user._id,
        targetMinor - currentMinor,
        args.reason
      );
      if (twin && !args.force) {
        throw new Error(
          `An identical ${money(twin.amountMinor)} adjustment was posted at ` +
            `${new Date(twin.createdAt).toISOString()} (entry ${twin._id}). ` +
            `If this is a second, separate credit, pass --key <unique-id>. ` +
            `If you meant to land on a figure, use --target. --force overrides.`
        );
      }
      console.info(
        '\nNote: --credit adds to whatever the balance is now, so running this\n' +
          'twice credits twice. Pass --key <unique-id> to make a repeat a no-op,\n' +
          'or --target to name the balance you want to end on.'
      );
    }

    if (!args.apply) {
      console.info('\nDry run. Nothing was written. Re-run with --apply to post it.');
      return;
    }

    const posted = await app.setBalanceToTarget({
      userId: user._id,
      type: 'admin_adjustment',
      targetMinor,
      // Read a moment ago. setBalanceToTarget refuses if it has moved since,
      // rather than overwriting a change it never saw.
      expectedBalanceMinor: currentMinor,
      // The ledger's unique index turns a repeat into a no-op. Without one,
      // nothing downstream can tell a second run from a second credit.
      ...(args.key ? { idempotencyKey: `balance-adjust:${args.key}` } : {}),
      actorAdminId: admin._id,
      memo: `Operator adjustment. Not an on-chain deposit. ${args.reason}`,
      audit: {
        actorAdminId: admin._id,
        actorEmail: admin.email,
        actorRole: admin.role,
        reason: args.reason,
      },
    });

    const finalMinor = await app.getBalanceMinor(user._id);
    if (finalMinor !== targetMinor) {
      throw new Error(`Balance reads ${money(finalMinor)}, expected ${money(targetMinor)}.`);
    }

    if (posted.deduplicated) {
      console.info(`\nAlready posted under that key. No money moved.`);
      console.info(`balance       ${money(finalMinor)}`);
      return;
    }

    console.info(`\nPosted.`);
    console.info(`ledger entry  ${posted.entryId}`);
    console.info(`balance       ${money(finalMinor)}`);
  } finally {
    cleanup();
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
});
