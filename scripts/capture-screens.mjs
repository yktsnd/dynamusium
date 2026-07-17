/**
 * Captures the README/docs screenshots from the real built app.
 *
 * Usage:
 *   npm run build && npm run preview &   # serves dist on :4173
 *   node scripts/capture-screens.mjs [outDir=docs/media]
 *
 * Screenshots are taken mid-playback so the network shows live dynamics.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.CAPTURE_URL ?? 'http://localhost:4173';
const OUT = process.argv[2] ?? 'docs/media';

const shots = [
  { name: 'hero', width: 1440, height: 900, settle: 6000, preset: 'steady-feed', dsf: 2 },
  { name: 'wide', width: 1280, height: 800, settle: 12000, preset: 'tidal-feed', dsf: 2 },
  { name: 'responsive', width: 390, height: 844, settle: 6000, preset: 'steady-feed', dsf: 1 },
];

await mkdir(OUT, { recursive: true });
// PLAYWRIGHT_CHROMIUM_PATH lets environments with a pre-installed browser
// (e.g. a sandbox that pins a different build) reuse it instead of downloading.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
for (const shot of shots) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: shot.dsf ?? 2,
  });
  await page.goto(BASE);
  await page.waitForSelector('.network');
  if (shot.preset) {
    await page.getByTestId(`preset-${shot.preset}`).click();
  }
  // Let playback develop visible dynamics before capturing.
  await page.waitForTimeout(shot.settle);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`captured ${OUT}/${shot.name}.png (${shot.width}x${shot.height})`);
  await page.close();
}
await browser.close();
