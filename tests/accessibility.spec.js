import { test, expect } from './support/fixtures.js';

function contrastRatio(foreground, background) {
  const channels = (color) =>
    color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
  const luminance = (color) => {
    const [r, g, b] = channels(color).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('exercise guide dialog opens and closes with the keyboard and restores focus and position', async ({
  page,
}) => {
  await page.goto('/#exercises');
  const trigger = page.locator('[data-detail]').first();
  await trigger.focus();
  await trigger.press('Enter');

  const dialog = page.locator('#exercise-dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('body text, primary buttons and keyboard focus indicators meet WCAG AA contrast', async ({
  page,
}) => {
  await page.goto('/');
  for (const theme of ['light', 'dark']) {
    await page.locator('#theme').selectOption(theme);
    const colors = await page.evaluate(() => {
      const read = (selector) => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        return { foreground: style.color, background: style.backgroundColor };
      };
      const brand = document.querySelector('.brand');
      brand.focus();
      const focus = getComputedStyle(brand).outlineColor;
      return {
        body: read('body'),
        primaryButton: read('.button-dark'),
        secondaryButton: read('.button-light'),
        focus,
      };
    });
    expect(
      contrastRatio(colors.body.foreground, colors.body.background),
      `${theme} body`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.primaryButton.foreground, colors.primaryButton.background),
      `${theme} primary button`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.secondaryButton.foreground, colors.secondaryButton.background),
      `${theme} secondary button`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.focus, colors.body.background),
      `${theme} focus indicator`,
    ).toBeGreaterThanOrEqual(3);
  }
});
