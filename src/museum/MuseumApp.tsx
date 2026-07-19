import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { galleries, workBySlug, works } from './catalog.ts';
import type { WorkRunResult } from './portrait-types.ts';
import type { GalleryId, MuseumMode, Series, WorkManifest, WorkResult } from './types.ts';
import { useWorkSimulation } from './useWorkSimulation.ts';
import { useReducedMotion } from '../lib/accessibility/useReducedMotion.ts';
import {
  describeBinding,
  encodeNumericValue,
  findVisualBinding,
  numericDomain,
  normalizedZero,
  requireVisualBinding,
  visualLayers,
} from './semantic-visual.ts';

const flagshipWorks = works.filter((work) => work.tier === 'flagship');

function readRoute() {
  const query = new URLSearchParams(window.location.search);
  const work = query.get('work');
  const mode = query.get('mode');
  return {
    work: work && workBySlug.has(work) ? work : null,
    mode: mode === 'study' || mode === 'exhibit' ? mode : ('observe' as MuseumMode),
    preset: query.get('preset') ?? 'canonical',
  };
}

function writeRoute(work: string | null, mode: MuseumMode = 'observe', preset = 'canonical') {
  const query = new URLSearchParams();
  if (work) {
    query.set('work', work);
    query.set('mode', mode);
    query.set('preset', preset);
  }
  const target = `${window.location.pathname}${query.size ? `?${query.toString()}` : ''}`;
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function BrandMark() {
  return (
    <svg className="museum-mark" viewBox="0 0 42 42" aria-hidden="true">
      <path d="M7 32V20a14 14 0 0 1 28 0v12" />
      <path d="M12 31c5-17 13 15 19-8" />
      <circle cx="31" cy="23" r="2" />
    </svg>
  );
}

function MuseumHeader({ onHome }: { onHome: () => void }) {
  return (
    <header className="museum-header">
      <button
        className="brand-lockup"
        type="button"
        onClick={onHome}
        aria-label="DynaMusium entrance"
      >
        <BrandMark />
        <span>
          <strong>DynaMusium</strong>
          <small>Museum of Dynamic Systems</small>
        </span>
      </button>
      <nav aria-label="Museum">
        <button type="button" onClick={onHome}>
          Collection
        </button>
        <a href="https://github.com/yktsnd/dynamusium" target="_blank" rel="noreferrer">
          Contribute
        </a>
      </nav>
    </header>
  );
}

function Entrance({ onSelect }: { onSelect: (slug: string) => void }) {
  const [gallery, setGallery] = useState<GalleryId | 'all'>('all');
  const visibleWorks = gallery === 'all' ? works : works.filter((work) => work.gallery === gallery);
  return (
    <main className="museum-entrance">
      <section className="entrance-hero">
        <div className="hero-orbit hero-orbit-a" aria-hidden="true" />
        <div className="hero-orbit hero-orbit-b" aria-hidden="true" />
        <p className="eyebrow">An archive of systems that move, grow, synchronize, and transform</p>
        <h1>
          Enter the living
          <br />
          <em>mathematics</em> of nature.
        </h1>
        <p className="hero-copy">
          Thirty landmark models from motion, matter, life, Earth, and the cosmos—presented as
          instruments to observe, not diagrams to merely read.
        </p>
        <div className="hero-actions">
          <button
            className="primary-action"
            type="button"
            onClick={() => onSelect('lorenz-atmosphere')}
          >
            Begin with Lorenz
          </button>
          <a href="#collection">Browse all 30 works</a>
        </div>
        <dl className="museum-stats">
          <div>
            <dt>30</dt>
            <dd>interactive works</dd>
          </div>
          <div>
            <dt>05</dt>
            <dd>scientific galleries</dd>
          </div>
          <div>
            <dt>06</dt>
            <dd>flagship rooms</dd>
          </div>
        </dl>
      </section>

      <section className="flagship-wing" aria-labelledby="flagship-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curator’s route</p>
            <h2 id="flagship-title">Six rooms to begin</h2>
          </div>
          <p>Each flagship has a distinct phase-space composition and exhibition rhythm.</p>
        </div>
        <div className="flagship-grid">
          {flagshipWorks.map((work, index) => (
            <button
              type="button"
              className={`flagship-card flagship-${index + 1}`}
              key={work.slug}
              onClick={() => onSelect(work.slug)}
            >
              <span className="card-index">0{index + 1}</span>
              <span className="card-gallery">
                {galleries.find((item) => item.id === work.gallery)?.label}
              </span>
              <strong>{work.title}</strong>
              <span>{work.subtitle}</span>
              <i aria-hidden="true">↗</i>
            </button>
          ))}
        </div>
      </section>

      <section className="collection-wing" id="collection" aria-labelledby="collection-title">
        <div className="section-heading collection-heading">
          <div>
            <p className="eyebrow">Permanent collection</p>
            <h2 id="collection-title">Five scales of becoming</h2>
          </div>
          <div className="gallery-filters" role="group" aria-label="Filter by gallery">
            <button
              className={gallery === 'all' ? 'is-active' : ''}
              type="button"
              aria-pressed={gallery === 'all'}
              onClick={() => setGallery('all')}
            >
              All
            </button>
            {galleries.map((item) => (
              <button
                className={gallery === item.id ? 'is-active' : ''}
                type="button"
                key={item.id}
                aria-pressed={gallery === item.id}
                onClick={() => setGallery(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="collection-grid">
          {visibleWorks.map((work) => (
            <button
              className="collection-card"
              type="button"
              key={work.slug}
              onClick={() => onSelect(work.slug)}
            >
              <span className="runtime-label">
                {work.runtime.replace('-v1', '')}
                {work.schemaVersion === 2
                  ? ` · target ${work.portrait.science.reviewedMaturity}`
                  : ' · M0'}
              </span>
              <strong>{work.title}</strong>
              <span>{work.subtitle}</span>
              <small>
                {work.year} · {work.authors[0]}
              </small>
            </button>
          ))}
        </div>
      </section>
      <footer className="museum-footer">
        <BrandMark />
        <p>
          DynaMusium treats equations as cultural objects: sourced, testable, and alive under
          observation.
        </p>
        <span>Open collection · MIT licensed</span>
      </footer>
    </main>
  );
}

function range(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, span: Math.max(1e-9, max - min) };
}

function pathForSeries(series: Series, width = 800, height = 120) {
  const valueRange = range(series.values);
  return series.values
    .map((value, index) => {
      const x = (index / Math.max(1, series.values.length - 1)) * width;
      const y = height - ((value - valueRange.min) / valueRange.span) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function scientificTimeAt(result: WorkResult, progress: number) {
  if (result.times.length === 0) throw new Error('A valid result must contain scientific times.');
  const position = Math.max(0, Math.min(1, progress)) * (result.times.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(result.times.length - 1, lower + 1);
  const fraction = position - lower;
  const left = result.times[lower];
  const right = result.times[upper];
  if (left === undefined || right === undefined) {
    throw new Error('Scientific time cursor is outside the validated result.');
  }
  return left + (right - left) * fraction;
}

function FieldCanvas({
  work,
  result,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [overflowCount, setOverflowCount] = useState(0);
  const componentId = result.field?.componentId ?? 'scalar';
  const binding = requireVisualBinding(work, componentId, 'luminance');
  const [minimum, maximum] = numericDomain(binding);
  useEffect(() => {
    if (!canvas.current || !result.field) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const { columns, rows } = result.field;
    const frames = result.numerical?.fieldFrames;
    const frameIndex = frames
      ? Math.min(frames.length - 1, Math.round(progress * (frames.length - 1)))
      : -1;
    let values = result.field.values;
    if (frameIndex >= 0) {
      const frame = frames?.[frameIndex];
      const frameValues = frame?.components[componentId];
      if (!frame || !frameValues) {
        throw new Error(`Scientific field frame omits display component "${componentId}".`);
      }
      values = frameValues;
    }
    canvas.current.width = columns;
    canvas.current.height = rows;
    const image = context.createImageData(columns, rows);
    let outsideCount = 0;
    values.forEach((value, index) => {
      const encoded = encodeNumericValue(value, binding);
      if (encoded.outsideDomain) outsideCount += 1;
      const normalized = encoded.normalized;
      // A quiet two-stage ramp preserves the museum palette while keeping
      // luminance monotone in the reviewed scientific quantity.
      const stops =
        normalized < 0.5
          ? { fraction: normalized * 2, from: [7, 15, 35], to: [56, 55, 122] }
          : { fraction: (normalized - 0.5) * 2, from: [56, 55, 122], to: [205, 244, 255] };
      image.data[index * 4] = Math.round(
        stops.from[0]! + (stops.to[0]! - stops.from[0]!) * stops.fraction,
      );
      image.data[index * 4 + 1] = Math.round(
        stops.from[1]! + (stops.to[1]! - stops.from[1]!) * stops.fraction,
      );
      image.data[index * 4 + 2] = Math.round(
        stops.from[2]! + (stops.to[2]! - stops.from[2]!) * stops.fraction,
      );
      image.data[index * 4 + 3] = 255;
    });
    context.putImageData(image, 0, 0);
    canvas.current.dataset.overflow = String(outsideCount);
    setOverflowCount(outsideCount);
  }, [binding, componentId, progress, result]);
  return (
    <>
      <canvas
        ref={canvas}
        className="field-canvas"
        aria-label={`Computed ${componentId} spatial field. ${describeBinding(binding)}. ${
          overflowCount === 0
            ? 'All cells are within the declared scale.'
            : `${overflowCount} cells are outside the declared scale and visibly reported.`
        }`}
      />
      {overflowCount > 0 && (
        <p className="field-overflow" role="status">
          {overflowCount} cells outside [{minimum}, {maximum}]
        </p>
      )}
    </>
  );
}

function resultIndex(result: WorkResult, progress: number) {
  return Math.min(result.times.length - 1, Math.floor(progress * (result.times.length - 1)));
}

function seriesValue(result: WorkResult, id: string, index: number) {
  return result.series.find((series) => series.id === id)?.values[index];
}

function signedFromBaseline(normalized: number, baseline: number) {
  if (normalized >= baseline) {
    return baseline === 1 ? 0 : (normalized - baseline) / (1 - baseline);
  }
  return baseline === 0 ? 0 : (normalized - baseline) / baseline;
}

function SemanticDataError({ message }: { message: string }) {
  return (
    <div className="semantic-data-error" role="alert">
      Scientific layer unavailable: {message}
    </div>
  );
}

function QuantityFluxArtwork({
  work,
  result,
  progress,
  reducedMotion,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
  reducedMotion: boolean;
}) {
  const index = resultIndex(result, progress);
  const quantities = ['a', 'b', 'c', 'collected'] as const;
  const fluxes = ['a-to-b-flux', 'b-to-c-flux', 'c-to-collected-flux'] as const;
  const quantityValues = quantities.map((id) => seriesValue(result, id, index));
  const fluxValues = fluxes.map((id) => seriesValue(result, id, index));
  if (
    quantityValues.some((value) => value === undefined) ||
    fluxValues.some((value) => value === undefined)
  ) {
    return <SemanticDataError message="the reviewed quantity or flux observable is missing" />;
  }
  const quantityBindings = quantities.map((id) => findVisualBinding(work, id, 'area'));
  const fluxBindings = fluxes.map((id) => ({
    stroke: findVisualBinding(work, id, 'stroke-width'),
    events: findVisualBinding(work, id, 'event-frequency'),
  }));
  if (quantityBindings.some((binding) => binding === null)) {
    return <SemanticDataError message="a reviewed quantity-to-area binding is missing" />;
  }
  if (
    fluxBindings.some(
      ({ stroke, events }) =>
        !stroke || !events || events.eventQuantum === undefined || !events.eventAccumulatorRef,
    )
  ) {
    return <SemanticDataError message="a reviewed flux or integrated-event binding is missing" />;
  }
  const xPositions = [140, 380, 620, 860];
  const labels = ['A', 'B', 'C', 'Collected'];
  return (
    <svg viewBox="0 0 1000 600" role="img" aria-label="Computed reaction quantities and fluxes">
      <defs>
        <linearGradient id="quantity-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#32a9cb" stopOpacity="0.5" />
          <stop offset="1" stopColor="#b7f7ff" stopOpacity="0.95" />
        </linearGradient>
        <marker id="flux-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#c7f7ff" />
        </marker>
      </defs>
      {quantities.map((id, quantityIndex) => {
        const value = quantityValues[quantityIndex];
        const binding = quantityBindings[quantityIndex];
        if (value === undefined || !binding) return null;
        const encoded = encodeNumericValue(value, binding);
        const fillHeight = Math.abs(encoded.normalized - (normalizedZero(binding) ?? 0)) * 250;
        const x = xPositions[quantityIndex];
        return (
          <g key={id} className="quantity-vessel">
            <path d={`M${x - 62},180 V455 H${x + 62} V180`} />
            <rect
              className="quantity-fill"
              x={x - 58}
              y={451 - fillHeight}
              width="116"
              height={fillHeight}
            />
            <text x={x} y="495" className="quantity-label">
              {labels[quantityIndex]}
            </text>
            <text x={x} y="526" className="quantity-value">
              {value.toFixed(3)}
            </text>
            {encoded.outsideDomain && (
              <text x={x} y="158" className="overflow-label">
                OUTSIDE SCALE
              </text>
            )}
          </g>
        );
      })}
      {fluxes.map((id, fluxIndex) => {
        const value = fluxValues[fluxIndex];
        const bindings = fluxBindings[fluxIndex];
        if (
          value === undefined ||
          !bindings?.stroke ||
          !bindings.events ||
          bindings.events.eventQuantum === undefined ||
          !bindings.events.eventAccumulatorRef
        ) {
          return null;
        }
        const strokeEncoding = encodeNumericValue(value, bindings.stroke);
        const eventEncoding = encodeNumericValue(value, bindings.events);
        const eventQuantum = bindings.events.eventQuantum;
        const eventAccumulatorRef = bindings.events.eventAccumulatorRef;
        const sourceX = xPositions[fluxIndex];
        const targetX = xPositions[fluxIndex + 1];
        if (sourceX === undefined || targetX === undefined) {
          throw new Error(`Flux layer ${id} has no declared endpoints.`);
        }
        const x1 = sourceX + 72;
        const x2 = targetX - 72;
        const y = 320;
        const width =
          2 + Math.abs(strokeEncoding.normalized - (normalizedZero(bindings.stroke) ?? 0)) * 15;
        const eventActivity = Math.abs(
          eventEncoding.normalized - (normalizedZero(bindings.events) ?? 0),
        );
        const particleCount = value > 0 ? Math.max(1, Math.ceil(eventActivity * 3)) : 0;
        const accumulated = seriesValue(result, eventAccumulatorRef, index);
        if (accumulated === undefined) return null;
        return (
          <g key={id} className="flux-channel">
            <line x1={x1} x2={x2} y1={y} y2={y} strokeWidth={width} markerEnd="url(#flux-arrow)" />
            <text x={(x1 + x2) / 2} y={y - 25}>
              {value.toFixed(3)} / t
            </text>
            {!reducedMotion &&
              Array.from({ length: particleCount }, (_, particleIndex) => {
                const phase =
                  (accumulated / eventQuantum + particleIndex / Math.max(1, particleCount)) % 1;
                return (
                  <circle
                    key={particleIndex}
                    className="flux-particle"
                    cx={x1 + phase * (x2 - x1)}
                    cy={y}
                    r="5"
                  />
                );
              })}
            {(strokeEncoding.outsideDomain || eventEncoding.outsideDomain) && (
              <text x={(x1 + x2) / 2} y={y + 32} className="overflow-label">
                OUTSIDE SCALE
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function PhaseCircleArtwork({
  work,
  result,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
}) {
  const state = result.numerical?.state;
  const index = resultIndex(result, progress);
  if (!state || state.shape[1] !== 12) {
    return <SemanticDataError message="the twelve raw oscillator phases are missing" />;
  }
  const phases = Array.from(
    { length: state.shape[1] },
    (_, coordinate) => state.values[index * state.shape[1] + coordinate],
  );
  const orderReal = seriesValue(result, 'order-real', index);
  const orderImaginary = seriesValue(result, 'order-imaginary', index);
  const coherence = seriesValue(result, 'coherence', index);
  if (
    phases.some((phase) => phase === undefined) ||
    orderReal === undefined ||
    orderImaginary === undefined ||
    coherence === undefined
  ) {
    return <SemanticDataError message="phase state and order-vector observables are misaligned" />;
  }
  const phaseBindings = phases.map((_phase, oscillator) =>
    findVisualBinding(work, `theta-${oscillator + 1}`, 'phase'),
  );
  const coherenceBinding = findVisualBinding(work, 'coherence', 'area');
  const orderXBinding = findVisualBinding(work, 'order-real', 'position-x');
  const orderYBinding = findVisualBinding(work, 'order-imaginary', 'position-y');
  if (
    phaseBindings.some((binding) => binding === null) ||
    !coherenceBinding ||
    !orderXBinding ||
    !orderYBinding
  ) {
    return <SemanticDataError message="a phase, coherence, or order-vector binding is missing" />;
  }
  const coherenceEncoding = encodeNumericValue(coherence, coherenceBinding);
  const orderXEncoding = encodeNumericValue(orderReal, orderXBinding);
  const orderYEncoding = encodeNumericValue(orderImaginary, orderYBinding);
  const coherenceArea = Math.abs(
    coherenceEncoding.normalized - (normalizedZero(coherenceBinding) ?? 0),
  );
  const orderXPosition = signedFromBaseline(
    orderXEncoding.normalized,
    normalizedZero(orderXBinding) ?? 0.5,
  );
  const orderYPosition = signedFromBaseline(
    orderYEncoding.normalized,
    normalizedZero(orderYBinding) ?? 0.5,
  );
  const centerX = 500;
  const centerY = 305;
  const radius = 225;
  return (
    <svg viewBox="0 0 1000 600" role="img" aria-label="Kuramoto oscillator phases and order vector">
      <circle className="phase-ring" cx={centerX} cy={centerY} r={radius} />
      <circle
        className="coherence-area"
        cx={centerX}
        cy={centerY}
        r={Math.sqrt(coherenceArea) * 72}
      />
      <line
        className="order-vector"
        x1={centerX}
        y1={centerY}
        x2={centerX + radius * orderXPosition}
        y2={centerY - radius * orderYPosition}
      />
      {phases.map((phase, oscillator) => {
        const binding = phaseBindings[oscillator];
        if (phase === undefined || !binding) return null;
        const wrapped = encodeNumericValue(phase, binding).normalized * 2 * Math.PI;
        return (
          <g key={oscillator}>
            <circle
              className="phase-oscillator"
              cx={centerX + radius * Math.cos(wrapped)}
              cy={centerY - radius * Math.sin(wrapped)}
              r="10"
            />
            <text
              className="phase-index"
              x={centerX + (radius + 30) * Math.cos(wrapped)}
              y={centerY - (radius + 30) * Math.sin(wrapped)}
            >
              {oscillator + 1}
            </text>
          </g>
        );
      })}
      <text x="500" y="315" className="coherence-label">
        R = {coherence.toFixed(3)}
      </text>
      {(coherenceEncoding.outsideDomain ||
        orderXEncoding.outsideDomain ||
        orderYEncoding.outsideDomain) && (
        <text x="500" y="570" className="overflow-label">
          ORDER PARAMETER OUTSIDE SCALE
        </text>
      )}
    </svg>
  );
}

function ModeEnergyArtwork({
  work,
  result,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
}) {
  const index = resultIndex(result, progress);
  const ids = Array.from({ length: 4 }, (_, mode) => `mode-${mode + 1}-harmonic-energy`);
  const values = ids.map((id) => seriesValue(result, id, index));
  const hamiltonian = seriesValue(result, 'hamiltonian', index);
  const residual = seriesValue(result, 'relative-hamiltonian-residual', index);
  const bindings = ids.map((id) => findVisualBinding(work, id, 'area'));
  if (
    values.some((value) => value === undefined) ||
    hamiltonian === undefined ||
    residual === undefined ||
    bindings.some((binding) => binding === null)
  ) {
    return <SemanticDataError message="modal energies or exact Hamiltonian evidence are missing" />;
  }
  return (
    <svg viewBox="0 0 1000 600" role="img" aria-label="First four FPUT harmonic modal energies">
      {values.map((value, mode) => {
        const binding = bindings[mode];
        if (value === undefined || !binding) return null;
        const encoded = encodeNumericValue(value, binding);
        const height = Math.abs(encoded.normalized - (normalizedZero(binding) ?? 0)) * 340;
        const x = 180 + mode * 210;
        return (
          <g key={ids[mode]} className="mode-energy-column">
            <rect x={x - 65} y="150" width="130" height="340" className="mode-energy-frame" />
            <rect
              x={x - 65}
              y={490 - height}
              width="130"
              height={height}
              className="mode-energy-fill"
            />
            <text x={x} y="530">
              E{mode + 1} = {value.toFixed(4)}
            </text>
            {encoded.outsideDomain && (
              <text x={x} y="130" className="overflow-label">
                OUTSIDE SCALE
              </text>
            )}
          </g>
        );
      })}
      <text x="500" y="78" className="hamiltonian-evidence">
        exact H = {hamiltonian.toFixed(6)} · relative residual {residual.toExponential(2)}
      </text>
    </svg>
  );
}

function TrajectoryArtwork({
  work,
  result,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
}) {
  const pathLayer = visualLayers(work).find(
    (layer) =>
      layer.mark === 'path' &&
      layer.bindings.some((binding) => binding.channel === 'position-x') &&
      layer.bindings.some((binding) => binding.channel === 'position-y'),
  );
  const xBinding = pathLayer?.bindings.find((binding) => binding.channel === 'position-x');
  const yBinding = pathLayer?.bindings.find((binding) => binding.channel === 'position-y');
  if (!pathLayer || !xBinding || !yBinding) {
    return <SemanticDataError message="the primary path lacks reviewed x/y bindings" />;
  }
  const xSeries = result.series.find((series) => series.id === xBinding.quantityRef);
  const ySeries = result.series.find((series) => series.id === yBinding.quantityRef);
  if (
    !xSeries ||
    !ySeries ||
    xSeries.values.length !== result.times.length ||
    ySeries.values.length !== result.times.length
  ) {
    return <SemanticDataError message="the reviewed projection quantities are missing" />;
  }
  const [xMinimum, xMaximum] = numericDomain(xBinding);
  const [yMinimum, yMaximum] = numericDomain(yBinding);
  const xSpan = xMaximum - xMinimum;
  const ySpan = yMaximum - yMinimum;
  const availableWidth = 900;
  const availableHeight = 430;
  const preservesUnits = pathLayer.projection?.aspect !== 'declared-distortion';
  const unitScale = preservesUnits ? Math.min(availableWidth / xSpan, availableHeight / ySpan) : 1;
  const plotWidth = preservesUnits ? xSpan * unitScale : availableWidth;
  const plotHeight = preservesUnits ? ySpan * unitScale : availableHeight;
  const left = 50 + (availableWidth - plotWidth) / 2;
  const bottom = 520 - (availableHeight - plotHeight) / 2;
  const encodings = xSeries.values.map((xValue, index) => {
    const yValue = ySeries.values[index];
    if (yValue === undefined) throw new Error(`Projection y is missing sample ${index}.`);
    return {
      x: encodeNumericValue(xValue, xBinding),
      y: encodeNumericValue(yValue, yBinding),
    };
  });
  const overflowCount = encodings.reduce(
    (count, point) => count + Number(point.x.outsideDomain) + Number(point.y.outsideDomain),
    0,
  );
  const path = encodings
    .map((point, index) => {
      const x = left + point.x.normalized * plotWidth;
      const y = bottom - point.y.normalized * plotHeight;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const pointIndex = resultIndex(result, progress);
  const active = encodings[pointIndex];
  if (!active) return <SemanticDataError message="trajectory cursor is missing" />;
  const activeX = left + active.x.normalized * plotWidth;
  const activeY = bottom - active.y.normalized * plotHeight;
  return (
    <svg
      viewBox="0 0 1000 600"
      role="img"
      aria-label={`${work.title} computed trajectory. ${describeBinding(xBinding)}. ${describeBinding(
        yBinding,
      )}. Projection ${pathLayer.projection?.method ?? 'identity'}, ${
        pathLayer.projection?.aspect ?? 'declared-distortion'
      }.`}
    >
      <defs>
        <linearGradient id="trajectory-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#58dfff" stopOpacity="0.16" />
          <stop offset="0.52" stopColor="#b2f4ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ae8cff" stopOpacity="0.28" />
        </linearGradient>
        <filter id="signal-glow">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <circle className="art-orbit" cx="500" cy="300" r="244" />
      <circle className="art-orbit art-orbit-small" cx="500" cy="300" r="158" />
      <path className="trajectory-glow" d={path} />
      <path className="trajectory-line" d={path} />
      <circle className="active-glow" cx={activeX} cy={activeY} r="22" />
      <circle className="active-point" cx={activeX} cy={activeY} r="6" />
      {overflowCount > 0 && (
        <text x="950" y="560" textAnchor="end" className="overflow-label">
          {overflowCount} coordinates outside declared scale
        </text>
      )}
    </svg>
  );
}

function ScientificArtwork({
  work,
  result,
  progress,
  reducedMotion,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
  reducedMotion: boolean;
}) {
  let primaryImage;
  if (result.field) primaryImage = <FieldCanvas work={work} result={result} progress={progress} />;
  else if (work.kernel === 'reaction-chain') {
    primaryImage = (
      <QuantityFluxArtwork
        work={work}
        result={result}
        progress={progress}
        reducedMotion={reducedMotion}
      />
    );
  } else if (work.kernel === 'kuramoto') {
    primaryImage = <PhaseCircleArtwork work={work} result={result} progress={progress} />;
  } else if (work.kernel === 'fput') {
    primaryImage = <ModeEnergyArtwork work={work} result={result} progress={progress} />;
  } else {
    primaryImage = <TrajectoryArtwork work={work} result={result} progress={progress} />;
  }
  const composition = work.schemaVersion === 2 ? work.portrait.composition : null;
  const compositionStyle = composition
    ? ({
        '--portrait-negative-space': `${Math.round(composition.negativeSpace * 100)}%`,
      } as CSSProperties)
    : undefined;
  return (
    <div
      className={`scientific-artwork render-${work.render}`}
      style={compositionStyle}
      data-camera={composition?.camera ?? 'none'}
      data-focal-layer={composition?.focalLayerId}
      data-atmosphere={composition?.atmosphere?.assetRef}
    >
      <div className="artwork-coordinate artwork-coordinate-a">
        OBSERVATION / {work.runtime.toUpperCase()}
      </div>
      <div className="artwork-coordinate artwork-coordinate-b">
        t = {scientificTimeAt(result, progress).toFixed(2)}
      </div>
      {primaryImage}
      <div className="artwork-title-watermark">{work.title}</div>
    </div>
  );
}

function claimSeries(work: WorkManifest, result: WorkResult) {
  if (work.schemaVersion !== 2) return result.series.slice(0, 5);
  const refs = work.portrait.primaryClaims[0]?.observableIds ?? [];
  const selected = refs
    .map((id) => result.series.find((series) => series.id === id))
    .filter((series): series is Series => series !== undefined);
  return (selected.length > 0 ? selected : result.series).slice(0, 8);
}

function TracePanel({
  work,
  result,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
}) {
  const visibleSeries = claimSeries(work, result).slice(0, 5);
  return (
    <section className="trace-panel" aria-label="Computed time series">
      <svg
        viewBox="0 0 800 130"
        preserveAspectRatio="none"
        role="img"
        aria-label="Synchronized model traces"
      >
        {[1, 2, 3].map((line) => (
          <line
            key={line}
            x1="0"
            x2="800"
            y1={line * 32.5}
            y2={line * 32.5}
            className="trace-grid"
          />
        ))}
        {visibleSeries.map((series) => (
          <path
            key={series.id}
            d={pathForSeries(series)}
            stroke={series.color}
            className="trace-line"
          />
        ))}
        <line x1={progress * 800} x2={progress * 800} y1="0" y2="130" className="trace-cursor" />
      </svg>
      <div className="trace-legend">
        {visibleSeries.map((series) => (
          <span
            key={series.id}
            title={`Secondary evidence trace; independently auto-scaled to [${range(series.values).min}, ${range(series.values).max}]`}
          >
            <i style={{ background: series.color }} />
            {series.label} · auto
          </span>
        ))}
      </div>
    </section>
  );
}

function StudyPanel({
  work,
  result,
  run,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  run: Extract<WorkRunResult, { status: 'valid' }> | null;
  progress: number;
}) {
  const row = Math.min(result.times.length - 1, Math.floor(progress * (result.times.length - 1)));
  const sampledRows = Array.from({ length: 21 }, (_, index) =>
    Math.round((index / 20) * (result.times.length - 1)),
  );
  const currentSample = sampledRows.reduce((closest, candidate) =>
    Math.abs(candidate - row) < Math.abs(closest - row) ? candidate : closest,
  );
  const visibleSeries = claimSeries(work, result);
  const tableValue = (values: number[], sample: number, label: string) => {
    const value = values[sample];
    if (value === undefined) throw new Error(`${label} is missing sample ${sample}.`);
    return value;
  };
  const portrait = work.schemaVersion === 2 ? work.portrait : null;
  const reviewedRegime =
    portrait && run
      ? portrait.parameterRegimes.find((regime) => regime.id === run.portrait.regimeId)
      : undefined;
  const activeClaim =
    portrait && run
      ? portrait.primaryClaims.find((claim) =>
          claim.appliesToRegimeIds.includes(run.portrait.regimeId),
        )
      : undefined;
  const stateCoordinates = portrait
    ? portrait.formal.stateSpace.kind === 'field'
      ? portrait.formal.stateSpace.components
      : portrait.formal.stateSpace.coordinates
    : [];
  const evolution = portrait?.formal.evolution;
  const lawRef = evolution
    ? 'lawRef' in evolution
      ? evolution.lawRef
      : evolution.transitionLawRef
    : '';
  const timeDescription = evolution
    ? evolution.time.kind === 'continuous'
      ? `continuous (${evolution.time.unit})`
      : `discrete (${evolution.time.stepUnit})`
    : '';
  const mappings = portrait ? visualLayers(work) : [];
  return (
    <aside className="study-panel">
      <section>
        <p className="eyebrow">Curator’s note</p>
        <p>{work.summary}</p>
        <blockquote>{work.question}</blockquote>
      </section>
      <section>
        <p className="eyebrow">Model</p>
        <code>{work.equation}</code>
        <small>{result.diagnostics}</small>
      </section>
      {portrait && run && (
        <>
          <section className="science-status">
            <p className="eyebrow">Dynamical portrait</p>
            <div className="science-status-line">
              <strong>{run.portrait.maturityAssessment.attained}</strong>
              <span>{portrait.science.representation.replaceAll('-', ' ')}</span>
            </div>
            <p>
              {run.portrait.regimeId === 'custom-unreviewed'
                ? 'Custom parameters: the numerical run is shown, but no reviewed regime claim is awarded.'
                : activeClaim?.statement}
            </p>
            <small>
              {portrait.formal.character} {portrait.formal.evolution.kind} on a{' '}
              {portrait.formal.stateSpace.kind} state space; reviewed ceiling{' '}
              {portrait.science.reviewedMaturity}
            </small>
          </section>
          <section>
            <p className="eyebrow">Definition</p>
            <dl className="study-definition-list">
              <div>
                <dt>Evolution</dt>
                <dd>
                  {evolution?.kind} · {timeDescription}
                </dd>
              </div>
              <div>
                <dt>Law reference</dt>
                <dd>{lawRef}</dd>
              </div>
              <div>
                <dt>Definition hash</dt>
                <dd>{portrait.definition.expectedHash.value}</dd>
              </div>
              <div>
                <dt>State space</dt>
                <dd>
                  {portrait.formal.stateSpace.kind}
                  {'dimension' in portrait.formal.stateSpace
                    ? `, dimension ${portrait.formal.stateSpace.dimension}`
                    : 'siteCount' in portrait.formal.stateSpace
                      ? `, ${portrait.formal.stateSpace.siteCount} sites`
                      : `, ${portrait.formal.stateSpace.domainDimension}D domain`}
                </dd>
              </div>
              <div>
                <dt>Coordinates</dt>
                <dd>
                  {stateCoordinates.map((coordinate) => (
                    <span key={coordinate.id}>
                      {coordinate.id} [{coordinate.unit || 'dimensionless'}]
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Regime</dt>
                <dd>{reviewedRegime?.id ?? 'custom-unreviewed'}</dd>
              </div>
              {reviewedRegime && (
                <div>
                  <dt>Parameter domain</dt>
                  <dd>
                    {Object.entries(reviewedRegime.parameterDomain).map(([id, domain]) => (
                      <span key={id}>
                        {id}: [{domain[0]}, {domain[1]}]
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section>
            <p className="eyebrow">Numerical provenance</p>
            <dl className="study-definition-list">
              <div>
                <dt>Execution</dt>
                <dd>
                  {run.provenance.execution.kind} · {run.provenance.execution.id} · v
                  {run.provenance.execution.version}
                </dd>
              </div>
              <div>
                <dt>Kernel</dt>
                <dd>
                  {run.provenance.kernel.id} · v{run.provenance.kernel.version} ·{' '}
                  {run.provenance.execution.precision}
                </dd>
              </div>
              <div>
                <dt>Interval</dt>
                <dd>
                  [{run.provenance.interval[0]}, {run.provenance.interval[1]}]
                  {run.provenance.execution.fixedStep !== undefined
                    ? ` · fixed step ${run.provenance.execution.fixedStep}`
                    : ''}
                  {run.provenance.execution.iterations !== undefined
                    ? ` · ${run.provenance.execution.iterations} iterations`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Initial condition</dt>
                <dd>{JSON.stringify(run.provenance.initialCondition)}</dd>
              </div>
              {run.provenance.grid && (
                <div>
                  <dt>Grid</dt>
                  <dd>
                    shape {run.provenance.grid.shape.join(' × ')} · spacing{' '}
                    {run.provenance.grid.spacing.join(' × ')}
                  </dd>
                </div>
              )}
              {run.provenance.boundaryConditions && (
                <div>
                  <dt>Boundary</dt>
                  <dd>
                    {run.provenance.boundaryConditions.map((boundary) => (
                      <span key={`${boundary.axis}-${boundary.kind}`}>
                        {boundary.axis}: {boundary.kind}
                        {boundary.value === undefined ? '' : ` (${boundary.value})`}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {run.provenance.random && (
                <div>
                  <dt>Random process</dt>
                  <dd>
                    {run.provenance.random.algorithm} v{run.provenance.random.version} · seed{' '}
                    {run.provenance.random.seed} · {run.provenance.random.sampleSchedule}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section>
            <p className="eyebrow">Numerical evidence</p>
            <dl className="evidence-list">
              {[...run.hardChecks, ...run.claimAssessments].map((check) => (
                <div key={check.id} data-status={check.status}>
                  <dt>{check.id.replaceAll('-', ' ')}</dt>
                  <dd>
                    {check.status} · {check.message}
                    {check.metrics.map((metric) => (
                      <span className="evidence-metric" key={metric.id}>
                        {metric.id}: {metric.value.toPrecision(6)} {metric.unit ?? ''}
                        {metric.norm ? ` (${metric.norm})` : ''}
                        {metric.tolerance === undefined ? '' : `; tolerance ${metric.tolerance}`}
                        {metric.referenceValue === undefined
                          ? ''
                          : `; reference ${metric.referenceValue}`}
                        {metric.referenceId ? ` [${metric.referenceId}]` : ''}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <p className="eyebrow">Visual encoding</p>
            <ul className="visual-binding-list">
              {mappings.map((layer) => (
                <li key={layer.id}>
                  <strong>
                    {layer.id} · {layer.mark}
                    {layer.id === portrait.composition.focalLayerId ? ' · focal' : ''}
                  </strong>
                  {layer.bindings.map((binding) => (
                    <span key={`${binding.quantityRef}-${binding.channel}`}>
                      {describeBinding(binding)}
                    </span>
                  ))}
                  {layer.projection && (
                    <span>
                      projection: {layer.projection.coordinateRefs.join(' / ')} ·{' '}
                      {layer.projection.method} · {layer.projection.aspect}
                    </span>
                  )}
                  {layer.scientificTime && (
                    <span>
                      time: {layer.scientificTime.quantityRef} · {layer.scientificTime.mode} ·{' '}
                      {layer.scientificTime.interpolation}
                    </span>
                  )}
                  <span>
                    reduced motion: {layer.reducedMotion.strategy}; preserves{' '}
                    {layer.reducedMotion.preserves.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
            <small>
              Composition stages these fixed semantic layers with{' '}
              {Math.round(portrait.composition.negativeSpace * 100)}% negative space and a{' '}
              {portrait.composition.camera} camera. Atmosphere is explicitly non-semantic.
            </small>
          </section>
          <section>
            <p className="eyebrow">Claim limits</p>
            <ul className="claim-limitations">
              {run.portrait.objects[0]?.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
        </>
      )}
      <section>
        <p className="eyebrow">Live data</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>t</th>
                {visibleSeries.map((series) => (
                  <th key={series.id}>{series.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampledRows.map((sample) => (
                <tr key={sample} aria-current={sample === currentSample ? 'true' : undefined}>
                  <td>{tableValue(result.times, sample, 'scientific time').toFixed(3)}</td>
                  {visibleSeries.map((series) => (
                    <td key={series.id}>
                      {tableValue(series.values, sample, series.id).toFixed(4)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <p className="eyebrow">Source</p>
        {work.citations.map((citation) => (
          <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">
            {citation.label} ↗
          </a>
        ))}
      </section>
    </aside>
  );
}

function WorkExperience({
  work,
  initialMode,
  initialPreset,
  onBack,
}: {
  work: WorkManifest;
  initialMode: MuseumMode;
  initialPreset: string;
  onBack: () => void;
}) {
  const initialPresetDefinition =
    work.presets.find((preset) => preset.id === initialPreset) ?? work.presets[0];
  const [mode, setMode] = useState<MuseumMode>(initialMode);
  const [presetId, setPresetId] = useState(initialPresetDefinition?.id ?? 'canonical');
  const [values, setValues] = useState<Record<string, number>>({
    ...(initialPresetDefinition?.values ?? {}),
  });
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const previousTime = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const { result, run, error, status } = useWorkSimulation(work, values);

  useEffect(() => {
    if (!playing || !result || reducedMotion) return;
    let frame = 0;
    const tick = (now: number) => {
      const previous = previousTime.current ?? now;
      previousTime.current = now;
      const elapsed = Math.min(0.05, (now - previous) / 1000);
      setProgress(
        (current) =>
          (current + elapsed / Math.max(6, result.presentationDuration ?? result.duration)) % 1,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      previousTime.current = null;
    };
  }, [playing, reducedMotion, result]);

  const changeMode = (next: MuseumMode) => {
    setMode(next);
    if (next === 'exhibit' && !reducedMotion) setPlaying(true);
    const query = new URLSearchParams(window.location.search);
    query.set('mode', next);
    window.history.replaceState({}, '', `${window.location.pathname}?${query.toString()}`);
  };
  const selectPreset = (id: string) => {
    const preset = work.presets.find((item) => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setValues({ ...preset.values });
    setProgress(0);
    const query = new URLSearchParams(window.location.search);
    query.set('preset', id);
    window.history.replaceState({}, '', `${window.location.pathname}?${query.toString()}`);
  };

  if (!result) {
    return (
      <main className={`work-experience mode-${mode}`} aria-busy={status === 'loading'}>
        <header className="work-header">
          <button type="button" className="back-button" onClick={onBack}>
            ← Collection
          </button>
          <div className="work-identification">
            <span>{galleries.find((gallery) => gallery.id === work.gallery)?.label}</span>
            <strong>{work.title}</strong>
          </div>
        </header>
        <div className="work-stage">
          <section className="work-caption">
            <p className="eyebrow">
              {work.year} · {work.authors.join(' / ')}
            </p>
            <h1>{work.title}</h1>
            <p>{work.subtitle}</p>
          </section>
          <div
            className="simulation-error"
            role={status === 'invalid' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {status === 'invalid'
              ? (error ?? 'The current parameters did not produce a valid numerical result.')
              : 'Computing the current scientific state…'}
            {status === 'invalid' && (
              <button type="button" onClick={() => selectPreset('canonical')}>
                Reset to canonical parameters
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`work-experience mode-${mode}`}>
      <header className="work-header">
        <button type="button" className="back-button" onClick={onBack}>
          ← Collection
        </button>
        <div className="work-identification">
          <span>{galleries.find((gallery) => gallery.id === work.gallery)?.label}</span>
          <strong>{work.title}</strong>
        </div>
        <div className="mode-switcher" role="group" aria-label="Viewing mode">
          {(['observe', 'study', 'exhibit'] as MuseumMode[]).map((item) => (
            <button
              className={mode === item ? 'is-active' : ''}
              type="button"
              key={item}
              aria-pressed={mode === item}
              onClick={() => changeMode(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </header>
      <div className="work-stage">
        <section className="work-caption">
          <p className="eyebrow">
            {work.year} · {work.authors.join(' / ')}
          </p>
          <h1>{work.title}</h1>
          <p>{work.subtitle}</p>
          {work.schemaVersion === 2 && run?.status === 'valid' && (
            <small className="portrait-badge">
              {run.portrait.maturityAssessment.attained} ·{' '}
              {work.portrait.science.representation.replaceAll('-', ' ')}
            </small>
          )}
        </section>
        <ScientificArtwork
          work={work}
          result={result}
          progress={progress}
          reducedMotion={reducedMotion}
        />
        {error && (
          <div className="simulation-error" role="alert">
            {error}
          </div>
        )}
        {mode === 'study' && (
          <StudyPanel
            work={work}
            result={result}
            run={run?.status === 'valid' ? run : null}
            progress={progress}
          />
        )}
      </div>
      <TracePanel work={work} result={result} progress={progress} />
      <section className="work-controls" aria-label="Simulation controls">
        <button
          type="button"
          className="play-control"
          disabled={reducedMotion}
          onClick={() => setPlaying((value) => !value)}
        >
          {reducedMotion ? '◇' : playing ? 'Ⅱ' : '▶'}
          <span>{reducedMotion ? 'Static view' : playing ? 'Pause' : 'Play'}</span>
        </button>
        <label className="timeline-control">
          <span className="sr-only">Time</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={progress}
            onChange={(event) => {
              setProgress(Number(event.target.value));
              setPlaying(false);
            }}
          />
        </label>
        <span className="time-readout">
          {scientificTimeAt(result, progress).toFixed(1)} / {result.duration.toFixed(1)}
        </span>
        <div className="preset-controls" role="group" aria-label="Simulation preset">
          {work.presets.map((preset) => (
            <button
              className={presetId === preset.id ? 'is-active' : ''}
              type="button"
              key={preset.id}
              aria-label={preset.label}
              aria-pressed={presetId === preset.id}
              onClick={() => selectPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>
      <section className="parameter-drawer" aria-label="Model parameters">
        {work.parameters.map((parameter) => {
          const value = values[parameter.id] ?? parameter.default;
          return (
            <label key={parameter.id}>
              <span>
                {parameter.label}
                <i>
                  {parameter.symbol} = {value.toFixed(parameter.step < 0.01 ? 3 : 2)}
                </i>
              </span>
              <input
                type="range"
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                value={value}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    [parameter.id]: Number(event.target.value),
                  }));
                  setPresetId('custom');
                }}
              />
            </label>
          );
        })}
      </section>
    </main>
  );
}

export function MuseumApp() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const selected = route.work ? workBySlug.get(route.work) : undefined;
  const goHome = () => writeRoute(null);
  return (
    <div className="museum-app">
      <div className="museum-ambient" aria-hidden="true">
        <div />
        <i />
        <i />
      </div>
      {!selected && <MuseumHeader onHome={goHome} />}
      {selected ? (
        <WorkExperience
          key={selected.slug}
          work={selected}
          initialMode={route.mode}
          initialPreset={route.preset}
          onBack={goHome}
        />
      ) : (
        <Entrance onSelect={(slug) => writeRoute(slug)} />
      )}
    </div>
  );
}
