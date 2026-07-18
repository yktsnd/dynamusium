import { expect, test } from '@playwright/test';

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/');
});

test.afterEach(() => expect(consoleErrors).toEqual([]));

test('entrance presents the complete museum and all thirty works', async ({ page }) => {
  await expect(page).toHaveTitle(/DynaMusium/);
  await expect(page.getByRole('heading', { name: /Enter the living/ })).toBeVisible();
  await expect(page.locator('.flagship-card')).toHaveCount(6);
  await expect(page.locator('.collection-card')).toHaveCount(30);
  await page.getByRole('button', { name: 'Matter & Pattern', exact: true }).click();
  await expect(page.locator('.collection-card')).toHaveCount(6);
});

test('a visitor can enter, pause, scrub, tune, and open the study view', async ({ page }) => {
  await page.getByRole('button', { name: 'Begin with Lorenz' }).click();
  await expect(page.getByRole('heading', { name: 'Lorenz Atmosphere' })).toBeVisible();
  await expect(page.locator('.trajectory-line')).toBeVisible();

  await page.getByRole('button', { name: /Pause/ }).click();
  const timeline = page.getByRole('slider', { name: 'Time' });
  await timeline.fill('0.5');
  await expect(page.locator('.time-readout')).toContainText('19.0');

  const parameter = page.getByRole('slider', { name: /Thermal forcing/ });
  await parameter.fill('35');
  await expect(page.locator('.parameter-drawer')).toContainText('35.00');

  await page.getByRole('button', { name: 'study' }).click();
  await expect(page.locator('.study-panel')).toBeVisible();
  await expect(page.locator('.study-panel table')).toBeVisible();
  await expect(page.locator('.study-panel')).toContainText('Deterministic Nonperiodic Flow');
});

test('deep links restore work, viewing mode, and preset', async ({ page }) => {
  await page.goto('/?work=lotka-volterra&mode=study&preset=threshold');
  await expect(page.getByRole('heading', { name: 'Lotka–Volterra' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'study' })).toHaveClass(/is-active/);
  await expect(page.getByRole('button', { name: 'Near threshold' })).toHaveClass(/is-active/);
});
