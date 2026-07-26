import { expect, test } from '@playwright/test';

type InstrumentedWindow = Window &
  typeof globalThis & {
    __simulationWorkerStarts: number;
  };

test('a rapid parameter drag keeps its slider and starts only the final scientific run', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const instrumented = window as InstrumentedWindow;
    const NativeWorker = window.Worker;
    instrumented.__simulationWorkerStarts = 0;
    const CountingWorker = new Proxy(NativeWorker, {
      construct(target, argumentsList) {
        instrumented.__simulationWorkerStarts += 1;
        return Reflect.construct(target, argumentsList);
      },
    });
    Object.defineProperty(window, 'Worker', { configurable: true, value: CountingWorker });
  });
  await page.goto('/?work=gray-scott&mode=observe&preset=canonical');
  await expect(page.locator('.field-canvas')).toBeVisible();

  const slider = page.getByRole('slider', { name: /Feed/ });
  const original = await slider.elementHandle();
  const box = await slider.boundingBox();
  if (!original || !box) throw new Error('Feed slider is missing a draggable box.');
  const workerStartsBefore = await page.evaluate(
    () => (window as InstrumentedWindow).__simulationWorkerStarts,
  );
  const initialValue = await slider.inputValue();
  const startX = box.x + box.width * 0.39;
  const endX = box.x + box.width * 0.82;
  const y = box.y + box.height / 2;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 12 });

  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  expect(await slider.inputValue()).not.toBe(initialValue);
  expect(await page.evaluate(() => (window as InstrumentedWindow).__simulationWorkerStarts)).toBe(
    workerStartsBefore,
  );

  await page.mouse.up();
  await expect(page.locator('.field-canvas')).toBeVisible();
  expect(await original.evaluate((element) => element.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as InstrumentedWindow).__simulationWorkerStarts)).toBe(
    workerStartsBefore + 1,
  );
});

test('reviewed phase portraits use their regime scale and separate secondary traces', async ({
  page,
}) => {
  await page.goto('/?work=lotka-volterra&mode=observe&preset=quiet');
  const portrait = page.locator('.scientific-artwork svg').first();
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute('data-overflow-samples', '0');
  const pathBox = await page.locator('.trajectory-line').boundingBox();
  if (!pathBox) throw new Error('Lotka–Volterra path is not measurable.');
  // Equal data units deliberately preserve the quiet regime's tall, narrow orbit.
  expect(pathBox.width).toBeGreaterThan(80);
  expect(pathBox.height).toBeGreaterThan(180);
  await expect(page.locator('.trace-series')).toHaveCount(2);
  await expect(page.locator('.trace-series').first().locator('small')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.trace-series').first().locator('small')).toBeVisible();
  const artworkBox = await page.locator('.scientific-artwork').boundingBox();
  const traceBox = await page.locator('.trace-panel').boundingBox();
  if (!artworkBox || !traceBox) throw new Error('Responsive artwork regions are missing.');
  expect(traceBox.y).toBeGreaterThanOrEqual(artworkBox.y + artworkBox.height - 1);
});

test('custom phase overflow is explicit and never becomes a generic failure', async ({ page }) => {
  await page.goto('/?work=lotka-volterra&mode=observe&preset=canonical');
  await expect(page.locator('.trajectory-line')).toBeVisible();
  await page.getByRole('slider', { name: /Predation/ }).fill('0.1');
  await page.getByRole('slider', { name: /Prey growth/ }).fill('2');
  const portrait = page.locator('.scientific-artwork svg').first();
  await expect(portrait).toBeVisible();
  await expect
    .poll(async () => Number(await portrait.getAttribute('data-overflow-samples')))
    .toBeGreaterThan(0);
  await expect(portrait).toHaveAttribute(
    'aria-label',
    /samples are outside the declared scale and are not joined into the visible path/,
  );
  await expect(page.locator('.overflow-label')).toContainText('samples clipped');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a CR3BP close encounter remains a visible terminal scientific event', async ({ page }) => {
  await page.goto('/?work=restricted-three-body&mode=observe&preset=canonical');
  await expect(page.locator('.trajectory-line')).toBeVisible();
  await page.getByRole('slider', { name: /Mass ratio/ }).fill('0.016');

  await expect(page.locator('.scientific-event')).toContainText('Terminal scientific event');
  await expect(page.locator('.scientific-event')).toContainText('not a physical collision claim');
  await expect(page.getByRole('slider', { name: /Mass ratio/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.trajectory-line')).toBeVisible();
  await page.getByRole('button', { name: 'study' }).click();
  await expect(page.locator('.study-panel .scientific-event.is-inline')).toBeVisible();
  await expect(page.locator('.work-stage > .scientific-event')).toHaveCount(0);

  const sourceLink = page.locator('.study-panel section').last().getByRole('link').first();
  const sourceCenterIsClickable = async () => {
    await sourceLink.scrollIntoViewIfNeeded();
    return sourceLink.evaluate((link) => {
      const bounds = link.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return hit === link || link.contains(hit);
    });
  };
  expect(await sourceCenterIsClickable()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await sourceCenterIsClickable()).toBe(true);
});
