import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Scoped to src/lib deliberately.
 *
 * These are the pure, dependency-free parts of the system - money arithmetic,
 * the P&L engine, PIN and PII crypto, session token handling. They are also
 * where every bug that has actually cost something in this project has lived.
 * Route handlers and anything needing a database are covered by the scripts in
 * scripts/, which run against a real server and a real Mongo.
 */
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
