import js from '@eslint/js';

const browserGlobals = Object.fromEntries(
  [
    'Blob',
    'URL',
    'clearTimeout',
    'console',
    'crypto',
    'document',
    'fetch',
    'history',
    'location',
    'localStorage',
    'navigator',
    'setTimeout',
    'window',
  ].map((name) => [name, 'readonly']),
);

export default [
  {
    files: ['app.js'],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: browserGlobals,
    },
  },
];
