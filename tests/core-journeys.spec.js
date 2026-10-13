import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';

const routineStorageKey = 'form-routines-v1';

const test = base.extend({
  page: async ({ page }, use) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await use(page);
    expect(pageErrors, 'uncaught browser errors').toEqual([]);
  },
});

test('content security policy allows the app and blocks injected inline scripts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.exercise-card').first()).toBeVisible();
  await expect(page.locator('#theme')).toHaveValue('system');
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute('href', 'favicon.svg');
  const faviconResponse = await page.request.get(new URL('favicon.svg', page.url()).toString());
  expect(faviconResponse.status()).toBe(200);
  expect(await faviconResponse.text()).toContain('<svg');

  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  const scriptPolicy = policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src '));
  expect(scriptPolicy).toBe("script-src 'self'");

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
  await expect(page.locator('#add-dialog')).toBeVisible();
  await page.locator('#confirm-add-to-routine').click();

  const routineItem = page.locator('#routine-sections .routine-item');
  await expect(routineItem).toHaveCount(1);
  await expect(routineItem).toContainText(exerciseName);
  await page.reload();
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
  await expect(page.locator('#routine-sections .routine-item')).toContainText(exerciseName);
});

test('pagination changes the visible exercise set', async ({ page }) => {
  await page.goto('/');
  const status = page.locator('#pagination-status');
  await expect(status).toContainText('of 50');
  const firstExercise = await page.locator('.exercise-card h3').first().innerText();

  await page.getByRole('button', { name: 'Next page' }).click();

  await expect(status).toContainText('9–');
  await expect(page.locator('.exercise-card h3').first()).not.toHaveText(firstExercise);
});

test('exercise page size follows the responsive grid across reloads and viewport changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const status = page.locator('#pagination-status');
  await expect(status).toHaveText('Showing 1–8 of 50');
  await expect(page.locator('.exercise-card')).toHaveCount(8);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(status).toHaveText('Showing 1–6 of 50');
  await expect(page.locator('.exercise-card')).toHaveCount(6);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(status).toHaveText('Showing 1–4 of 50');
  await expect(page.locator('.exercise-card')).toHaveCount(4);

  await page.reload();
  await expect(status).toHaveText('Showing 1–4 of 50');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(status).toHaveText('Showing 5–8 of 50');
  await expect(page.locator('.exercise-card')).toHaveCount(4);
});

test('search handles Spanish names without accents and combines library filters', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#language').selectOption('es');
  await page.locator('#search').fill('peso muerto rumano');
  await expect(page.locator('.exercise-card h3')).toHaveText('Peso muerto rumano');
  await page.locator('#search').fill('PESO MUERTO RUMANO');
  await expect(page.locator('.exercise-card')).toHaveCount(1);

  await page.locator('#search').fill('');
  await page.locator('#muscle-filter').selectOption('hamstrings');
  await page.locator('#equipment-filter').selectOption('barbell');
  await expect(page.getByRole('heading', { name: 'Peso muerto rumano' })).toBeVisible();
  await expect(page.locator('#active-filters .filter-chip')).toHaveCount(2);
  await page.locator('#active-filters [data-clear="muscle-filter"]').click();
  await expect(page.locator('#muscle-filter')).toHaveValue('');
  await expect(page.locator('#active-filters .filter-chip')).toHaveCount(1);
});

