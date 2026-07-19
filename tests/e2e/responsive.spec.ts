import { expect, test } from '@playwright/test';

test('mobile entrance and work remain usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Enter the living/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole('button', { name: 'Begin with Lorenz' }).click();
  await expect(page.locator('.scientific-artwork')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'study' }).click();
  await expect(page.locator('.study-panel')).toBeVisible();
  await page.locator('.study-panel section').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.study-panel section').last()).toBeInViewport();
  expect(
    await page
      .locator('.work-stage')
      .evaluate((element) => element.scrollHeight === element.clientHeight),
  ).toBe(true);
});

test('tablet preset controls retain visible labels and usable targets', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/?work=lorenz-atmosphere&mode=observe&preset=canonical');

  const presets = page.locator('.preset-controls button');
  await expect(presets).toHaveCount(3);
  for (const preset of await presets.all()) {
    expect(
      Number.parseFloat(await preset.evaluate((element) => getComputedStyle(element).fontSize)),
    ).toBeGreaterThan(0);
    const box = await preset.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }
  await expect(page.getByRole('button', { name: 'Canonical' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quiet regime' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Near threshold' })).toBeVisible();
});

test('wide-screen graph never intercepts the simulation controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?work=lorenz-atmosphere&mode=observe&preset=canonical');

  await page.getByRole('button', { name: /Pause/ }).click();
  await page.getByRole('slider', { name: 'Time' }).fill('0.5');
  await page.getByRole('button', { name: 'Near threshold' }).click();
  await expect(page.getByRole('button', { name: 'Near threshold' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('primary touch targets meet the minimum target size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  for (const locator of [page.getByRole('link', { name: 'Browse all 30 works' })]) {
    const box = await locator.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }

  await page.getByRole('button', { name: 'Begin with Lorenz' }).click();
  await page.getByRole('button', { name: 'study' }).click();
  for (const locator of [
    page.getByRole('button', { name: /Collection/ }),
    page.getByRole('button', { name: /Pause/ }),
    page.locator('.study-panel a').first(),
  ]) {
    await locator.scrollIntoViewIfNeeded();
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }
});
