import { expect, test } from '@playwright/test';

/**
 * Exhibition (kiosk) mode: the toggle flips the store flag and a CSS hook,
 * and playback keeps advancing while it's active (the auto-advance/UI
 * recession machinery layers on top of the same untouched playback loop —
 * see src/features/exhibition/useExhibition.ts for the full sequencing,
 * which is impractical to exercise end-to-end here without a multi-minute
 * real-time wait for a trajectory to complete).
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

test('exhibition mode toggles on and off, and playback keeps advancing', async ({ page }) => {
  await expect(page.getByTestId('exhibit-toggle')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('exhibit-toggle').click();
  await expect(page.getByTestId('exhibit-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.app-root')).toHaveClass(/is-exhibit/);
  expect(await page.evaluate(() => window.__KINETIFLUX_STORE__!.getState().exhibitMode)).toBe(true);

  // Every displayed state is still a real simulated frame: time keeps moving.
  const t1 = await page.getByTestId('time-readout').textContent();
  await page.waitForTimeout(700);
  const t2 = await page.getByTestId('time-readout').textContent();
  expect(t2).not.toEqual(t1);

  await page.getByTestId('exhibit-toggle').click();
  await expect(page.getByTestId('exhibit-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.app-root')).not.toHaveClass(/is-exhibit/);
  expect(await page.evaluate(() => window.__KINETIFLUX_STORE__!.getState().exhibitMode)).toBe(
    false,
  );
});

test('the "e" key toggles exhibition mode', async ({ page }) => {
  await page.locator('body').click(); // ensure focus isn't inside a form field
  await page.keyboard.press('e');
  await expect(page.locator('.app-root')).toHaveClass(/is-exhibit/);
  await page.keyboard.press('e');
  await expect(page.locator('.app-root')).not.toHaveClass(/is-exhibit/);
});

test('?exhibit=1 enables exhibition mode on load', async ({ page }) => {
  await page.goto('/?exhibit=1');
  await expect(page.locator('.network')).toBeVisible();
  await expect(page.locator('.app-root')).toHaveClass(/is-exhibit/);
});