test('focus filter applies and clears through its dropdown and active chip', async ({ page }) => {
  await page.goto('/');
  await page.locator('#focus-filter').selectOption('strength');
  await expect(page.locator('#active-filters .filter-chip')).toHaveCount(1);
  await expect(page.locator('#active-filters .filter-chip')).toHaveText('Strength ×');
  await expect(page.locator('#result-count')).not.toHaveText('50 MOVES');

  await page.locator('#focus-filter').selectOption('');
  await expect(page.locator('#active-filters .filter-chip')).toHaveCount(0);
  await expect(page.locator('#result-count')).toHaveText('50 MOVES');

  await page.locator('#focus-filter').selectOption('mobility');
  await page.locator('#active-filters [data-clear="focus-filter"]').click();
  await expect(page.locator('#focus-filter')).toHaveValue('');
  await expect(page.locator('#result-count')).toHaveText('50 MOVES');
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

test('the whole exercise card opens its guide and the routine exercise link does too', async ({
  page,
}) => {
  await page.goto('/');
  const card = page.locator('.exercise-card').first();
  const exerciseName = await card.locator('h3').innerText();
  await card.locator('[data-detail]').evaluate((link) => link.click());
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await expect(page.locator('#exercise-dialog h2')).toHaveText(exerciseName);
  await page.locator('#dialog-close').click();

  await card.locator('[data-add]').click();
  await page.locator('#confirm-add-to-routine').click();
  await page.locator('#routine-sections [data-routine-detail]').click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText(exerciseName);
  await page.locator('#dialog-close').click();
  await expect(page.locator('#exercise-dialog')).toBeHidden();
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
});

test('legacy routine items can open guides by matching their exercise name', async ({ page }) => {
  await page.goto('/');
  await page.locator('#routine-file').setInputFiles({
    name: 'legacy-routine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        days: [
          {
            exercises: [{ name: 'Romanian deadlift', exercise_id: 'old-exercise-id', sets: 3 }],
          },
        ],
      }),
    ),
  });
  const rowButton = page.locator('#routine-sections [data-routine-detail="romanian-deadlift"]');
  await expect(rowButton).toBeVisible();
  await rowButton.click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText('Romanian deadlift');
});

test('routine section titles and guides resolve from stable catalogue exercise IDs', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        routines: [
          {
            id: 'routine-stable-id',
            name: 'Strength plan',
            defaultName: false,
            days: [
              {
                name: 'Leg day',
                defaultName: false,
                items: [],
                sections: [
                  {
                    id: 'section-stable-id',
                    type: 'main-work',
                    name: '',
                    items: [
                      {
                        exerciseId: 'old-deadlift-id',
                        name: 'Old exercise title',
                        names: { en: 'Old exercise title', es: 'Peso muerto rumano' },
                        sets: 3,
                        reps: '8–12',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        current: 'routine-stable-id',
      }),
    );
  }, routineStorageKey);
  await page.goto('/');

  const exerciseButton = page.locator(
    '#routine-sections [data-routine-detail="romanian-deadlift"]',
  );
  await expect(exerciseButton).toBeVisible();
  await expect(exerciseButton.locator('.item-info b')).toHaveText('Romanian deadlift');

  const savedItem = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    return state.routines[0].days[0].sections[0].items[0];
  }, routineStorageKey);
  expect(savedItem).toMatchObject({
    exerciseId: 'romanian-deadlift',
    name: 'Romanian deadlift',
    names: { en: 'Romanian deadlift', es: 'Peso muerto rumano' },
  });

  await exerciseButton.click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText('Romanian deadlift');
});

test('routine exercise sets and reps can be edited and remain saved after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.exercise-card').first().locator('[data-add]').click();
  await page.locator('#confirm-add-to-routine').click();

  const item = page.locator('#routine-sections .routine-item').first();
  await item.locator('[data-edit-item]').click();
  await item.locator('[data-edit-sets]').fill('4');
  await item.locator('[data-edit-reps]').fill('6–8');
  await item.locator('[data-save-item]').click();
  await expect(page.locator('#routine-sections .routine-item').first()).toContainText(
    '4 sets  ·  6–8',
  );

  await page.reload();
  await expect(page.locator('#routine-sections .routine-item').first()).toContainText(
    '4 sets  ·  6–8',
  );
});

