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

test('home, exercise library and routine builder are separate navigable screens', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('[data-page="exercises"]')).toBeHidden();
  await expect(page.locator('[data-page="routines"]')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Explore exercises' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build your workout' })).toBeVisible();
  await expect(page.locator('.hero-actions [aria-hidden="true"]')).toHaveCount(0);
  await expect(page.locator('.section-number')).toHaveCount(0);

  await page.getByRole('link', { name: 'Build your workout' }).click();
  await expect(page.locator('[data-page="routines"]')).toBeVisible();
  await expect(page.locator('.nav-links [data-page-link="routines"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.locator('.nav-links [data-page-link="exercises"]').click();
  await expect(page.locator('[data-page="exercises"]')).toBeVisible();
  await expect(page.locator('.nav-links [data-page-link="exercises"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('the installable app metadata and optional install control are available', async ({
  page,
}) => {
  await page.goto('/');
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    short_name: 'Repzena',
    start_url: './#home',
    scope: './',
    display: 'standalone',
  });
  expect(manifest.icons.map(({ sizes }) => sizes)).toEqual(['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const offlineAssets = await page.request.get('/data/offline-assets.json').then((r) => r.json());
  expect(offlineAssets.assets.length).toBeGreaterThan(0);
  expect(offlineAssets.version).toMatch(/^[a-f0-9]{64}$/);
  expect(offlineAssets.assets.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
  await expect(page.locator('#install-app')).toBeVisible();
  await expect(page.locator('#offline-download')).toBeEnabled();
  const automaticallyCachedExerciseImages = await page.evaluate(async () => {
    const staticCaches = (await window.caches.keys()).filter((name) =>
      name.startsWith('repzena-static-'),
    );
    const requests = await Promise.all(
      staticCaches.map(async (name) => window.caches.open(name).then((cache) => cache.keys())),
    );
    return requests
      .flat()
      .filter((request) => /\/assets\/(?!icons\/)/.test(new URL(request.url).pathname)).length;
  });
  expect(automaticallyCachedExerciseImages).toBe(0);
});

test('exercise guides can be explicitly saved for offline use and removed again', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const offlineAssets = await page.request.get('/data/offline-assets.json').then((r) => r.json());
  const staleAssetUrl = new URL(offlineAssets.assets[0].url, page.url()).href;
  await page.evaluate(async (url) => {
    const cache = await window.caches.open('repzena-offline-v1');
    await cache.put(url, new Response('stale-image-content'));
  }, staleAssetUrl);
  await page.locator('#offline-download').click();
  await expect(page.locator('#offline-status')).toContainText('Ready offline', { timeout: 90_000 });
  await expect(page.locator('#offline-download')).toHaveText('Remove offline files');
  const cachedAssets = await page.evaluate(async () => {
    const cache = await window.caches.open('repzena-offline-v1');
    const requests = await cache.keys();
    return requests.filter((request) => new URL(request.url).pathname.includes('/assets/')).length;
  });
  expect(cachedAssets).toBe(offlineAssets.assets.length);
  const migratedImage = await page.evaluate(async (url) => {
    const cache = await window.caches.open('repzena-offline-v1');
    return cache.match(url).then((response) => response.text());
  }, staleAssetUrl);
  expect(migratedImage).not.toBe('stale-image-content');

  await page.locator('#offline-download').click();
  await expect(page.locator('#offline-status')).toContainText('Offline images removed');
  await expect(page.locator('#offline-download')).toHaveText('Make available offline');
});

test('offline controls recover after service worker installation fails', async ({
  page,
  context,
}) => {
  let firstInstallScript = true;
  let servedFailingInstallScript = false;
  await context.route('**/service-worker.js', async (route) => {
    if (!firstInstallScript) {
      await route.continue();
      return;
    }
    firstInstallScript = false;
    servedFailingInstallScript = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'cache-control': 'no-store' },
      body: "self.addEventListener('install', (event) => event.waitUntil(Promise.reject(new Error('Simulated installation failure'))));",
    });
  });
  await page.goto('/');
  expect(servedFailingInstallScript).toBe(true);
  await expect(page.locator('#offline-status')).toContainText('Offline support could not start');
  await expect(page.locator('#offline-download')).toHaveText('Retry offline setup');
  await expect(page.locator('#offline-download')).toBeEnabled();

  await page.locator('#offline-download').click();
  await expect(page.locator('#offline-download')).toHaveText('Make available offline');
  await expect(page.locator('#offline-status')).toContainText('Save the exercise guides');
});

