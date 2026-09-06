import tseslint from 'typescript-eslint'

// lib/db.ts is the only module that opens a database connection. Everything
// that touches data must go through lib/repos/*; lib/auth/* composes those
// with request context; scripts/* are operational entrypoints. Nothing else
// may import it — a route or component that does has bypassed RLS.
const noDbImport = {
  patterns: [
    {
      group: ['@/lib/db', '**/lib/db', 'lib/db'],
      message:
        'Do not import lib/db.ts here. Data access goes through lib/repos/*; only lib/repos/, lib/auth/, scripts/ and db/seed.ts may import it directly.',
    },
  ],
}

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'db/migrations/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-restricted-imports': ['error', noDbImport],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': ['error', noDbImport],
    },
  },
  {
    files: ['lib/repos/**', 'lib/auth/**', 'scripts/**', 'db/seed.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]
