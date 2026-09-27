import { expect, test, type Locator } from '@playwright/test';

async function expectFieldWithinArtwork(field: Locator) {
  const edges = await field.evaluate((canvas) => {
    const fieldBox = canvas.getBoundingClientRect();
    const panelBox = canvas.parentElement!.getBoundingClientRect();
    return {
      fieldLeft: fieldBox.left,
      fieldRight: fieldBox.right,
      fieldTop: fieldBox.top,
      fieldBottom: fieldBox.bottom,
      panelLeft: panelBox.left,
      panelRight: panelBox.right,
      panelTop: panelBox.top,
      panelBottom: panelBox.bottom,
    };
  });
  expect(edges.fieldLeft).toBeGreaterThanOrEqual(edges.panelLeft - 1);
  expect(edges.fieldRight).toBeLessThanOrEqual(edges.panelRight + 1);
  expect(edges.fieldTop).toBeGreaterThanOrEqual(edges.panelTop - 1);
  expect(edges.fieldBottom).toBeLessThanOrEqual(edges.panelBottom + 1);
}

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
  await expect(page.locator('.field-legend')).toHaveAttribute(
    'aria-label',
    /Linear luminance scale/,
  );
  await expect(field).toHaveCSS('width', /[1-9][0-9]{2}/);
  const aspectRatio = await field.evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(aspectRatio).toBeCloseTo(48 / 32, 1);
  await expectFieldWithinArtwork(field);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileRatio = await field.evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(mobileRatio).toBeCloseTo(48 / 32, 1);
  await expectFieldWithinArtwork(field);
  await page.getByRole('slider', { name: /Feed/ }).fill('0.055');
  await expect(page.locator('.parameter-drawer')).toContainText('0.055');

  await page.goto('/?work=ising-model&mode=observe&preset=canonical');
  const squareField = page.locator('.field-canvas');
  await expect(squareField).toBeVisible();
  await expectFieldWithinArtwork(squareField);
});

test('Study keeps the field centered inside its artwork panel on desktop', async ({ page }) => {
  await page.goto('/?work=gray-scott&mode=study&preset=canonical');
  const field = page.locator('.field-canvas');
  await expect(field).toBeVisible();
  await expectFieldWithinArtwork(field);
  const geometry = await field.evaluate((canvas) => {
    const fieldBox = canvas.getBoundingClientRect();
    const panelBox = canvas.parentElement!.getBoundingClientRect();
    return {
      fieldLeft: fieldBox.left,
      fieldRight: fieldBox.right,
      fieldCenter: (fieldBox.left + fieldBox.right) / 2,
      panelLeft: panelBox.left,
      panelRight: panelBox.right,
      panelCenter: (panelBox.left + panelBox.right) / 2,
    };
  });

  expect(geometry.fieldLeft).toBeGreaterThanOrEqual(geometry.panelLeft);
  expect(geometry.fieldRight).toBeLessThanOrEqual(geometry.panelRight);
  expect(Math.abs(geometry.fieldCenter - geometry.panelCenter)).toBeLessThanOrEqual(1);
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
