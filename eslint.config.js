import js from '@eslint/js';

const browserGlobals = Object.fromEntries(
  [
    'Blob',
    'Buffer',
    'DOMException',
    'Event',
    'EventTarget',
    'Response',
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
    files: [
      'app.js',
      'modules/**/*.js',
      'playwright.config.js',
      'scripts/**/*.mjs',
      'tests/**/*.js',
    ],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: browserGlobals,
    },
  },
];
