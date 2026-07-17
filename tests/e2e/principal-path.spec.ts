import { expect, test, type Page } from '@playwright/test';

/**
 * The principal user path, end to end:
 * open → preset → playback → scrub → edit a parameter → trajectory updates →
 * switch reversible display mode → reset to defaults.
 */

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.goto('/');
  await expect(page.locator('.network')).toBeVisible();
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

async function pause(page: Page) {
  const toggle = page.getByTestId('play-toggle');
  if ((await toggle.getAttribute('aria-label')) === 'Pause') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Play');
}

test('opens complete: title, network, charts, legend, no dead controls', async ({ page }) => {
  await expect(page).toHaveTitle(/KinetiFlux/);
  await expect(page.getByTestId('legend-card')).toBeVisible();
  await expect(page.locator('.vessel')).toHaveCount(3);
  await expect(page.locator('.basin')).toHaveCount(1);
  await expect(page.getByTestId('readout-quantities')).toBeVisible();
  await expect(page.getByTestId('readout-rates')).toBeVisible();
  // First load plays gently: the clock advances on its own.
  const t1 = await page.getByTestId('time-readout').textContent();
  await page.waitForTimeout(700);
  const t2 = await page.getByTestId('time-readout').textContent();
  expect(t2).not.toEqual(t1);
});

test('playback: pause, play, restart', async ({ page }) => {
  await pause(page);
  const frozen = await page.getByTestId('time-readout').textContent();
  await page.waitForTimeout(500);
  expect(await page.getByTestId('time-readout').textContent()).toEqual(frozen);

  await page.getByTestId('play-toggle').click();
  await page.waitForTimeout(500);
  expect(await page.getByTestId('time-readout').textContent()).not.toEqual(frozen);

  await page.getByRole('button', { name: 'Restart from the beginning' }).click();
  await pause(page);
  const t = await page.getByTestId('time-readout').textContent();
  expect(Number.parseFloat(t ?? '99')).toBeLessThan(3);
});

test('scrubbing the timeline moves time without recomputing', async ({ page }) => {
  await pause(page);
  await page.getByTestId('timeline').fill('30');
  await expect(page.getByTestId('time-readout')).toContainText('30.0 s');
  const at30 = await page.getByTestId('readout-quantities').textContent();

  await page.getByTestId('timeline').fill('5');
  await expect(page.getByTestId('time-readout')).toContainText('5.0 s');
  const at5 = await page.getByTestId('readout-quantities').textContent();
  expect(at5).not.toEqual(at30);

  // Scrubbing back to the same time reproduces the same displayed frame.
  await page.getByTestId('timeline').fill('30');
  await expect(page.getByTestId('readout-quantities')).toHaveText(at30 ?? '');
});

test('selecting a preset restarts with the new scenario', async ({ page }) => {
  await page.getByTestId('preset-closed-equilibrium').click();
  await expect(page.getByTestId('preset-closed-equilibrium')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await pause(page);
  await page.getByTestId('timeline').fill('58');
  // No feed and no drain: the basin stays where it started (empty).
  await expect(page.locator('.basin')).toHaveAccessibleName(/0\.00 mol collected/);
});

test('editing a parameter recomputes the displayed trajectory', async ({ page }) => {
  await pause(page);
  await page.getByTestId('timeline').fill('30');
  const before = await page.getByTestId('readout-quantities').textContent();

  await page.getByTestId('inspector-toggle').click();
  const kf = page.getByTestId('param-kf');
  await expect(kf).toBeVisible();
  await kf.fill('1.5');
  // Same time, new solution: displayed values must change.
  await expect(page.getByTestId('time-readout')).toContainText('30.0 s');
  await expect(page.getByTestId('readout-quantities')).not.toHaveText(before ?? '');

  await page.getByTestId('reset-defaults').click();
  await expect(page.getByTestId('param-kf')).toHaveValue('0.5');
});

test('switching reversible display mode changes rate decomposition', async ({ page }) => {
  // Directional view shows the dashed reverse series B→A in the rate legend.
  await expect(page.locator('.chart-legend', { hasText: 'B→A' })).toBeVisible();
  await page.getByTestId('rate-view-net').click();
  await expect(page.locator('.chart-legend', { hasText: 'B→A' })).toHaveCount(0);
  await page.getByTestId('rate-view-directional').click();
  await expect(page.locator('.chart-legend', { hasText: 'B→A' })).toBeVisible();
});

test('legend dismisses and reopens; keyboard reaches the transport', async ({ page }) => {
  await page.getByTestId('legend-close').click();
  await expect(page.getByTestId('legend-card')).toHaveCount(0);
  await page.getByTestId('legend-toggle').click();
  await expect(page.getByTestId('legend-card')).toBeVisible();

  // The timeline is a real range input and responds to the keyboard.
  await pause(page);
  await page.getByTestId('timeline').focus();
  await page.keyboard.press('ArrowRight');
  const t = await page.getByTestId('time-readout').textContent();
  expect(Number.parseFloat(t ?? '0')).toBeGreaterThan(0);
});
