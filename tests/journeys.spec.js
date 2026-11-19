import { test, expect } from './support/fixtures.js';

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
  expect(scriptPolicy).toBe("script-src 'self' https://www.googletagmanager.com");

  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.injected = "yes";';
    document.head.append(script);
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-injected', 'yes');
});
test('analytics stays unloaded until visitors opt in and remembers rejection', async ({ page }) => {
  let analyticsScriptRequests = 0;
  await page.route('https://www.googletagmanager.com/gtag/js**', async (route) => {
    analyticsScriptRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });

  await page.goto('/');
  await expect(page.locator('#privacy-panel')).toBeVisible();
  await expect(page.locator('#privacy-panel')).toContainText('Optional Google Analytics');
  expect(analyticsScriptRequests).toBe(0);

  await page.locator('#analytics-reject').click();
  await expect(page.locator('#privacy-panel')).toBeHidden();
  await page.locator('#privacy-settings').click();
  await expect(page.locator('#privacy-panel')).toBeVisible();
  await page.reload();
  await expect(page.locator('#privacy-panel')).toBeHidden();
  expect(analyticsScriptRequests).toBe(0);
});
test('analytics loads the configurable ID after opt in, tracks routes and stops after withdrawal', async ({
  page,
}) => {
  let analyticsScriptRequests = 0;
  await page.route('https://www.googletagmanager.com/gtag/js**', async (route) => {
    analyticsScriptRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.__googleAnalyticsLoaded = true;',
    });
  });

  await page.goto('/');
  await page.locator('#language').selectOption('es');
  await expect(page.locator('#privacy-panel')).toContainText('Google Analytics es opcional');
  await page.locator('#analytics-accept').click();
  await expect.poll(() => page.evaluate(() => window.__googleAnalyticsLoaded)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.dataLayer?.length || 0)).toBeGreaterThan(2);
  expect(analyticsScriptRequests).toBe(1);
  const config = await page.request.get(
    new URL('data/analytics-config.json', page.url()).toString(),
  );
  expect(await config.json()).toEqual({ measurementId: 'G-LGV0WSZRVD' });
  await expect
    .poll(() => page.evaluate(() => window.dataLayer?.some((entry) => entry[0] === 'config')))
    .toBe(true);

  await page.getByRole('link', { name: 'Ver ejercicios' }).click();
  await expect(page.locator('[data-page="exercises"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.dataLayer?.filter((entry) => entry[0] === 'event' && entry[1] === 'page_view')
            .length,
      ),
    )
    .toBeGreaterThanOrEqual(2);

  await page.locator('#privacy-settings').click();
  await page.locator('#analytics-reject').click();
  await expect(page.locator('#privacy-panel')).toBeHidden();
  expect(await page.evaluate(() => window[`ga-disable-G-LGV0WSZRVD`])).toBe(true);
  const eventCountAfterWithdrawal = await page.evaluate(() => window.dataLayer.length);
  await page.locator('.nav-links [data-page-link="routines"]').click();
  await expect(page.locator('[data-page="routines"]')).toBeVisible();
  expect(await page.evaluate(() => window.dataLayer.length)).toBe(eventCountAfterWithdrawal);
  expect(analyticsScriptRequests).toBe(1);
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
