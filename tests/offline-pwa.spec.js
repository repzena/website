import { test, expect } from './support/fixtures.js';

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
test('iPhone install help gives current Safari steps in the selected language', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1',
    });
  });
  await page.goto('/');

  await page.locator('#install-app').click();
  await expect(page.locator('#install-dialog')).toBeVisible();
  const steps = page.locator('#install-help-steps li');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toContainText('directly in Safari');
  await expect(steps.nth(1)).toContainText('tap Share');
  await expect(steps.nth(2)).toContainText('Add to Home Screen');
  await expect(steps.nth(3)).toContainText('Open as Web App');
  await expect(page.locator('#install-help-offline-note')).toContainText(
    'without adding an app icon',
  );

  await page.locator('#close-install-dialog').click();
  await page.locator('#language').selectOption('es');
  await page.locator('#install-app').click();
  await expect(page.locator('#install-help-steps li').nth(0)).toContainText(
    'directamente en Safari',
  );
  await expect(page.locator('#install-help-steps li').nth(2)).toContainText(
    'Agregar a pantalla de inicio',
  );
});
test('install help selects the current instructions for other mobile browsers', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () =>
        window.__installTestUserAgent || 'Mozilla/5.0 (Android 14; Mobile) Chrome/136.0.0.0',
    });
  });
  await page.goto('/');

  const browserCases = [
    {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/136.0.0.0 Mobile Safari/537.36',
      expected: 'Install and create shortcut',
    },
    {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 Chrome/136.0.0.0 Mobile Safari/537.36 SamsungBrowser/28.0',
      expected: 'Add page to',
    },
    {
      userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0',
      expected: 'Add automatically',
    },
    {
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/136.0.0.0 Mobile Safari/537.36 EdgA/136.0.0.0',
      expected: 'only offers a shortcut',
    },
    {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/136.0.0.0 Mobile/15E148 Safari/604.1',
      expected: 'Tap Share to the right of the address bar',
    },
    {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/142.0 Mobile/15E148 Safari/605.1.15',
      expected: 'Share icon in the address bar',
    },
  ];

  for (const browserCase of browserCases) {
    await page.evaluate((userAgent) => {
      window.__installTestUserAgent = userAgent;
    }, browserCase.userAgent);
    await page.locator('#install-app').click();
    await expect(page.locator('#install-dialog')).toBeVisible();
    await expect(page.locator('#install-help-steps')).toContainText(browserCase.expected);
    await page.locator('#close-install-dialog').click();
  }
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
