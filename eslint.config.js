import js from '@eslint/js';

const browserGlobals = Object.fromEntries(
  [
    'Blob',
    'Buffer',
    'DOMException',
    'Storage',
    'URL',
    'clearTimeout',
    'console',
    'crypto',
    'document',
    'fetch',
    'getComputedStyle',
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
    files: ['app.js', 'playwright.config.js', 'tests/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: browserGlobals,
    },
  },
];