test('open tabs refresh offline status after another tab removes the download', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const offlineAssets = await page.request.get('/data/offline-assets.json').then((r) => r.json());
  await page.evaluate(async ({ version, assets }) => {
    const cache = await window.caches.open('repzena-offline-v1');
    const hashes = {};
    for (const asset of assets) {
      const url = new URL(asset.url, window.location.href).href;
      hashes[url] = asset.sha256;
      await cache.put(url, new Response('test-offline-asset'));
    }
    const metadataUrl = new URL('./__repzena_offline_metadata__.json', window.location.href);
    await cache.put(
      metadataUrl,
      new Response(JSON.stringify({ version, assets: hashes }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }, offlineAssets);
  await page.reload();
  await expect(page.locator('#offline-status')).toContainText('Ready offline');

  const secondPage = await page.context().newPage();
  await secondPage.goto('/');
  await expect(secondPage.locator('#offline-status')).toContainText('Ready offline');
  await page.locator('#offline-download').click();
  await expect(page.locator('#offline-status')).toContainText('Offline images removed');
  await expect(secondPage.locator('#offline-download')).toHaveText('Make available offline');
  await expect(secondPage.locator('#offline-status')).not.toContainText('Ready offline');
});

test('closing a guide restores the exact scroll position on its original screen', async ({
  page,
}) => {
  await page.goto('/#exercises');
  await page.evaluate(() => window.scrollTo(0, 420));
  const exerciseScroll = await page.evaluate(() => window.scrollY);
  await page
    .locator('.exercise-card [data-detail]')
    .first()
    .evaluate((link) => link.click());
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await page.locator('#dialog-close').click();
  await expect(page.locator('#exercise-dialog')).toBeHidden();
  await expect(page).toHaveURL(/#exercises$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(exerciseScroll);

  await page.locator('.nav-links [data-page-link="routines"]').click();
  await page.locator('#add-exercise').selectOption('barbell-bench-press');
  await page.locator('#add-exercise-button').click();
  await page.evaluate(() => window.scrollTo(0, 300));
  const routineScroll = await page.evaluate(() => window.scrollY);
  await page.locator('#routine-sections [data-routine-detail]').click();
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await page.locator('#dialog-close').click();
  await expect(page.locator('#exercise-dialog')).toBeHidden();
  await expect(page).toHaveURL(/#routines$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(routineScroll);
});

test('content security policy allows the app and blocks injected inline scripts', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore exercises' })).toBeVisible();
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

test('pagination changes the visible exercise set', async ({ page }) => {
  await page.goto('/#exercises');
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
  await page.goto('/#exercises');
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
  await page.goto('/#exercises');
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
  await page.goto('/#exercises');
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
  await page.goto('/#exercises');
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

test('legacy dumbbell shoulder press items open the illustrated seated guide', async ({ page }) => {
  await page.goto('/#routines');
  await page.locator('#routine-file').setInputFiles({
    name: 'legacy-routine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        days: [
          {
            exercises: [
              {
                name: {
                  en: 'Dumbbell shoulder press',
                  es: 'Press militar con mancuernas',
                },
                sets: 3,
              },
            ],
          },
        ],
      }),
    ),
  });

  const rowButton = page.locator(
    '#routine-sections [data-routine-detail="dumbbell-shoulder-press"]',
  );
  await expect(rowButton).toBeVisible();
  await rowButton.click();
  await expect(page.locator('#exercise-dialog h2')).toHaveText('Seated dumbbell shoulder press');
  await expect(page.locator('#dialog-content [data-exercise-gallery] .gallery-dot')).toHaveCount(2);
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

test('exercise guide omits the primary-muscle field when the catalogue has no value', async ({
  page,
}) => {
  await page.goto('/#exercises');
  await page.locator('#search').fill('Forearm plank');
  await page.locator('[data-detail="plank"]').click();
  await expect(page.locator('#exercise-dialog')).toBeVisible();
  await expect(page.locator('#exercise-dialog .detail-facts')).not.toContainText('Primary muscle');
  await expect(page.locator('#exercise-dialog .detail-facts')).toContainText('Secondary muscles');
  await expect(page.locator('#exercise-dialog .detail-facts')).not.toContainText('—');
});

test('newly added exercise illustrations appear in their guides in sequence', async ({ page }) => {
  const illustratedExercises = [
    {
      id: 'lat-pulldown',
      name: 'Lat pull-down',
      images: ['1-start-position.jpeg', '2-end-position.jpeg'],
    },
    {
      id: 'barbell-bench-press',
      name: 'Barbell bench press',
      images: ['1-initial-position.jpeg', '2-final-position.jpeg'],
    },
    {
      id: 'dumbbell-french-press',
      name: 'Lying dumbbell triceps extension',
      images: ['1-initial-position.jpeg', '2-final-position.jpeg'],
    },
    {
      id: 'seated-cable-row-neutral',
      name: 'Seated cable row',
      images: ['1-start-position.jpeg', '2-start-position.jpeg'],
    },
    { id: 'plank', name: 'Forearm plank', images: ['plank.jpeg'] },
    { id: 'high-plank', name: 'High plank', images: ['high-plank.jpeg'] },
    { id: 'hollow-hold', name: 'Hollow hold', images: ['hollow-hold.jpeg'] },
    {
      id: 'reverse-crunch',
      name: 'Reverse crunch',
      images: ['1-start-position.jpeg', '3-end-position.jpeg'],
    },
    {
      id: 'rotational-lunge',
      name: 'Lunge with rotation',
      images: ['1-start-position.jpeg', '2-lunge.jpeg'],
    },
    { id: 'side-plank', name: 'Side plank', images: ['side-plank.jpeg'] },
    {
      id: 'walking-lunge',
      name: 'Walking lunge',
      images: [
        '1-3-first-third-positions.jpeg',
        '2-second-position.jpeg',
        '4-fourth-position.jpeg',
      ],
    },
  ];
  await page.goto('/#exercises');

  for (const exercise of illustratedExercises) {
    await page.locator('#search').fill(exercise.name);
    await expect(page.locator('.exercise-card')).toHaveCount(1);
    await page.locator(`[data-detail="${exercise.id}"]`).click();
    const image = page.locator('#dialog-content .gallery-image');
    await expect(image).toHaveAttribute('src', `./assets/${exercise.id}/${exercise.images[0]}`);
    await expect(image).toHaveAttribute('alt', /.+/);
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);

    for (const imagePath of exercise.images.slice(1)) {
      await page.locator('#dialog-content [data-gallery-next]').click();
      await expect(image).toHaveAttribute('src', `./assets/${exercise.id}/${imagePath}`);
      await expect(image).toHaveAttribute('alt', /.+/);
      await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    }
    await page.locator('#dialog-close').click();
  }
});

test('all catalogue exercises render their card and guide artwork, including every photo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/#exercises');
  const response = await page.request.get('/data/exercises.json');
  expect(response.ok()).toBeTruthy();
  const exercises = await response.json();

  for (const exercise of exercises) {
    await page.locator('#search').fill(exercise.name.en);
    const card = page
      .locator('.exercise-card')
      .filter({ has: page.locator(`[data-detail="${exercise.id}"]`) });
    await expect(card).toHaveCount(1);

    if (exercise.images?.length) {
      const thumbnail = card.locator('.exercise-photo-art img');
      await expect(thumbnail).toHaveAttribute('src', exercise.images[0].src);
      await expect.poll(() => thumbnail.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    } else {
      await expect(card.locator(`.art-${exercise.image} svg`)).toBeVisible();
    }

    await card.locator(`[data-detail="${exercise.id}"]`).click();
    if (exercise.images?.length) {
      const gallery = page.locator('#dialog-content [data-exercise-gallery]');
      const guideImage = gallery.locator('.gallery-image');
      for (const [index, imageData] of exercise.images.entries()) {
        if (index > 0) await gallery.locator('[data-gallery-next]').click();
        await expect(guideImage).toHaveAttribute('src', imageData.src);
        await expect(guideImage).toHaveAttribute('alt', /.+/);
        await expect
          .poll(() => guideImage.evaluate((image) => image.naturalWidth))
          .toBeGreaterThan(0);

        await gallery.locator('[data-gallery-enlarge]').click();
        const viewerImage = page.locator('#image-viewer .gallery-image');
        await expect(viewerImage).toHaveAttribute('src', imageData.src);
        await expect
          .poll(() => viewerImage.evaluate((image) => image.naturalWidth))
          .toBeGreaterThan(0);
        await page.locator('#image-viewer [data-viewer-close]').click();
      }
    } else {
      await expect(page.locator(`#dialog-content .art-${exercise.image} svg`)).toBeVisible();
    }
    await page.locator('#dialog-close').click();
  }
});

test('every routine exercise opens the matching guide artwork', async ({ page }) => {
  test.setTimeout(120_000);
  const response = await page.request.get('/data/exercises.json');
  expect(response.ok()).toBeTruthy();
  const exercises = await response.json();
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
  await expect(page.locator('.hero-image')).toHaveAttribute(
    'alt',
    'Two people exercise in a gym: one presses dumbbells overhead while another holds a plank.',
  );
  await page.locator('#language').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-AR');
  await expect(page.locator('.hero-image')).toHaveAttribute(
    'alt',
    'Dos personas entrenan en un gimnasio: una levanta mancuernas por encima de la cabeza y otra sostiene una plancha.',
  );
  await expect(page.locator('#search')).toHaveAttribute('placeholder', /Buscá/);
  await expect(page.locator('#routine-name')).toHaveAttribute('aria-label', 'Nombre de la rutina');
  await page.reload();
  await expect(page.locator('#language')).toHaveValue('es');
  await expect(page.locator('#routine-name')).toHaveAttribute('aria-label', 'Nombre de la rutina');
});

test('Spanish browser locale sets the initial language and a saved choice takes precedence', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'es-AR' });
  });
  await page.goto('/');
  await expect(page.locator('#language')).toHaveValue('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-AR');

  await page.locator('#language').selectOption('en');
  await page.reload();
  await expect(page.locator('#language')).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
});

