#!/usr/bin/env node
/**
 * Grants one account a signal-flow allowance its tier does not give it.
 *
 * Signal-flow slots normally come from the tier table, and that table is
 * deliberately blunt: an unverified account gets none, whatever its balance.
 * Occasionally an operator wants one particular trader to run a flow before
 * their identity check has gone through. The alternative - lowering the
 * platform default - grants it to every unverified account at once, which is a
 * policy change wearing the clothes of a favour.
 *
 *   node scripts/grant-signal-flow-slot.mjs --email a@b.com --slots 1
 *   node scripts/grant-signal-flow-slot.mjs --email a@b.com --slots 1 --apply
 *   node scripts/grant-signal-flow-slot.mjs --email a@b.com --revoke --apply
 *
 * The grant is a floor, never a ceiling: see effectiveSlotLimit in
 * src/lib/achievements/engine.ts. An account granted one slot while unverified
 * still gets all three when it reaches Amateur on its own.
 *
 * This writes a plain field and an audit row, no money, so it talks to the
 * collections directly rather than bundling src/ the way the provisioning
 * script has to. Revoking only removes the grant - it cannot take away a slot
 * the account's own tier earned, and it does not close flows already running.
 *
 * --admin names the operator it is recorded against, and is only needed when
 * the console has more than one active admin.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? fallback : argv[index + 1];
  };
  return {
    apply: argv.includes('--apply'),
    revoke: argv.includes('--revoke'),
    email: flag('email', null),
    slots: flag('slots', null),
    adminEmail: flag('admin', null),
  };
}

function loadEnv() {
  try {
    for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match && !(match[1] in process.env)) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // The process environment may already carry MONGODB_URI.
  }
}

/** The admin the grant is recorded against. Looked up, never written down. */
async function resolveAdmin(db, requestedEmail) {
  const admins = await db.collection('adminusers').find({ status: 'active' }).toArray();
  if (admins.length === 0) throw new Error('No active admin to record the grant against.');

  if (requestedEmail === null) {
    if (admins.length > 1) {
      throw new Error(
        `Several active admins. Name one with --admin: ${admins.map((a) => a.email).join(', ')}`
      );
    }
    return admins[0];
  }

  const match = admins.find((a) => a.email.toLowerCase() === requestedEmail.toLowerCase());
  if (!match) throw new Error(`No active admin with the address ${requestedEmail}.`);
  return match;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.email === null || (!args.revoke && args.slots === null)) {
    throw new Error(
      'Usage: node scripts/grant-signal-flow-slot.mjs --email <address> ' +
        '(--slots <n> | --revoke) [--admin <address>] [--apply]'
    );
  }

  const slots = args.revoke ? null : Number(args.slots);
  if (!args.revoke && (!Number.isInteger(slots) || slots < 1)) {
    throw new Error(`--slots must be a whole number of at least 1. Got: ${args.slots}`);
  }

  loadEnv();
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  const mongoose = require('mongoose');

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'aegis',
    });
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ email: args.email.toLowerCase() });
    if (!user) throw new Error(`No account for ${args.email}.`);

    const before = user.signalFlowSlotGrant ?? null;
    const flows = await db.collection('tradingbots').countDocuments({ userId: user._id });
    const admin = await resolveAdmin(db, args.adminEmail);

    console.info(`database      ${db.databaseName}`);
    console.info(`account       ${user.email} (${user.name})`);
    console.info(`kyc / tier    ${user.kycStatus} / ${user.tier ?? 'unverified'}`);
    console.info(`flows open    ${flows}`);
    console.info(`grant         ${before ?? 'none'} -> ${slots ?? 'none'}`);
    console.info(`recorded by   ${admin.email} (${admin.role})`);

    if (before === slots) {
      console.info('\nAlready set to that. Nothing to do.');
      return;
    }
    if (args.revoke && flows > 0) {
      // Said rather than prevented: the flows stay up either way, and an
      // operator revoking a grant should know they are not closing anything.
      console.info(
        `\nNote: ${flows} flow(s) already running stay running. This only stops new ones.`
      );
    }

    if (!args.apply) {
      console.info('\nDry run. Nothing was written. Re-run with --apply to set it.');
      return;
    }

    await db
      .collection('users')
      .updateOne({ _id: user._id }, { $set: { signalFlowSlotGrant: slots } });

    await db.collection('adminauditlogs').insertOne({
      actorAdminId: admin._id,
      actorEmail: admin.email,
      actorRole: admin.role,
      action: args.revoke ? 'user.slot_grant_revoke' : 'user.slot_grant',
      targetType: 'user',
      targetId: String(user._id),
      affectedUserId: user._id,
      before: { signalFlowSlotGrant: before },
      after: { signalFlowSlotGrant: slots },
      reason: args.revoke
        ? 'Operator withdrew a signal-flow grant.'
        : 'Operator granted signal-flow access ahead of the tier allowance.',
      createdAt: new Date(),
    });

    const after = await db
      .collection('users')
      .findOne({ _id: user._id }, { projection: { signalFlowSlotGrant: 1 } });
    if ((after.signalFlowSlotGrant ?? null) !== slots) {
      throw new Error(`Grant reads ${after.signalFlowSlotGrant}, expected ${slots}.`);
    }

    console.info(`\nSet. ${user.email} now has a grant of ${slots ?? 'none'}.`);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
});