test('routine and session removal confirm, update selection, and preserve one of each', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#remove-routine')).toBeDisabled();
  await expect(page.locator('#day-tabs [data-remove-day]')).toBeDisabled();

  await page.locator('#add-day').click();
  await page.locator('#add-exercise').selectOption('barbell-bench-press');
  await page.locator('#add-exercise-button').click();
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#day-tabs [data-remove-day="1"]').click();
  await expect(page.locator('#day-tabs [data-day]')).toHaveCount(2);
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#day-tabs [data-remove-day="1"]').click();
  await expect(page.locator('#day-tabs [data-day]')).toHaveCount(1);
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(0);
  await expect(page.locator('#day-tabs [data-remove-day]')).toBeDisabled();

  await page.locator('#new-routine').click();
  await expect(page.locator('#routine-select option')).toHaveCount(2);
  await expect(page.locator('#remove-routine')).toBeEnabled();
  await page.locator('#add-day').click();
  await page.locator('#add-exercise').selectOption('barbell-bench-press');
  await page.locator('#add-exercise-button').click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#remove-routine').click();
  await expect(page.locator('#routine-select option')).toHaveCount(2);
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#remove-routine').click();

  await expect(page.locator('#routine-select option')).toHaveCount(1);
  await expect(page.locator('#routine-name')).toHaveValue('My routine');
  await expect(page.locator('#day-tabs [data-day]')).toHaveCount(1);
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(0);
  await expect(page.locator('#remove-routine')).toBeDisabled();
});

test('exercise guide omits the primary-muscle field when the catalogue has no value', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#search').fill('Forearm plank');
  await page.locator('[data-detail="plank"]').click();
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await expect(page.locator('#exercise-dialog .detail-facts')).not.toContainText('Primary muscle');
  await expect(page.locator('#exercise-dialog .detail-facts')).toContainText('Secondary muscles');
  await expect(page.locator('#exercise-dialog .detail-facts')).not.toContainText('—');
});

test('unmatched routine items can be linked once and then open their guide directly', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#routine-file').setInputFiles({
    name: 'unmatched-routine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        days: [
          {
            exercises: [{ name: 'Deadlift from coach notes', exercise_id: 'legacy-xyz', sets: 3 }],
          },
        ],
      }),
    ),
  });

  const unmatchedButton = page.locator('#routine-sections [data-routine-match]');
  await expect(unmatchedButton).toBeVisible();
  await unmatchedButton.click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText('Deadlift from coach notes');
  await page.locator('#routine-guide-match-select').selectOption('romanian-deadlift');
  await page.locator('[data-open-matched-guide]').click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText('Romanian deadlift');

  const linkedButton = page.locator('#routine-sections [data-routine-detail="romanian-deadlift"]');
  await expect(linkedButton).toBeVisible();
  await page.locator('#dialog-close').click();
  await linkedButton.click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText('Romanian deadlift');
});

test('routine sections are optional, and the starter layout can be added on demand', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#routine-sections .routine-group')).toHaveCount(0);
  await expect(page.locator('#section-target')).toBeHidden();
  await expect(page.locator('#use-starter-layout')).toBeVisible();

  await page.locator('#use-starter-layout').click();
  await expect(page.locator('#routine-sections .section-name')).toHaveText([
    'Mobility',
    'Core',
    'Main work',
  ]);
  await expect(page.locator('#section-target option')).toHaveCount(4);
});

test('custom sections can be added, renamed, reordered, collapsed and removed', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#toggle-section-form').click();
  await page.locator('#section-type').selectOption('custom');
  await page.locator('#custom-section-name').fill('Warm-up');
  await page.locator('#add-section-button').click();
  await expect(page.locator('#routine-sections .section-name')).toHaveText('Warm-up');

  await page.locator('#toggle-section-form').click();
  await page.locator('#section-type').selectOption('core');
  await page.locator('#add-section-button').click();
  await expect(page.locator('#routine-sections .section-name')).toHaveText(['Warm-up', 'Core']);
  await page.locator('#routine-sections [data-move-section="1"][data-delta="-1"]').click();
  await expect(page.locator('#routine-sections .section-name')).toHaveText(['Core', 'Warm-up']);

  await page.locator('#routine-sections [data-edit-section]').last().click();
  await page.locator('#routine-sections [data-section-name]').fill('Preparation');
  await page.locator('#routine-sections [data-save-section]').click();
  await expect(page.locator('#routine-sections .section-name').last()).toHaveText('Preparation');

  const sectionToggle = page.locator('#routine-sections [data-toggle-section]').last();
  await sectionToggle.click();
  await expect(sectionToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#routine-sections .section-items').last()).toBeHidden();
  await page.locator('#routine-sections [data-delete-section]').last().click();
  await expect(page.locator('#routine-sections .section-name')).toHaveText('Core');
});

