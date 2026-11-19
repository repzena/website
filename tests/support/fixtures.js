import { test as base, expect } from '@playwright/test';

export const routineStorageKey = 'form-routines-v1';

export const test = base.extend({
  page: async ({ page }, use) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await use(page);
    expect(pageErrors, 'uncaught browser errors').toEqual([]);
  },
});

export { expect };
