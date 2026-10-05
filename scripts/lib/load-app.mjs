import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loads named exports out of src/ into an operator script.
 *
 * Scripts that move money have to run the app's own code. A second copy of the
 * password hashing, or of the ledger's bookkeeping, is a copy that can drift
 * from the thing it was copied from - and drift in that direction is only ever
 * discovered by someone's balance being wrong. So the script bundles src/ at
 * startup rather than reaching into the collections.
 *
 * Three things here were each learned by a run that failed:
 *
 * The bundle lands inside the project, not in the OS temp directory.
 * node_modules stays external - bundling mongoose would be both enormous and
 * wrong - and Node resolves a bare import by walking up from the importing
 * file. From %TEMP% there is no node_modules above it, so the bundle built
 * cleanly and then died on its first `import mongoose`.
 *
 * next/server is aliased to a Proxy that throws. validation.ts imports
 * NextResponse so parseBody can turn a failed schema into a 422, and that one
 * import drags Next's whole request runtime into a command-line script that
 * wants a zod object. It throws rather than returning a stub, so an export
 * that genuinely reaches for NextResponse stops the run instead of quietly
 * getting something nobody reads.
 *
 * It cleans up after its own failures. Handing `cleanup` back only on success
 * left the build directory in the project every time the import threw.
 *
 * @param root  The project root, the directory holding package.json.
 * @param wanted  What to pull out, as { '@/lib/ledger': ['post', 'credit'] }.
 * @returns {Promise<{app: object, cleanup: () => void}>} The caller must call
 *   cleanup when it is done, whether or not it succeeded.
 */
export async function loadApp(root, wanted) {
  const require = createRequire(join(root, 'package.json'));
  const esbuild = require('esbuild');

  const dir = mkdtempSync(join(root, '.provision-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'entry.mjs');
  const shim = join(dir, 'next-server-shim.js');

  writeFileSync(
    shim,
    'export const NextResponse = new Proxy({}, { get() { ' +
      "throw new Error('next/server is not available in an operator script.'); } });\n"
  );

  writeFileSync(
    entry,
    Object.entries(wanted)
      .map(([from, names]) => `export { ${names.join(', ')} } from '${from}';`)
      .join('\n')
  );

  const cleanup = () => rmSync(dir, { recursive: true, force: true });

  try {
    esbuild.buildSync({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      packages: 'external',
      alias: { '@': join(root, 'src'), 'next/server': shim },
      outfile: out,
      logLevel: 'error',
    });

    return { app: await import(pathToFileURL(out).href), cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

/** Reads .env into process.env without overwriting what is already set. */
export function loadEnv(root, readFileSync) {
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match && !(match[1] in process.env)) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // The process environment may already carry MONGODB_URI.
  }
}

/**
 * The admin an action is recorded against. Looked up, never written down.
 *
 * The audit log wants a specific human on every entry, and hardcoding one puts
 * an operator's address and database id into a public repository to save a
 * flag. One active admin is unambiguous; several require naming one, because
 * guessing whose name belongs on a financial record is not a script's call.
 */
export async function resolveAdmin(db, requestedEmail) {
  const admins = await db.collection('adminusers').find({ status: 'active' }).toArray();
  if (admins.length === 0) throw new Error('No active admin to record the action against.');

  if (requestedEmail == null) {
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
