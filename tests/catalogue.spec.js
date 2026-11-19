import { test, expect } from './support/fixtures.js';

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
  const exercises = (await response.json()).exercises;

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
test('exercise card thumbnails can change images without opening the guide', async ({ page }) => {
  const exercises = await page.request
    .get('/data/exercises.json')
    .then((response) => response.json().then((catalogue) => catalogue.exercises));
  const exercise = exercises.find((item) => item.images?.length > 1);
  expect(exercise).toBeTruthy();

  await page.goto('/#exercises');
  await page.locator('#search').fill(exercise.name.en);
  const card = page.locator('.exercise-card').filter({
    has: page.locator(`[data-detail="${exercise.id}"]`),
  });
  const thumbnail = card.locator('[data-card-image]');
  const next = card.locator('[data-card-image-change="1"]');
  const count = card.locator('[data-card-image-count]');

  await expect(thumbnail).toHaveAttribute('src', exercise.images[0].src);
  await expect(next).toHaveAccessibleName('Next image');
  for (const [index, image] of exercise.images.entries()) {
    if (index > 0) await next.click();
    await expect(thumbnail).toHaveAttribute('src', image.src);
    await expect(count).toHaveText(`${index + 1} / ${exercise.images.length}`);
  }
  await next.click();
  await expect(thumbnail).toHaveAttribute('src', exercise.images[0].src);

  const galleryBounds = await card.locator('[data-card-gallery]').boundingBox();
  await card.locator(`[data-detail="${exercise.id}"]`).evaluate(
    (link, { x, y }) => {
      link.dispatchEvent(
        new window.PointerEvent('pointerdown', {
          bubbles: true,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );
      link.dispatchEvent(
        new window.PointerEvent('pointerup', {
          bubbles: true,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x - 100,
          clientY: y,
        }),
      );
      link.dispatchEvent(
        new window.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: x - 100,
          clientY: y,
        }),
      );
    },
    {
      x: galleryBounds.x + galleryBounds.width / 2,
      y: galleryBounds.y + galleryBounds.height / 2,
    },
  );
  await expect(thumbnail).toHaveAttribute('src', exercise.images[1].src);
  await expect(page.locator('#exercise-dialog')).toBeHidden();
  await expect(page).toHaveURL(/#exercises$/);

  await card.locator(`[data-detail="${exercise.id}"]`).click();
  await expect(page.locator('#exercise-dialog')).toBeVisible();
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
