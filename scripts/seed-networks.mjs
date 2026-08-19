/**
 * Seeds the network catalog and reconciles existing free-text network values.
 *
 * Before the catalog existed, `network` was a free-text column on
 * depositaddresses. An operator could type "TRC20", "trc-20" and "Tron" and
 * get three networks for one chain, each able to hold its own active address
 * for the same coin. This script creates the real rows and reports - or with
 * --apply, rewrites - the legacy values that point at them.
 *
 * Two things it deliberately does not do:
 *
 *   It does not invent a catalog row for a legacy value it does not recognise.
 *   A network nobody can name is a network whose address format nobody knows,
 *   and guessing produces a row that validates addresses against the wrong
 *   rule. Unrecognised values are listed for an operator to handle.
 *
 *   It does not verify that existing addresses match their network's format.
 *   They predate the rule and some will fail it. Rewriting or deactivating
 *   them is a money decision, not a migration decision - the mismatches are
 *   reported so an operator can rotate them from the console.
 *
 * Idempotent: safe to run repeatedly.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/seed-networks.mjs
 *   node scripts/seed-networks.mjs --apply
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

/*
 * Mirrors SEED_NETWORKS in src/lib/models/Network.ts. Duplicated rather than
 * imported because this is a plain .mjs script with no TypeScript pipeline,
 * and the alternative - a build step for one constant - costs more than the
 * duplication. The keys and families must stay in step with that file.
 */
const SEED_NETWORKS = [
  {
    key: 'ERC20',
    name: 'Ethereum (ERC-20)',
    description:
      'The Ethereum mainnet. Transfers are reliable but network fees are the highest of the three.',
    addressFamily: 'evm',
    coins: ['USDT', 'USDC', 'ETH'],
    sortOrder: 10,
  },
  {
    key: 'TRC20',
    name: 'Tron (TRC-20)',
    description: 'Low fees and fast confirmation. The usual choice for moving USDT.',
    addressFamily: 'tron',
    coins: ['USDT', 'USDC'],
    sortOrder: 20,
  },
  {
    key: 'SOL',
    name: 'Solana (SPL)',
    description: 'Very low fees and near-instant settlement.',
    addressFamily: 'solana',
    coins: ['USDT', 'USDC', 'SOL'],
    sortOrder: 30,
  },
];

/**
 * Legacy spellings that unambiguously mean one of the seeded chains.
 *
 * Compared after lowercasing and stripping non-alphanumerics, so "TRC-20",
 * "trc 20" and "trc20" all collapse to the same probe. Only entries a person
 * would agree on are listed - "eth" means Ethereum, but a bare "usdt" names a
 * coin rather than a chain and is left unrecognised on purpose.
 */
const ALIASES = {
  erc20: 'ERC20',
  eth: 'ERC20',
  ethereum: 'ERC20',
  ethereummainnet: 'ERC20',
  trc20: 'TRC20',
  tron: 'TRC20',
  trx: 'TRC20',
  trontrc20: 'TRC20',
  sol: 'SOL',
  solana: 'SOL',
  spl: 'SOL',
  solanaspl: 'SOL',
};

const normalise = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

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

