import { test, expect } from './support/fixtures.js';

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
