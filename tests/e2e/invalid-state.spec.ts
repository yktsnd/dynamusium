import { expect, test } from '@playwright/test';

/**
 * Invalid-result UI: the app must stop playback, replace the network and
 * charts with an explicit failure state, and recover via Reset.
 *
 * The demonstration model cannot reach numerical failure through the UI's
 * clamped parameter ranges (that is by design), so this test injects an
 * invalid SimulationResult through the store debug handle — exercising the
 * exact state the solver produces on failure.
 */

const INVALID_STATE = {
  status: 'invalid',
  trajectory: null,
  playing: false,
  time: 0,
  error: {
    kind: 'negative-quantity',
    message: 'Quantity "a" went negative (-2.000e-3) at t = 1.240 s, beyond tolerance.',
    time: 1.24,
    step: 62,
    stateIndex: 0,
    stateId: 'a',
    value: -0.002,
    tolerance: 1e-9,
  },
  diagnostics: { smallClampCount: 0, reservoirCorrectionCount: 0, stepsCompleted: 61 },
};

test('invalid result halts playback, hides normal views, and Reset recovers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.network')).toBeVisible();

  await page.evaluate((state) => {
    window.__KINETIFLUX_STORE__!.setState(state as never);
  }, INVALID_STATE);

  // Failure surfaces; normal playback surfaces disappear.
  await expect(page.getByTestId('invalid-panel')).toBeVisible();
  await expect(page.getByTestId('invalid-panel')).toContainText('went negative');
  await expect(page.locator('.network')).toHaveCount(0);
  await expect(page.getByTestId('transport')).toHaveCount(0);
  await expect(page.getByTestId('readout-quantities')).toHaveCount(0);
  await expect(page.getByTestId('unavailable-quantities')).toBeVisible();
  await expect(page.getByTestId('unavailable-rates')).toBeVisible();

  // Screen reader path: alert panel + announcer text.
  await expect(page.getByTestId('invalid-panel')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('status-announcer')).toContainText('Simulation invalid', {
    timeout: 10_000,
  });

  // No time progression while invalid.
  await page.waitForTimeout(600);
  const time = await page.evaluate(() => window.__KINETIFLUX_STORE__!.getState().time);
  expect(time).toBe(0);

  // Reset restores the preset and resumes normal presentation.
  await page.getByTestId('invalid-reset').click();
  await expect(page.locator('.network')).toBeVisible();
  await expect(page.getByTestId('transport')).toBeVisible();
  await expect(page.getByTestId('invalid-panel')).toHaveCount(0);
  const status = await page.evaluate(() => window.__KINETIFLUX_STORE__!.getState().status);
  expect(status).toBe('valid');
});
