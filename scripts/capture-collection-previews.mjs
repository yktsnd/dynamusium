import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createServer } from 'vite';

const OUT = 'public/collection-preview';
const STAGE = await mkdtemp(join(tmpdir(), 'dynamusium-previews-'));
const PALETTE = {
  'motion-chaos': '#81e5fa',
  'matter-pattern': '#d0a5ff',
  'life-reaction': '#ffa778',
  'earth-climate': '#a9e6a2',
  'cosmos-gravity': '#ffd27d',
};
const esc = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const point = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
const chartBox = { x: 100, y: 110, width: 1000, height: 405 };

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([name, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 4 + 1);
    rows[offset] = 0;
    pixels.copy(rows, offset + 1, row * width * 4, (row + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fieldColor(normalized) {
  const value = Math.max(0, Math.min(1, normalized));
  const fraction = value < 0.5 ? value * 2 : (value - 0.5) * 2;
  const from = value < 0.5 ? [7, 15, 35] : [56, 55, 122];
  const to = value < 0.5 ? [56, 55, 122] : [205, 244, 255];
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * fraction));
}

function normalizedBaseline(binding, encodeNumericValue) {
  return binding.zero === undefined
    ? 0
    : encodeNumericValue(binding.zero, { ...binding, zero: undefined }).normalized;
}

function fieldArtwork(work, result, { requireVisualBinding, encodeNumericValue }) {
  const field = result.field;
  const componentId = field.componentId ?? 'scalar';
  const binding = requireVisualBinding(work, componentId, 'luminance');
  const frame = result.numerical?.fieldFrames?.at(-1);
  const values = frame?.components[componentId] ?? field.values;
  if (values.length !== field.columns * field.rows) {
    throw new Error(`${work.slug}: field sample count does not match its reviewed grid.`);
  }
  if (field.columns === 1 || field.rows === 1) {
    const count = values.length;
    const vertical = field.columns === 1;
    return values
      .map((value, index) => {
        const [red, green, blue] = fieldColor(encodeNumericValue(value, binding).normalized);
        const x = vertical ? 582 : 100 + (index / count) * 1000;
        const y = vertical ? 110 + (index / count) * 405 : 302;
        const width = vertical ? 36 : 1000 / count + 0.5;
        const height = vertical ? 405 / count + 0.5 : 42;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="rgb(${red},${green},${blue})"/>`;
      })
      .join('');
  }
  const pixels = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => {
    const [red, green, blue] = fieldColor(encodeNumericValue(value, binding).normalized);
    pixels[index * 4] = red;
    pixels[index * 4 + 1] = green;
    pixels[index * 4 + 2] = blue;
    pixels[index * 4 + 3] = 255;
  });
  const image = encodePng(field.columns, field.rows, pixels).toString('base64');
  return `<image x="105" y="98" width="990" height="430" preserveAspectRatio="xMidYMid meet" image-rendering="pixelated" href="data:image/png;base64,${image}"/>`;
}

function pathArtwork(work, result, semantic, { visualLayers, numericDomain, encodeNumericValue }) {
  const layers = visualLayers(work).filter(
    (layer) =>
      layer.mark === 'path' &&
      layer.bindings.some((binding) => binding.channel === 'position-x') &&
      layer.bindings.some((binding) => binding.channel === 'position-y'),
  );
  const layer = layers[0];
  const xBinding = layer?.bindings.find((binding) => binding.channel === 'position-x');
  const yBinding = layer?.bindings.find((binding) => binding.channel === 'position-y');
  const xSeries = xBinding && result.series.find((series) => series.id === xBinding.quantityRef);
  const ySeries = yBinding && result.series.find((series) => series.id === yBinding.quantityRef);
  if (!layer || !xBinding || !yBinding || !xSeries || !ySeries) {
    throw new Error(`${work.slug}: no complete reviewed path is available for its preview.`);
  }
  const [xMin, xMax] = numericDomain(xBinding);
  const [yMin, yMax] = numericDomain(yBinding);
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const preserveUnits = layer.projection?.aspect !== 'declared-distortion';
  const scale = preserveUnits ? Math.min(chartBox.width / xSpan, chartBox.height / ySpan) : null;
  const width = scale === null ? chartBox.width : xSpan * scale;
  const height = scale === null ? chartBox.height : ySpan * scale;
  const left = chartBox.x + (chartBox.width - width) / 2;
  const top = chartBox.y + (chartBox.height - height) / 2;
  const stride = Math.max(1, Math.ceil(xSeries.values.length / 1600));
  let path = '';
  for (let index = 0; index < xSeries.values.length; index += stride) {
    const x = xSeries.values[index];
    const y = ySeries.values[index];
    if (x === undefined || y === undefined) continue;
    const px = left + encodeNumericValue(x, xBinding).normalized * width;
    const py = top + (1 - encodeNumericValue(y, yBinding).normalized) * height;
    path += `${path ? 'L' : 'M'}${point(px, py)}`;
  }
  return `<rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="#081522" fill-opacity=".24" stroke="#b6eafa" stroke-opacity=".12"/><path d="${path}" fill="none" stroke="${semantic.accent}" stroke-width="13" stroke-opacity=".18" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/><path d="${path}" fill="none" stroke="url(#trace)" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function snapshotIndex(result) {
  return Math.round((result.times.length - 1) * 0.72);
}

function valueAt(result, id, index) {
  const series = result.series.find((entry) => entry.id === id);
  return series?.values[index];
}

function oscillatorArtwork(work, result, semantic, { encodeNumericValue, findVisualBinding }) {
  const state = result.numerical?.state;
  if (!state || state.shape[1] !== 12)
    throw new Error(`${work.slug}: oscillator state is missing.`);
  const index = snapshotIndex(result);
  const cx = 600;
  const cy = 314;
  const radius = 194;
  const phases = Array.from(
    { length: 12 },
    (_, oscillator) => state.values[index * 12 + oscillator],
  );
  const dots = phases
    .map((phase, oscillator) => {
      const binding = findVisualBinding(work, `theta-${oscillator + 1}`, 'phase');
      if (phase === undefined || !binding)
        throw new Error(`${work.slug}: phase mapping is missing.`);
      const angle = encodeNumericValue(phase, binding).normalized * 2 * Math.PI;
      const x = cx + radius * Math.cos(angle);
      const y = cy - radius * Math.sin(angle);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="8" fill="${semantic.accent}" fill-opacity=".86"/>`;
    })
    .join('');
  const orderX = valueAt(result, 'order-real', index);
  const orderY = valueAt(result, 'order-imaginary', index);
  const coherence = valueAt(result, 'coherence', index);
  const xBinding = findVisualBinding(work, 'order-real', 'position-x');
  const yBinding = findVisualBinding(work, 'order-imaginary', 'position-y');
  const cBinding = findVisualBinding(work, 'coherence', 'area');
  if (
    orderX === undefined ||
    orderY === undefined ||
    coherence === undefined ||
    !xBinding ||
    !yBinding ||
    !cBinding
  ) {
    throw new Error(`${work.slug}: order-vector mapping is incomplete.`);
  }
  const normX =
    encodeNumericValue(orderX, xBinding).normalized -
    normalizedBaseline(xBinding, encodeNumericValue);
  const normY =
    encodeNumericValue(orderY, yBinding).normalized -
    normalizedBaseline(yBinding, encodeNumericValue);
  const cNorm = encodeNumericValue(coherence, cBinding).normalized;
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#86d9eb" stroke-opacity=".27" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${Math.sqrt(Math.max(0, cNorm)) * 75}" fill="${semantic.accent}" fill-opacity=".12" stroke="${semantic.accent}" stroke-opacity=".3"/>${dots}<line x1="${cx}" y1="${cy}" x2="${(cx + radius * normX).toFixed(2)}" y2="${(cy - radius * normY).toFixed(2)}" stroke="#f5e4bb" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="4" fill="#f5e4bb"/><text x="600" y="321" text-anchor="middle" class="metric">R = ${coherence.toFixed(3)}</text>`;
}

function energyArtwork(work, result, semantic, { encodeNumericValue, findVisualBinding }) {
  const index = snapshotIndex(result);
  return [1, 2, 3, 4]
    .map((mode, ordinal) => {
      const id = `mode-${mode}-harmonic-energy`;
      const value = valueAt(result, id, index);
      const binding = findVisualBinding(work, id, 'area');
      if (value === undefined || !binding)
        throw new Error(`${work.slug}: modal energy is missing.`);
      const baseline = normalizedBaseline(binding, encodeNumericValue);
      const height = Math.abs(encodeNumericValue(value, binding).normalized - baseline) * 280;
      const x = 218 + ordinal * 255;
      return `<rect x="${x - 58}" y="190" width="116" height="280" rx="4" fill="#091a28" stroke="#94dfef" stroke-opacity=".22"/><rect x="${x - 54}" y="${(470 - height).toFixed(2)}" width="108" height="${height.toFixed(2)}" rx="2" fill="${semantic.accent}" fill-opacity=".74"/><text x="${x}" y="510" text-anchor="middle" class="metric">mode ${mode}</text>`;
    })
    .join('');
}

function reactionArtwork(work, result, semantic, { encodeNumericValue, findVisualBinding }) {
  const index = snapshotIndex(result);
  const quantities = ['a', 'b', 'c', 'collected'];
  const fluxes = ['a-to-b-flux', 'b-to-c-flux', 'c-to-collected-flux'];
  const xs = [205, 465, 725, 985];
  const vessels = quantities
    .map((id, position) => {
      const value = valueAt(result, id, index);
      const binding = findVisualBinding(work, id, 'area');
      if (value === undefined || !binding)
        throw new Error(`${work.slug}: quantity mapping is missing.`);
      const fill =
        Math.abs(
          encodeNumericValue(value, binding).normalized -
            normalizedBaseline(binding, encodeNumericValue),
        ) * 220;
      const x = xs[position];
      return `<path d="M${x - 46} 198 V440 H${x + 46} V198" fill="none" stroke="#bdebf3" stroke-opacity=".58" stroke-width="3"/><rect x="${x - 42}" y="${(436 - fill).toFixed(2)}" width="84" height="${fill.toFixed(2)}" fill="url(#fluid)"/><text x="${x}" y="477" text-anchor="middle" class="metric">${id === 'collected' ? 'collected' : id.toUpperCase()}</text>`;
    })
    .join('');
  const channels = fluxes
    .map((id, indexInChain) => {
      const value = valueAt(result, id, index);
      const binding = findVisualBinding(work, id, 'stroke-width');
      if (value === undefined || !binding)
        throw new Error(`${work.slug}: flux mapping is missing.`);
      const width =
        2 +
        Math.abs(
          encodeNumericValue(value, binding).normalized -
            normalizedBaseline(binding, encodeNumericValue),
        ) *
          13;
      const x1 = xs[indexInChain] + 55;
      const x2 = xs[indexInChain + 1] - 55;
      const particle = (x1 + x2) / 2;
      return `<line x1="${x1}" y1="320" x2="${x2}" y2="320" stroke="${semantic.accent}" stroke-opacity=".66" stroke-width="${width.toFixed(2)}" marker-end="url(#arrow)"/><circle cx="${particle}" cy="320" r="4" fill="#f8ead0"/>`;
    })
    .join('');
  return `<defs><linearGradient id="fluid" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3b96bc" stop-opacity=".5"/><stop offset="1" stop-color="#baf4fa" stop-opacity=".9"/></linearGradient><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0 L0 6 L8 3 Z" fill="#d2f7ff"/></marker></defs>${vessels}${channels}`;
}

function makeSvg(work, result, semantic, helpers) {
  let artwork;
  if (result.field) artwork = fieldArtwork(work, result, helpers);
  else if (work.kernel === 'kuramoto') artwork = oscillatorArtwork(work, result, semantic, helpers);
  else if (work.kernel === 'fput') artwork = energyArtwork(work, result, semantic, helpers);
  else if (work.kernel === 'reaction-chain')
    artwork = reactionArtwork(work, result, semantic, helpers);
  else artwork = pathArtwork(work, result, semantic, helpers);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 720" role="img" aria-label="Computed preview of ${esc(work.title)}"><defs><radialGradient id="ground"><stop stop-color="#183047"/><stop offset="1" stop-color="#060d16"/></radialGradient><linearGradient id="trace" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${semantic.accent}" stop-opacity=".36"/><stop offset=".55" stop-color="#e1fbff"/><stop offset="1" stop-color="${semantic.accent}" stop-opacity=".55"/></linearGradient><filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter></defs><rect width="1200" height="720" fill="url(#ground)"/><circle cx="1050" cy="100" r="260" fill="${semantic.accent}" fill-opacity=".055"/><g stroke="#b7e7f0" stroke-opacity=".075" stroke-width="1"><path d="M100 110H1100M100 211H1100M100 313H1100M100 414H1100M100 515H1100"/><path d="M100 110V515M350 110V515M600 110V515M850 110V515M1100 110V515"/></g><rect x="34" y="34" width="1132" height="652" rx="15" fill="none" stroke="#d2f4fa" stroke-opacity=".16"/><rect x="54" y="54" width="1092" height="612" rx="10" fill="none" stroke="${semantic.accent}" stroke-opacity=".27"/>${artwork}<path d="M72 573H1128" stroke="#b6e5ed" stroke-opacity=".2"/><circle cx="82" cy="617" r="4" fill="${semantic.accent}"/><text x="99" y="622" class="eyebrow">DYNAMUSIUM · ${esc(semantic.gallery.toUpperCase())}</text><text x="72" y="662" class="title">${esc(work.title)}</text><text x="1126" y="621" text-anchor="end" class="note">MODEL-DERIVED STUDY · ${esc(work.year)}</text><text x="1126" y="656" text-anchor="end" class="subtitle">${esc(work.subtitle)}</text><style>.eyebrow{font:600 13px Inter,Arial,sans-serif;letter-spacing:2.2px;fill:#bdd6df}.title{font:500 28px 'Space Grotesk',Inter,Arial,sans-serif;fill:#eff9fb}.subtitle{font:400 13px Inter,Arial,sans-serif;fill:#a4bdc7}.note{font:500 10px 'JetBrains Mono',monospace;letter-spacing:1px;fill:#89a8b5}.metric{font:500 17px 'JetBrains Mono',monospace;fill:#dff4f8}</style></svg>`;
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const [{ works }, { simulateWork }, semantic] = await Promise.all([
    server.ssrLoadModule('/src/museum/catalog.ts'),
    server.ssrLoadModule('/src/museum/simulation.ts'),
    server.ssrLoadModule('/src/museum/semantic-visual.ts'),
  ]);
  for (const work of works) {
    const result = simulateWork(work, {});
    const accent = PALETTE[work.gallery];
    if (!accent) throw new Error(`${work.slug}: no curated gallery color exists.`);
    const svg = makeSvg(
      work,
      result,
      { accent, gallery: work.gallery.replaceAll('-', ' ') },
      semantic,
    );
    await writeFile(join(STAGE, `${work.slug}.svg`), svg);
    console.log(`captured ${OUT}/${work.slug}.svg`);
  }
} finally {
  await server.close();
}
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(STAGE, OUT, { recursive: true });
await rm(STAGE, { recursive: true, force: true });
