import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'dist/**',
    'node_modules/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    // Vendored React Bits components, kept as published (see the note at the top of each file).
    'components/bits/**',
  ]),
  {
    // Rule Zero: components contain no hard-coded user-facing text.
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        {
          noStrings: false,
          allowedStrings: ['·', '•', '-', '/', ':', '(', ')', '+', '×', '▲', '▼', '✓'],
          ignoreProps: true,
        },
      ],
    },
  },
]);
