#!/usr/bin/env node
/**
 * Provisions a trader account and credits an opening balance.
 *
 * For onboarding someone whose money arrived outside the deposit rail - a bank
 * transfer, cash, anything the chain never saw. It is deliberately not a
 * deposit: a deposit claims an on-chain transfer happened, carries a
 * transaction hash, and is unique-indexed on it. Inventing a hash to make a
 * credit look like a transfer puts a false record in the ledger and in the
 * audit log, so this posts an `admin_adjustment` instead - the entry type the
 * ledger already has for money an operator put there on their own authority.
 *
 *   node scripts/create-trader-account.mjs --email a@b.com --name "Full Name" \
 *     --amount 500                                        show what it would do
 *   ... --apply                                           create the account
 *
 * Required: --email, --name, --amount. There are deliberately no defaults -
 * this repository is public, and a convenient default is a real person's
 * address published in the history of every clone of it.
 *
 * Optional:
 *   --pin <6 digits>  --password <12+ characters>  --admin <address>
 *
 * --admin names the operator the balance adjustment is recorded against, and
 * is only needed when the console has more than one active admin.
 *
 * --pin and --password are for when the credentials have to be known before
 * the run, to be prepared and handed over together. Leave either off and one
 * is generated - which is the better choice for the password, since a
 * generated twenty characters beats anything anyone types.
 *
 * Both are checked against the app's own rules: the PIN through the isWeakPin
 * the dashboard applies, the password through adminCreateUserSchema. Neither
 * flag is a way around a floor the trader themselves would have hit.
 *
 * Nothing is replicated here. The account goes through the same registerUser
 * the signup form calls, the PIN through the same hashPin, and the balance
 * through setBalanceToTarget, which writes the ledger entry, the balance and
 * the AdminAuditLog row inside one transaction. That is why the script bundles
 * src/ at startup rather than reaching into the collections directly: a second
 * copy of the hashing or of the ledger's bookkeeping is a copy that can drift.
 *
 * Prints the generated password and PIN once, to stdout. Run it yourself
 * rather than through anything that keeps logs, and have the trader change
 * both on first sign-in.
 */

import crypto from 'node:crypto';
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
    // No defaults. This repository is public, and a convenient default is a
    // real person's address published in the history of every clone.
    email: flag('email', null),
    name: flag('name', null),
    amount: Number(flag('amount', '0')),
    // Null means "generate one". A chosen PIN still has to clear isWeakPin:
    // the point of the check is that nobody sets 000000, operators included.
    pin: flag('pin', null),
    password: flag('password', null),
    // Which admin the adjustment is recorded against. Only needed when the
    // console has more than one, since the ledger wants a specific human.
    adminEmail: flag('admin', null),
  };
}

/** 20 characters, no lookalikes, so it survives being read aloud or retyped. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let out = '';
  while (out.length < 20) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

/**
 * The password to set: the one that was asked for, or a fresh one.
 *
 * Checked against adminCreateUserSchema rather than registerSchema. Both are
 * the app's own, but they differ: self-registration takes eight characters,
 * and an admin creating an account for someone else has to supply twelve. This
 * is the second case, and the stricter floor is the right one - a password
 * someone else chose and sent over is likely to survive longer unchanged than
 * one its owner picked.
 */
function resolvePassword(requested, schema) {
  if (requested === null) return generatePassword();
  const result = schema.shape.password.safeParse(requested);
  if (!result.success) {
    throw new Error(`--password ${result.error.issues[0].message}.`);
  }
  return requested;
}

/**
 * The PIN to set: the one that was asked for, or a fresh one.
 *
 * Both go through the same two checks the dashboard applies when a trader
 * chooses their own, so --pin cannot be used to install a PIN the app would
 * have refused from the person who has to live with it. isWeakPin rejects
 * 000000, 123456 and birth years.
 */
