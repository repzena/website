import { readFile } from 'node:fs/promises';
import { test, expect } from './support/fixtures.js';
import { routineStorageKey } from './support/fixtures.js';

test('quick add stores an exercise in the selected routine and restores it after reload', async ({
  page,
}) => {
  await page.goto('/#exercises');
  const card = page.locator('.exercise-card').first();
  await expect(card).toBeVisible();
  const exerciseName = await card.locator('h3').innerText();
  await card.locator('[data-add]').click();
  await expect(page.locator('#add-dialog')).toBeVisible();
  await page.locator('#confirm-add-to-routine').click();

  await page.locator('.nav-links [data-page-link="routines"]').click();

  const routineItem = page.locator('#routine-sections .routine-item');
  await expect(routineItem).toHaveCount(1);
  await expect(routineItem).toContainText(exerciseName);
  await page.reload();
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
  await expect(page.locator('#routine-sections .routine-item')).toContainText(exerciseName);
});
test('the whole exercise card opens its guide and the routine exercise link does too', async ({
  page,
}) => {
  await page.goto('/#exercises');
  const card = page.locator('.exercise-card').first();
  const exerciseName = await card.locator('h3').innerText();
  await card.locator('[data-detail]').evaluate((link) => link.click());
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await expect(page.locator('#exercise-dialog h2')).toHaveText(exerciseName);
  await page.locator('#dialog-close').click();

  await card.locator('[data-add]').click();
  await page.locator('#confirm-add-to-routine').click();
  await page.locator('.nav-links [data-page-link="routines"]').click();
  await page.locator('#routine-sections [data-routine-detail]').click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText(exerciseName);
  await page.locator('#dialog-close').click();
  await expect(page.locator('#exercise-dialog')).toBeHidden();
  await expect(page.locator('#routine-sections .routine-item')).toHaveCount(1);
});
test('legacy routine items can open guides by matching their exercise name', async ({ page }) => {
  await page.goto('/#routines');
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
  await page.goto('/#routines');

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
  await page.goto('/#exercises');
  await page.locator('.exercise-card').first().locator('[data-add]').click();
  await page.locator('#confirm-add-to-routine').click();
  await page.locator('.nav-links [data-page-link="routines"]').click();

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
  await page.goto('/#routines');
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
test('every routine exercise opens the matching guide artwork', async ({ page }) => {
  test.setTimeout(120_000);
  const response = await page.request.get('/data/exercises.json');
  expect(response.ok()).toBeTruthy();
  const exercises = (await response.json()).exercises;
  await page.addInitScript(
    ({ storageKey, catalogue }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          routines: [
            {
              id: 'routine-image-audit',
              name: 'Image audit',
              defaultName: false,
              days: [
                {
                  name: 'Image audit session',
                  defaultName: false,
                  items: catalogue.map((exercise) => ({
                    exerciseId: exercise.id,
                    name: exercise.name.en,
                    names: exercise.name,
                    sets: 3,
                    reps: '8–12',
                  })),
                  sections: [],
                },
              ],
            },
          ],
          current: 'routine-image-audit',
        }),
      );
    },
    { storageKey: routineStorageKey, catalogue: exercises },
  );
  await page.goto('/#routines');

  for (const exercise of exercises) {
    const routineButton = page.locator(`#routine-sections [data-routine-detail="${exercise.id}"]`);
    await expect(routineButton).toBeVisible();
    await routineButton.click();
    await expect(page.locator('#exercise-dialog h2')).toHaveText(exercise.name.en);

    if (exercise.images?.length) {
      const image = page.locator('#dialog-content .gallery-image');
      await expect(image).toHaveAttribute('src', exercise.images[0].src);
      await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    } else {
      await expect(page.locator(`#dialog-content .art-${exercise.image} svg`)).toBeVisible();
    }
    await page.locator('#dialog-close').click();
  }
});
test('unmatched routine items can be linked once and then open their guide directly', async ({
  page,
}) => {
  await page.goto('/#routines');
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
test('routine ankle and knee circles names match the catalogue exercise', async ({ page }) => {
  await page.goto('/#routines');
  await page.locator('#routine-file').setInputFiles({
    name: 'ankle-and-knee-circles.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        days: [
          {
            exercises: [
              {
                name: {
                  en: 'Ankle and knee circles',
                  es: 'Circunducciones de tobillo y rodilla',
                },
                sets: 2,
                reps_or_time: { en: '30"" total', es: '30"" total' },
              },
              {
                name: { es: 'Circunducciones de tobillo y rodilla' },
                sets: 2,
                reps_or_time: { es: '30 segundos' },
              },
            ],
          },
        ],
      }),
    ),
  });

  const matchedExercises = page.locator(
    '#routine-sections [data-routine-detail="ankle-knee-circles"]',
  );
  await expect(matchedExercises).toHaveCount(2);
  await matchedExercises.first().click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText('Ankle circles and knee bends');
  await page.locator('#dialog-close').click();
  await page.locator('#language').selectOption('es');
  await matchedExercises.nth(1).click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText(
    'Círculos de tobillo y flexiones de rodilla',
  );
});
test('routine sections are optional, and the starter layout can be added on demand', async ({
  page,
}) => {
  await page.goto('/#routines');
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
  await page.goto('/#routines');
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
  await page.goto('/#routines');
  await page.locator('#add-day').click();
  await page.locator('#toggle-section-form').click();
  await page.locator('#section-type').selectOption('custom');
  await page.locator('#custom-section-name').fill('Pull work');
  await page.locator('#add-section-button').click();

  await page.locator('.nav-links [data-page-link="exercises"]').click();
  await page.locator('.exercise-card').first().locator('[data-add]').click();
  await expect(page.locator('#add-routine-target option')).toHaveCount(1);
  await page.locator('#add-session-target').selectOption('1');
  await page.locator('#add-section-target').selectOption({ label: 'Pull work' });
  await page.locator('#confirm-add-to-routine').click();
  await page.locator('.nav-links [data-page-link="routines"]').click();
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
  await page.goto('/#routines');
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
  await page.goto('/#routines');
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
  await page.goto('/#exercises');
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
  await page.goto('/#routines');

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
test('routine section controls stay usable at a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#routines');
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