test('quick add can target a selected routine session and section', async ({ page }) => {
  await page.goto('/');
  await page.locator('#add-day').click();
  await page.locator('#toggle-section-form').click();
  await page.locator('#section-type').selectOption('custom');
  await page.locator('#custom-section-name').fill('Pull work');
  await page.locator('#add-section-button').click();

  await page.locator('.exercise-card').first().locator('[data-add]').click();
  await expect(page.locator('#add-routine-target option')).toHaveCount(1);
  await page.locator('#add-session-target').selectOption('1');
  await page.locator('#add-section-target').selectOption({ label: 'Pull work' });
  await page.locator('#confirm-add-to-routine').click();
  await expect(page.locator('#routine-sections .section-name')).toContainText('Pull work');
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
  await expect(page.locator('#routine-sections .routine-item')).toContainText(
    'Barbell bench press',
  );
  await page.reload();
  await page.locator('#day-tabs [data-day="1"]').click();
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
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
  await expect(page.locator('#routine-sections .routine-item')).toContainText(
    'Barbell bench press',
  );

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-routine').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('imported-test-routine.json');
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.routine.name.en).toBe('Imported test routine');
  expect(exported.routine.days[0].exercises[0]).toMatchObject({
    name: { en: 'Barbell bench press', es: 'Press de banca con barra' },
    exercise_id: 'barbell-bench-press',
    sets: 4,
  });
});

test('routine import treats names as text and rejects malformed data safely', async ({ page }) => {
  await page.goto('/');
  const hostileName = '<img src=x onerror="window.injected = true">';
  const hostileReps = '"><img src=x onerror="window.injected = true">';
  await page.locator('#routine-file').setInputFiles({
    name: 'untrusted-routine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        days: [
          {
            exercises: [{ name: { en: hostileName }, sets: 3, reps_or_time: { en: hostileReps } }],
          },
        ],
      }),
    ),
  });
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
  await expect(page.locator('#routine-sections .unsectioned-items .routine-item b')).toHaveText(
    hostileName,
  );
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.locator('#routine-sections [data-edit-item]').click();
  await expect(page.locator('[data-edit-reps]')).toHaveValue(hostileReps);
  await expect(page.locator('#routine-sections img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await page.locator('[data-cancel-item]').click();

  await page.locator('#routine-file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ not valid json'),
  });
  await expect(page.locator('#toast')).toHaveClass(/visible/);
  await expect(page.locator('#toast')).toContainText('Could not read that routine file');
  await expect(page.locator('#routine-sections .unsectioned-items .routine-item')).toHaveCount(1);
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
  await page.locator('#confirm-add-to-routine').click();

  await expect(page.locator('#toast')).toHaveClass(/visible/);
  await expect(page.locator('#toast')).toContainText('Could not save on this device');
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(0);
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

  await page.locator('#routine-sections [data-remove-item="0"]').click();
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(2);
  await expect(page.locator('#routine-sections .routine-item b')).toHaveText([
    'Bench press',
    'Row',
  ]);

  await page.locator('#routine-sections [data-item-up="1"]').click();
  await expect(page.locator('#routine-sections .routine-item b')).toHaveText([
    'Bench press',
    'Row',
  ]);

  await page.reload();
  await expect(page.locator('#routine-name')).toHaveValue('Strength plan');
  await expect(page.locator('#day-tabs [data-day]')).toHaveCount(2);
  await expect(page.locator('#routine-sections .routine-item b')).toHaveText([
    'Bench press',
    'Row',
  ]);
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