async function main() {
  loadEnv();
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set - nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });

  const networks = mongoose.connection.db.collection('networks');
  const addresses = mongoose.connection.db.collection('depositaddresses');

  const existingKeys = new Set((await networks.distinct('key')).map(String));
  const toCreate = SEED_NETWORKS.filter((n) => !existingKeys.has(n.key));

  // Legacy values still on deposit address rows, platform scope only - the
  // retired per-trader rows are history and are not rewritten.
  const legacyValues = await addresses.distinct('network', { scope: 'platform' });
  const seedKeys = new Set(SEED_NETWORKS.map((n) => n.key));

  const rewrites = [];
  const unrecognised = [];
  for (const value of legacyValues) {
    const raw = String(value ?? '');
    if (seedKeys.has(raw) || existingKeys.has(raw)) continue; // already a catalog key
    const target = ALIASES[normalise(raw)];
    if (target) rewrites.push({ from: raw, to: target });
    else unrecognised.push(raw);
  }

  console.info('\n=== NETWORK CATALOG SEED ===');
  console.info(`  catalog rows present        ${existingKeys.size}`);
  console.info(`  to create                   ${toCreate.map((n) => n.key).join(', ') || 'none'}`);
  console.info(`  distinct legacy values      ${legacyValues.length}`);
  console.info(
    `  to rewrite                  ${rewrites.map((r) => `${r.from} -> ${r.to}`).join(', ') || 'none'}`
  );
  console.info(`  unrecognised                ${unrecognised.join(', ') || 'none'}`);

  if (unrecognised.length > 0) {
    console.info('');
    console.info('  Unrecognised values are NOT rewritten. Each one needs an operator to either');
    console.info('  add a matching network in the console, or rotate the address onto one that');
    console.info('  already exists. Leaving them alone is safe: the address keeps working, but');
    console.info('  no new address can be published on that value until a catalog row exists.');
  }

  if (!APPLY) {
    console.info('\nDRY RUN - nothing written. Re-run with --apply.\n');
    await mongoose.disconnect();
    return;
  }

  console.info('');

  for (const network of toCreate) {
    await networks.insertOne({
      ...network,
      addressPrefix: '',
      addressCharset: 'alphanumeric',
      addressMinLength: null,
      addressMaxLength: null,
      memoSupported: false,
      memoRequired: false,
      depositEnabled: true,
      withdrawalEnabled: true,
      minWithdrawalMinor: null,
      status: 'active',
      createdByAdminId: null,
      updatedByAdminId: null,
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.info(`  created ${network.key} (${network.name}, ${network.addressFamily})`);
  }

  for (const { from, to } of rewrites) {
    const result = await addresses.updateMany(
      { scope: 'platform', network: from },
      { $set: { network: to } }
    );
    console.info(`  rewrote ${result.modifiedCount} address row(s): ${from} -> ${to}`);
  }

  await networks.createIndex({ key: 1 }, { unique: true });
  await networks.createIndex({ status: 1, sortOrder: 1, key: 1 });
  console.info('  created catalog indexes');

  /*
   * Reported, never acted on. These addresses were published before the rule
   * existed and a mismatch may mean the rule is wrong rather than the address.
   * Either way, changing where the platform's inbound funds land is not
   * something a migration script should decide.
   */
  const published = await addresses.find({ scope: 'platform', status: 'active' }).toArray();
  const catalog = await networks.find({}).toArray();
  const byKey = new Map(catalog.map((n) => [n.key, n]));
  const mismatches = [];
  for (const row of published) {
    const network = byKey.get(row.network);
    if (!network) continue;
    const complaint = checkFormat(network, String(row.address ?? ''));
    if (complaint) mismatches.push(`${row.coin} on ${row.network}: ${complaint}`);
  }
  console.info(`\n  active addresses checked    ${published.length}`);
  console.info(`  format mismatches           ${mismatches.length}`);
  for (const line of mismatches) console.info(`    - ${line}`);
  if (mismatches.length > 0) {
    console.info('  Rotate these from the console. Nothing was changed here.');
  }
  console.info('');

  await mongoose.disconnect();
}

/** A deliberately minimal mirror of validateAddress, for the report only. */
function checkFormat(network, address) {
  const PRESETS = {
    evm: { prefix: '0x', charset: /^[0-9a-fA-F]+$/, min: 42, max: 42 },
    tron: { prefix: 'T', charset: /^[1-9A-HJ-NP-Za-km-z]+$/, min: 34, max: 34 },
    solana: { prefix: '', charset: /^[1-9A-HJ-NP-Za-km-z]+$/, min: 32, max: 44 },
  };
  const rule = PRESETS[network.addressFamily];
  if (!rule) return null;
  if (rule.prefix && !address.startsWith(rule.prefix)) return `does not start with ${rule.prefix}`;
  if (address.length < rule.min || address.length > rule.max) {
    return `is ${address.length} characters, expected ${rule.min === rule.max ? rule.min : `${rule.min}-${rule.max}`}`;
  }
  if (!rule.charset.test(address.slice(rule.prefix.length))) return 'contains invalid characters';
  return null;
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
