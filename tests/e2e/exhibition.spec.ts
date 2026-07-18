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
  await page.waitForTimeout(500);
  expect(await page.locator('.time-readout').textContent()).not.toEqual(before);
  expect(consoleErrors).toEqual([]);
});

test('field works expose a computed spatial canvas', async ({ page }) => {
  await page.goto('/?work=gray-scott&mode=observe&preset=canonical');
  await expect(page.getByLabel('Computed spatial field')).toBeVisible();
  await page.getByRole('slider', { name: /Feed/ }).fill('0.055');
  await expect(page.locator('.parameter-drawer')).toContainText('0.055');
});
