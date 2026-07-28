/**
 * Captures the README/docs screenshots from the real built museum app.
 *
 * Usage:
 *   npm run build && npm run preview &   # serves dist on :4173
 *   node scripts/capture-screens.mjs [outDir=docs/media]
 *
 * Each shot deep-links into a specific work/mode via the app's ?work=&mode=&preset=
 * route (see src/museum/MuseumApp.tsx), waits for a real content selector, then lets
 * playback develop for a few seconds so the network/trajectory shows live dynamics
 * before the frame is captured.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.CAPTURE_URL ?? 'http://localhost:4173';
const OUT = process.argv[2] ?? 'docs/media';

const shots = [
  {
    // The most beautiful, self-explanatory museum screen: a flagship work,
    // mid-observation, with the trajectory already tracing its attractor.
    name: 'hero',
    path: '/?work=lorenz-atmosphere&mode=observe&preset=canonical',
    width: 1440,
    height: 900,
    dsf: 2,
    selector: '.trajectory-line',
    settle: 12000,
  },
  {
    // The collection/gallery browse view, scrolled to the permanent-collection
    // grid so the breadth of the thirty works is visible at once.
    name: 'collection',
    path: '/#collection',
    width: 1440,
    height: 900,
    dsf: 2,
    selector: '.collection-grid',
    settle: 1500,
    scrollToSelector: '.collection-wing',
  },
  {
    // Study mode: the study panel is independently scrollable and taller
    // than the viewport, so scroll it to the bottom to bring the live data
    // table and source citations into frame together (the scientific
    // credibility shot).
    name: 'study',
    path: '/?work=double-pendulum&mode=study&preset=canonical',
    width: 1440,
    height: 900,
    dsf: 2,
    selector: '.study-panel table',
    settle: 5000,
    scrollPanelSelector: '.study-panel',
  },
  {
    // Exhibit/kiosk mode: chrome recedes to near-invisible, leaving the
    // artwork alone (see .mode-exhibit rules in museum.css).
    name: 'exhibit',
    path: '/?work=kuramoto-oscillators&mode=exhibit&preset=canonical',
    width: 1440,
    height: 900,
    dsf: 2,
    selector: '.phase-oscillator',
    settle: 6000,
  },
  {
    // Mobile entrance.
    name: 'responsive',
    path: '/',
    width: 390,
    height: 844,
    dsf: 1,
    selector: '.entrance-hero',
    settle: 1500,
  },
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
  await page.goto(`${BASE}${shot.path}`);
  await page.waitForSelector(shot.selector, { state: 'visible' });
  if (shot.scrollToSelector) {
    await page.evaluate((sel) => {
      document.querySelector(sel)?.scrollIntoView({ block: 'start' });
    }, shot.scrollToSelector);
  }
  if (shot.scrollPanelSelector) {
    // Scroll an independently-scrolling panel (e.g. the study panel) to its
    // bottom so trailing content like citations is in frame.
    await page.evaluate((sel) => {
      const panel = document.querySelector(sel);
      if (panel) panel.scrollTop = panel.scrollHeight;
    }, shot.scrollPanelSelector);
  }
  // Let playback/render develop before capturing so the frame is never blank.
  await page.waitForTimeout(shot.settle);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`captured ${OUT}/${shot.name}.png (${shot.width}x${shot.height})`);
  await page.close();
}
await browser.close();