function resolvePin(requested, isValidPinFormat, isWeakPin) {
  if (requested !== null) {
    if (!isValidPinFormat(requested)) {
      throw new Error(`--pin must be six digits. Got: ${requested}`);
    }
    if (isWeakPin(requested)) {
      throw new Error(
        `--pin ${requested} is one the app rejects - repeated digits, a run, or a year. Pick another.`
      );
    }
    return requested;
  }
  for (;;) {
    const pin = String(crypto.randomInt(1000000)).padStart(6, '0');
    if (isValidPinFormat(pin) && !isWeakPin(pin)) return pin;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.email === null || args.name === null) {
    throw new Error(
      'Usage: node scripts/create-trader-account.mjs --email <address> --name <full name> ' +
        '--amount <dollars> [--pin <6 digits>] [--password <12+ chars>] [--admin <address>] [--apply]'
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
    throw new Error(`Not an email address: ${args.email}`);
  }
  if (!Number.isFinite(args.amount) || args.amount < 0) {
    throw new Error(`Not an amount: ${args.amount}`);
  }
  const targetMinor = Math.round(args.amount * 100);

  loadEnv(ROOT, readFileSync);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  const mongoose = require('mongoose');
  const { app, cleanup } = await loadApp(ROOT, {
    '@/lib/auth-store': ['registerUser'],
    '@/lib/pin': ['hashPin', 'isWeakPin', 'isValidPinFormat'],
    '@/lib/ledger': ['setBalanceToTarget', 'getBalanceMinor'],
    '@/lib/models/user': ['UserModel'],
    '@/lib/validation': ['adminCreateUserSchema'],
  });

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'aegis',
    });

    console.info(`database      ${mongoose.connection.db.databaseName}`);
    console.info(`email         ${args.email}`);
    console.info(`name          ${args.name}`);
    console.info(`role          Trader`);
    console.info(`balance       $${(targetMinor / 100).toFixed(2)} as admin_adjustment`);

    const admin = await resolveAdmin(mongoose.connection.db, args.adminEmail);
    console.info(`recorded by   ${admin.email} (${admin.role})`);

    // Resolved before the dry run returns, so a --pin the app would refuse
    // fails here rather than on the --apply that was meant to be the easy part.
    const pin = resolvePin(args.pin, app.isValidPinFormat, app.isWeakPin);
    const password = resolvePassword(args.password, app.adminCreateUserSchema);
    console.info(`pin           ${args.pin === null ? 'generated at --apply' : pin + ' (chosen)'}`);
    console.info(
      `password      ${args.password === null ? 'generated at --apply' : 'chosen, accepted'}`
    );

    if (await app.UserModel.findOne({ email: args.email.toLowerCase() }).lean()) {
      throw new Error(`${args.email} already exists. Not touching an existing account.`);
    }

    if (!args.apply) {
      console.info('\nDry run. Nothing was written. Re-run with --apply to create it.');
      return;
    }

    const { user } = await app.registerUser({
      email: args.email,
      fullName: args.name,
      password,
    });

    await app.UserModel.updateOne(
      { _id: user.id },
      {
        $set: {
          pinHash: app.hashPin(pin),
          pinSetAt: new Date(),
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        },
      }
    );

    const before = await app.getBalanceMinor(user.id);
    const posted = await app.setBalanceToTarget({
      userId: user.id,
      type: 'admin_adjustment',
      targetMinor,
      expectedBalanceMinor: before,
      actorAdminId: admin._id,
      memo: 'Opening balance credited by the operator. Not an on-chain deposit.',
      audit: {
        actorAdminId: admin._id,
        actorEmail: admin.email,
        actorRole: admin.role,
        reason: 'Operator-credited opening balance for a new trader account.',
      },
    });

    const finalMinor = await app.getBalanceMinor(user.id);
    if (finalMinor !== targetMinor) {
      throw new Error(`Balance is ${finalMinor} minor units, expected ${targetMinor}.`);
    }

    console.info(`\nCreated.`);
    console.info(`user id       ${user.id}`);
    console.info(`ledger entry  ${posted.entryId}`);
    console.info(`balance       $${(finalMinor / 100).toFixed(2)}`);
    console.info(`\npassword      ${password}`);
    console.info(`pin           ${pin}`);
    console.info(
      `\nHand these over on a channel you trust, and have them changed on first sign-in.`
    );
  } finally {
    cleanup();
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
});
