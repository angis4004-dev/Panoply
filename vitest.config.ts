import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Scoped to src/lib deliberately.
 *
 * These are the pure, dependency-free parts of the system - money arithmetic,
 * the P&L engine, PIN and PII crypto, session token handling. They are also
 * where every bug that has actually cost something in this project has lived.
 *
 * Route handlers and anything needing a database are covered by the scripts in
 * scripts/, which run against a real server and a real Mongo. Those are not
 * optional extras: `npm test` passing says nothing about whether sign-in still
 * works. With a dev server up, run
 *
 *   npm run verify:auth      PIN sign-in, PIN change and recovery, revocation
 *   npm run verify:ledger    balance/ledger reconciliation, read-only
 *
 * Each auth script creates and removes its own throwaway account, so they are
 * safe to run repeatedly against a development database.
 * scripts/verify-settlement-and-audit.mjs is deliberately absent from
 * verify:auth - it writes real ledger entries by design, so it stays a
 * deliberate, manual invocation.
 */
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
    /*
     * A throwaway signing key for the modules that refuse to load without one.
     *
     * session.ts and dashboard-unlock.ts both fail closed at import time if
     * SESSION_SECRET is unset, which is correct in production - signing a
     * session cookie with a default would let anyone forge one - and means
     * their tests need a value. It is fixed and obviously fake so that nothing
     * signed under it is ever mistaken for a real credential.
     */
    env: {
      SESSION_SECRET: 'test-only-secret-not-used-outside-vitest',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
