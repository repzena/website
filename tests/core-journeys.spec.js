import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const routineStorageKey = 'form-routines-v1';

test('content security policy allows the app and blocks injected inline scripts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.exercise-card').first()).toBeVisible();
  await expect(page.locator('#theme')).toHaveValue('system');

  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).not.toContain("'unsafe-inline'");

  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.injected = "yes";';
    document.head.append(script);
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-injected', 'yes');
});

test('quick add stores an exercise in the selected routine and restores it after reload', async ({
  page,
}) => {
  await page.goto('/');
  const card = page.locator('.exercise-card').first();
  await expect(card).toBeVisible();
  const exerciseName = await card.locator('h3').innerText();
  await card.locator('[data-add]').click();

  const routineItem = page.locator('#routine-items .routine-item');
  await expect(routineItem).toHaveCount(1);
  await expect(routineItem).toContainText(exerciseName);
  await page.reload();
  await expect(page.locator('#routine-items .routine-item')).toHaveCount(1);
  await expect(page.locator('#routine-items .routine-item')).toContainText(exerciseName);
});

test('pagination changes the visible exercise set', async ({ page }) => {
  await page.goto('/');
  const status = page.locator('#pagination-status');
  await expect(status).toContainText('of 50');
  const firstExercise = await page.locator('.exercise-card h3').first().innerText();

  await page.getByRole('button', { name: 'Next page' }).click();

  await expect(status).toContainText('13–');
  await expect(page.locator('.exercise-card h3').first()).not.toHaveText(firstExercise);
});

test('exercise guide URLs reopen the bookmarked guide', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.exercise-card').first();
  const exerciseId = await card.locator('[data-detail]').getAttribute('data-detail');
  const exerciseName = await card.locator('h3').innerText();
  await card.locator('[data-detail]').click();

  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#exercise/${exerciseId}$`));
  await page.reload();
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await expect(page.locator('#exercise-dialog h2')).toHaveText(exerciseName);
});

test('routine import and export preserve the routine and exercise data', async ({ page }) => {
  await page.goto('/');
  const importedRoutine = {
    format: 'gym-exercise-routine',
    version: 1,
    routine: {
      name: { en: 'Imported test routine' },
      days: [
        {
          name: { en: 'Push day' },
          exercises: [
            {
              name: { en: 'Bench press', es: 'Press de banca' },
              exercise_id: 'barbell-bench-press',
              sets: 4,
              reps_or_time: { en: '6–8' },
            },
          ],
        },
      ],
    },
  };
  await page.locator('#routine-file').setInputFiles({
    name: 'routine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedRoutine)),
  });
  await expect(page.locator('#routine-name')).toHaveValue('Imported test routine');
  await expect(page.locator('#routine-items .routine-item')).toContainText('Bench press');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-routine').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('imported-test-routine.json');
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.routine.name.en).toBe('Imported test routine');
  expect(exported.routine.days[0].exercises[0]).toMatchObject({
    exercise_id: 'barbell-bench-press',
    sets: 4,
  });
});

test('routine storage failures show an error and do not claim the exercise was saved', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (itemKey, value) {
      if (itemKey === key) throw new DOMException('Storage is full', 'QuotaExceededError');
      return originalSetItem.call(this, itemKey, value);
    };
  }, routineStorageKey);
  await page.goto('/');
  await page.locator('.exercise-card').first().locator('[data-add]').click();

  await expect(page.locator('#toast')).toHaveClass(/visible/);
  await expect(page.locator('#toast')).toContainText('Could not save on this device');
  await expect(page.locator('#routine-items .routine-item')).toHaveCount(0);
});

test('failed routine edits restore names, sessions, removals, and order', async ({ page }) => {
  await page.addInitScript((key) => {
    const originalSetItem = Storage.prototype.setItem;
    const seed = {
      routines: [
        {
          id: 'routine-1',
          name: 'Strength plan',
          defaultName: false,
          days: [
            {
              name: 'Push day',
              defaultName: false,
              items: [
                {
                  exerciseId: 'bench-press',
                  name: 'Bench press',
                  names: { en: 'Bench press', es: 'Press de banca' },
                  sets: 3,
                  reps: '8–12',
                },
                {
                  exerciseId: 'row',
                  name: 'Row',
                  names: { en: 'Row', es: 'Remo' },
                  sets: 3,
                  reps: '8–12',
                },
              ],
            },
            { name: 'Pull day', defaultName: false, items: [] },
          ],
        },
      ],
      current: 'routine-1',
    };
    originalSetItem.call(localStorage, key, JSON.stringify(seed));
    window.failRoutineWrites = true;
    Storage.prototype.setItem = function (itemKey, value) {
      if (window.failRoutineWrites && itemKey === key)
        throw new DOMException('Storage is full', 'QuotaExceededError');
      return originalSetItem.call(this, itemKey, value);
    };
  }, routineStorageKey);
  await page.goto('/');

  await page.locator('#routine-name').fill('Unsaved name');
  await page.locator('#save-routine').click();
  await expect(page.locator('#routine-name')).toHaveValue('Strength plan');

  await page.locator('#add-day').click();
  await expect(page.locator('#day-tabs [data-day]')).toHaveCount(2);
  await expect(page.locator('#day-tabs [data-day="0"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#routine-items [data-remove="0"]').click();
  await expect(page.locator('#routine-items .routine-item')).toHaveCount(2);
  await expect(page.locator('#routine-items .routine-item b')).toHaveText(['Bench press', 'Row']);

  await page.locator('#routine-items [data-up="1"]').click();
  await expect(page.locator('#routine-items .routine-item b')).toHaveText(['Bench press', 'Row']);

  await page.reload();
  await expect(page.locator('#routine-name')).toHaveValue('Strength plan');
  await expect(page.locator('#day-tabs [data-day]')).toHaveCount(2);
  await expect(page.locator('#routine-items .routine-item b')).toHaveText(['Bench press', 'Row']);
});

test('theme selection persists and system mode follows device appearance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('#theme')).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('#theme')).toHaveValue('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.locator('#theme').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the cached exercise library remains available after going offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('.exercise-card').first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      });
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.exercise-card').first()).toBeVisible();
  await expect(page.locator('#result-count')).toContainText('50');
});
