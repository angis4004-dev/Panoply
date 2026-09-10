import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  // ESLint 9 flat config only lints .js/.mjs/.cjs by default - every other
  // extension has to be opted in by a config that names it in `files`. Without
  // this entry, `eslint .` silently skipped every .jsx file in src/ with
  // "File ignored because no matching configuration was supplied", which left
  // the 1,998-line admin dashboard entirely unchecked while the command still
  // exited 0. Declaring the extensions here makes them lintable; the rule
  // blocks below carry no `files` key, so they apply universally to all of them.
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
  },
  ...compat.extends(
    'next/core-web-vitals',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ),
  {
    rules: {
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
          singleQuote: true,
          semi: true,
          tabWidth: 2,
          printWidth: 100,
          trailingComma: 'es5',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    ignores: [
      'node_modules/**',
      // Gitignored scratch space: each worktree holds a full second copy of
      // src/ plus its own node_modules. Harmless while only .ts/.tsx was
      // linted (those copies were reached but the counts stayed small), but
      // once .jsx was enabled every finding started being reported twice.
      '.worktrees/**',
      '.next/**',
      'out/**',
      'public/**',
      'dist/**',
      '.claude/**',
      '.claude-flow/**',
      // Tooling scratch directory, gitignored like the two above. Not merely
      // noise to skip: it is not readable by this user, so walking it threw
      // EPERM during file discovery and took down the whole run - `npm run
      // lint` exited with a stack trace before linting a single file, which
      // is how four prettier errors accumulated in src/ unnoticed. Flat
      // config does not read .gitignore, so being ignored by git is not
      // enough on its own.
      '.gstack/**',
      /*
       * The same trap as .gstack above, caught a second time.
       *
       * outputs/ is gitignored build scratch - 69MB and 2,335 lintable .js and
       * .ts files, including generated bundles and a deployment archive. Flat
       * config does not read .gitignore, so eslint walked and parsed every one
       * of them: `npm run lint` ran for over ten minutes and then died with a
       * stack trace, exactly as .gstack used to.
       *
       * Local only - a CI checkout has no outputs/ - which is precisely what
       * makes it worth fixing. A lint that passes in CI and crashes on the
       * developer's machine is one people stop running, and the last time that
       * happened four prettier errors piled up in src/ unnoticed.
       *
       * .vercel and .superpowers are tool state for the same reason.
       */
      'outputs/**',
      '.vercel/**',
      '.superpowers/**',
      'docs/**',
      'data/**',
      'next-env.d.ts',
    ],
  },
];

export default eslintConfig;
