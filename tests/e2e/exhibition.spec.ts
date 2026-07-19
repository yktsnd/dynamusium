import { expect, test } from '@playwright/test';

test('exhibit mode recedes the instrument chrome while computed time continues', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/?work=double-pendulum&mode=observe&preset=canonical');
  await expect(page.locator('.trajectory-line')).toBeVisible();
  const before = await page.locator('.time-readout').textContent();
  await page.getByRole('button', { name: 'exhibit' }).click();
  await expect(page.locator('.work-experience')).toHaveClass(/mode-exhibit/);
  await page.locator('.scientific-artwork').hover();
  await expect(page.locator('.work-controls')).toHaveCSS('opacity', '0.12');
  await expect(page.locator('.trace-panel')).toHaveCSS('opacity', '0.12');
  await page.waitForTimeout(500);
  expect(await page.locator('.time-readout').textContent()).not.toEqual(before);
  expect(consoleErrors).toEqual([]);
});

test('field works expose a computed spatial canvas', async ({ page }) => {
  await page.goto('/?work=gray-scott&mode=observe&preset=canonical');
  const field = page.locator('.field-canvas');
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute('aria-label', /Computed v spatial field/);
  await expect(field).toHaveAttribute('data-overflow', '0');
  await expect(field).toHaveCSS('width', /[1-9][0-9]{2}/);
  await page.getByRole('slider', { name: /Feed/ }).fill('0.055');
  await expect(page.locator('.parameter-drawer')).toContainText('0.055');
});

test('reduced motion freezes presentation while preserving flux evidence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?work=fed-reaction-chain&mode=observe&preset=canonical');
  const staticControl = page.getByRole('button', { name: 'Static view' });
  await expect(staticControl).toBeDisabled();
  await expect(page.locator('.flux-channel line')).toHaveCount(3);
  await expect(page.locator('.flux-particle')).toHaveCount(0);
  await expect(page.locator('.quantity-value')).toHaveCount(4);
  const before = await page.locator('.time-readout').textContent();
  await page.waitForTimeout(500);
  expect(await page.locator('.time-readout').textContent()).toEqual(before);
});