test('language selection updates visible controls and remains selected after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#language').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-AR');
  await expect(page.locator('#search')).toHaveAttribute('placeholder', /Buscá/);
  await expect(page.locator('#routine-name')).toHaveAttribute('aria-label', 'Nombre de la rutina');
  await page.reload();
  await expect(page.locator('#language')).toHaveValue('es');
  await expect(page.locator('#routine-name')).toHaveAttribute('aria-label', 'Nombre de la rutina');
});

test('routine section controls stay usable at a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#use-starter-layout').click();
  const select = page.locator('#section-target');
  await expect(select).toBeVisible();
  const metrics = await select.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(metrics.width).toBeGreaterThan(250);
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
});

test('exercise image opens an enlarged viewer with accessible multi-image controls', async ({
  page,
}) => {
  const catalog = JSON.parse(await readFile(new URL('../data/exercises.json', import.meta.url)));
  const arnoldPress = catalog.find((exercise) => exercise.id === 'arnold-press');
  arnoldPress.images.push({
    ...arnoldPress.images[0],
    alt: { en: 'Arnold press second position', es: 'Press Arnold segunda posición' },
  });
  await page.route('**/data/exercises.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#search').fill('Arnold press');
  const card = page.locator('.exercise-card').filter({
    has: page.locator('[data-detail="arnold-press"]'),
  });
  const thumbnail = card.locator('.exercise-photo-art img');
  await expect(thumbnail).toHaveCSS('object-fit', 'cover');
  await expect(thumbnail).toHaveCSS('object-position', '50% 50%');
  await page.locator('[data-detail="arnold-press"]').click();
  const guideGallery = page.locator('#dialog-content [data-exercise-gallery]');
  await expect(guideGallery.locator('.gallery-dot')).toHaveCount(2);
  await expect(guideGallery.locator('[data-gallery-prev]')).toBeVisible();
  await expect(guideGallery.locator('[data-gallery-next]')).toBeVisible();
  await guideGallery.locator('[data-gallery-next]').click();
  await expect(guideGallery.locator('.gallery-image')).toHaveAttribute(
    'alt',
    'Arnold press second position',
  );
  await guideGallery.locator('[data-gallery-prev]').click();
  await expect(guideGallery.locator('.gallery-dot').nth(0)).toHaveAttribute('aria-pressed', 'true');
  await guideGallery.locator('.gallery-dot').nth(1).click();
  await page.locator('#dialog-content [data-gallery-enlarge]').click();
  await expect(page.locator('#image-viewer')).toBeVisible();
  await expect(page.locator('#image-viewer .gallery-dot')).toHaveCount(2);
  await expect(page.locator('#image-viewer [data-viewer-prev]')).toBeVisible();
  await expect(page.locator('#image-viewer [data-viewer-next]')).toBeVisible();
  await expect(page.locator('#image-viewer .gallery-image')).toHaveAttribute(
    'alt',
    'Arnold press second position',
  );
  await page.locator('#image-viewer [data-viewer-next]').click();
  await expect(page.locator('#image-viewer .gallery-dot').nth(0)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#image-viewer [data-viewer-prev]').click();
  await expect(page.locator('#image-viewer .gallery-dot').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#image-viewer [data-viewer-close]').click();
  await expect(page.locator('#image-viewer')).toBeHidden();
});

test('prone Y-T-W exercise images display in their numbered order', async ({ page }) => {
  await page.goto('/');
  await page.locator('#search').fill('Prone Y-T-W');
  await page.locator('[data-detail="prone-ytw"]').click();

  const gallery = page.locator('#dialog-content [data-exercise-gallery]');
  await expect(gallery.locator('.gallery-dot')).toHaveCount(4);
  const orderedImages = [
    '1-start-position.webp',
    '2-y-position.webp',
    '3-t-position.webp',
    '4-w-position.webp',
  ];
  for (const [index, imageName] of orderedImages.entries()) {
    await gallery.locator('.gallery-dot').nth(index).click();
    await expect(gallery.locator('.gallery-image')).toHaveAttribute('src', new RegExp(imageName));
    await expect
      .poll(() => gallery.locator('.gallery-image').evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
  }
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