test('non-Spanish browser locale defaults to English', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'fr-FR' });
  });
  await page.goto('/');
  await expect(page.locator('#language')).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
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

test('exercise image opens an enlarged viewer with accessible multi-image controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#exercises');
  await page.locator('#search').fill('Arnold press');
  const card = page.locator('.exercise-card').filter({
    has: page.locator('[data-detail="arnold-press"]'),
  });
  const thumbnail = card.locator('.exercise-photo-art img');
  await expect(thumbnail).toHaveCSS('object-fit', 'contain');
  await expect(thumbnail).toHaveCSS('object-position', '50% 50%');
  await page.locator('[data-detail="arnold-press"]').click();
  const guideGallery = page.locator('#dialog-content [data-exercise-gallery]');
  await expect(guideGallery.locator('.gallery-dot')).toHaveCount(2);
  await expect(guideGallery.locator('[data-gallery-prev]')).toBeVisible();
  await expect(guideGallery.locator('[data-gallery-next]')).toBeVisible();
  await guideGallery.locator('[data-gallery-next]').click();
  await expect(guideGallery.locator('.gallery-image')).toHaveAttribute(
    'alt',
    'Arnold press top position: both dumbbells pressed overhead with arms extended.',
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
    'Arnold press top position: both dumbbells pressed overhead with arms extended.',
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

test('prone Y-T-W exercise images match the illustrated Y, T and W positions', async ({ page }) => {
  await page.goto('/#exercises');
  await page.locator('#search').fill('Prone Y-T-W');
  await page.locator('[data-detail="prone-ytw"]').click();

  const gallery = page.locator('#dialog-content [data-exercise-gallery]');
  await expect(gallery.locator('.gallery-dot')).toHaveCount(4);
  const orderedImages = [
    { filename: '1-start-position.jpeg', position: 'Starting position' },
    { filename: '2-y-position.jpeg', position: 'Y position' },
    { filename: '4-t-position.jpeg', position: 'T position' },
    { filename: '3-w-position.jpeg', position: 'W position' },
  ];
  for (const [index, { filename, position }] of orderedImages.entries()) {
    await gallery.locator('.gallery-dot').nth(index).click();
    await expect(gallery.locator('.gallery-image')).toHaveAttribute('src', new RegExp(filename));
    await expect(gallery.locator('.gallery-image')).toHaveAttribute(
      'alt',
      new RegExp(position, 'i'),
    );
    await expect
      .poll(() => gallery.locator('.gallery-image').evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
  }
});

test('the cached exercise library remains available after going offline', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto('/#exercises');
  await expect(page.locator('.exercise-card').first()).toBeVisible();
  await page.locator('.nav-links [data-page-link="home"]').click();
  await page.locator('#offline-download').click();
  await expect(page.locator('#offline-status')).toContainText('Ready offline', { timeout: 90_000 });
  await page.locator('.nav-links [data-page-link="exercises"]').click();
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
  await page.locator('#search').fill('Arnold press');
  await page.locator('[data-detail="arnold-press"]').click();
  const offlineImage = page.locator('#dialog-content .gallery-image');
  await expect(offlineImage).toHaveAttribute('src', /arnold-press/);
  await expect.poll(() => offlineImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
});
