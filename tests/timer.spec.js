import { test, expect } from './support/fixtures.js';
import { routineStorageKey } from './support/fixtures.js';

test('routine prescriptions default by exercise and remain editable', async ({ page }) => {
  await page.goto('/#routines');
  await page.locator('#add-exercise').selectOption('plank');

  await expect(page.locator('#add-mode')).toHaveValue('time');
  await expect(page.locator('#add-duration-wrap')).toBeVisible();
  await expect(page.locator('#add-reps-wrap')).toBeHidden();
  await expect(page.locator('#add-duration')).toHaveValue('30');
  await page.locator('#add-duration').fill('45');
  await page.locator('#add-exercise-button').click();

  const item = page.locator('#routine-sections .routine-item').first();
  await expect(item).toContainText('45 sec');
  await item.locator('[data-edit-item]').click();
  await expect(item.locator('[data-edit-mode]')).toHaveValue('time');
  await expect(item.locator('[data-edit-duration-wrap]')).toBeVisible();
  await expect(item.locator('[data-edit-reps-wrap]')).toBeHidden();
  await expect(item.locator('[data-edit-duration]')).toHaveValue('45');

  await item.locator('[data-edit-mode]').selectOption('reps');
  await item.locator('[data-edit-reps]').fill('8–12');
  await item.locator('[data-save-item]').click();
  await expect(page.locator('#routine-sections .routine-item').first()).toContainText('8–12');

  await page.reload();
  await expect(page.locator('#routine-sections .routine-item').first()).toContainText('8–12');
  const savedItem = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    return state.routines[0].days[0].items[0];
  }, routineStorageKey);
  expect(savedItem).toMatchObject({
    prescriptionMode: 'reps',
    reps: '8–12',
    durationSeconds: null,
  });
  const savedRow = page.locator('#routine-sections .routine-item').first();
  await savedRow.locator('[data-edit-item]').click();
  await savedRow.locator('[data-edit-mode]').selectOption('time');
  await savedRow.locator('[data-edit-duration]').fill('55');
  await savedRow.locator('[data-save-item]').click();
  await savedRow.locator('[data-routine-detail]').click();
  await expect(page.locator('[data-guide-duration]')).toHaveValue('55');
});

test('exercise guide timer keeps running after closing and can be reopened', async ({ page }) => {
  await page.goto('/#exercises');
  await page.locator('#search').fill('plank');
  await page.locator('[data-detail="plank"]').click();

  const timer = page.locator('#dialog-content [data-exercise-timer], #dialog-content .guide-timer');
  await expect(timer).toBeVisible();
  await expect(page.locator('[data-guide-duration]')).toHaveValue('30');
  await page.locator('[data-guide-duration]').fill('2');
  await page.locator('[data-timer-start]').click();
  await expect(page.locator('#active-timer')).toBeVisible();
  await expect(page.locator('#dialog-content [data-timer-status]')).toHaveText('Timer running');
  await page.locator('[data-timer-pause]').click();
  await expect(page.locator('#dialog-content [data-timer-status]')).toHaveText('Timer paused');
  await page.locator('[data-timer-reset]').click();
  await expect(page.locator('[data-timer-display]')).toHaveText('00:02');
  await page.locator('[data-timer-start]').click();
  await expect(page.locator('#dialog-content [data-timer-status]')).toHaveText('Timer running');
  await page.locator('#dialog-close').click();
  await expect(page.locator('#active-timer')).toBeVisible();
  await expect(page.locator('#active-timer [data-timer-indicator-status]')).toHaveText(
    'Timer running',
  );
  await expect(page.locator('#active-timer [data-timer-indicator-status]')).toHaveText(
    'Time is up',
    {
      timeout: 4000,
    },
  );
  await expect(page.locator('#active-timer')).toContainText('00:00');
  await page.locator('#active-timer [data-timer-open]').click();
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await expect(page.locator('#dialog-content [data-timer-status]')).toHaveText('Time is up');
  await page.locator('#active-timer [data-timer-clear]').click();
  await expect(page.locator('#active-timer')).toBeHidden();
});

test('repetition exercises default to reps and do not show the timer', async ({ page }) => {
  await page.goto('/#routines');
  await page.locator('#add-exercise').selectOption('barbell-bench-press');
  await expect(page.locator('#add-mode')).toHaveValue('reps');
  await expect(page.locator('#add-reps-wrap')).toBeVisible();
  await expect(page.locator('#add-duration-wrap')).toBeHidden();

  await page.goto('/#exercises');
  await page.locator('#search').fill('barbell bench press');
  await page.locator('[data-detail="barbell-bench-press"]').click();
  await expect(page.locator('#dialog-content .guide-timer')).toHaveCount(0);
});

test('routine timers show set progress and advance only when requested', async ({ page }) => {
  await page.goto('/#routines');
  await page.locator('#add-exercise').selectOption('plank');
  await page.locator('#add-sets').fill('2');
  await page.locator('#add-duration').fill('1');
  await page.locator('#add-exercise-button').click();
  await page.locator('#routine-sections [data-routine-detail="plank"]').click();
  await page.locator('[data-timer-start]').click();
  await expect(page.locator('#dialog-content [data-timer-status]')).toHaveText('Time is up', {
    timeout: 4000,
  });
  await expect(page.locator('[data-timer-set-actions]')).toBeVisible();
  await expect(page.locator('[data-timer-set-progress]')).toHaveText('Set 1 of 2');
  await page.locator('[data-timer-next-set]').click();
  await expect(page.locator('[data-timer-set-actions]')).toBeHidden();
  await expect(page.locator('[data-timer-display]')).toHaveText('00:01');
  await expect(page.locator('#active-timer')).toContainText('Set 2 of 2');
});

test('version 3 routine imports keep timed exercise targets', async ({ page }) => {
  await page.goto('/#routines');
  await page.locator('#routine-file').setInputFiles({
    name: 'timed-routine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'gym-exercise-routine',
        version: 3,
        routine: {
          name: { en: 'Timed routine' },
          default_name: false,
          days: [
            {
              name: { en: 'Core day' },
              default_name: false,
              exercises: [
                {
                  name: { en: 'Plank' },
                  exercise_id: 'plank',
                  sets: 3,
                  reps_or_time: { en: '50 seconds' },
                  prescription: { mode: 'time', duration_seconds: 50 },
                  section: null,
                },
              ],
            },
          ],
        },
      }),
    ),
  });

  const item = page.locator('#routine-sections .routine-item').first();
  await expect(item).toContainText('50 sec');
  await item.locator('[data-routine-detail]').click();
  await expect(page.locator('[data-guide-duration]')).toHaveValue('50');
});
