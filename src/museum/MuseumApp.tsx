import { useEffect, useRef, useState } from 'react';
import { galleries, workBySlug, works } from './catalog.ts';
import type { GalleryId, MuseumMode, Series, WorkManifest, WorkResult } from './types.ts';
import { useWorkSimulation } from './useWorkSimulation.ts';

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
              <span className="runtime-label">{work.runtime.replace('-v1', '')}</span>
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

function FieldCanvas({ result }: { result: WorkResult }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !result.field) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const { columns, rows, values } = result.field;
    canvas.current.width = columns;
    canvas.current.height = rows;
    const image = context.createImageData(columns, rows);
    values.forEach((value, index) => {
      const cyan = Math.round(30 + value * 210);
      const violet = Math.round(30 + (1 - Math.abs(value - 0.55)) * 90);
      image.data[index * 4] = Math.round(4 + value * violet);
      image.data[index * 4 + 1] = Math.round(12 + value * cyan * 0.75);
      image.data[index * 4 + 2] = cyan;
      image.data[index * 4 + 3] = 255;
    });
    context.putImageData(image, 0, 0);
  }, [result]);
  return <canvas ref={canvas} className="field-canvas" aria-label="Computed spatial field" />;
}

function ScientificArtwork({
  work,
  result,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
}) {
  const pointRangeX = range(result.points.map((point) => point.x));
  const pointRangeY = range(result.points.map((point) => point.y));
  const path = result.points
    .map((point, index) => {
      const x = 50 + ((point.x - pointRangeX.min) / pointRangeX.span) * 900;
      const y = 520 - ((point.y - pointRangeY.min) / pointRangeY.span) * 430;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const pointIndex = Math.min(
    result.points.length - 1,
    Math.floor(progress * (result.points.length - 1)),
  );
  const active = result.points[pointIndex] ?? { x: 0, y: 0 };
  const activeX = 50 + ((active.x - pointRangeX.min) / pointRangeX.span) * 900;
  const activeY = 520 - ((active.y - pointRangeY.min) / pointRangeY.span) * 430;

  return (
    <div className={`scientific-artwork render-${work.render}`}>
      <div className="artwork-coordinate artwork-coordinate-a">
        OBSERVATION / {work.runtime.toUpperCase()}
      </div>
      <div className="artwork-coordinate artwork-coordinate-b">
        t = {(progress * result.duration).toFixed(2)}
      </div>
      {result.field ? (
        <FieldCanvas result={result} />
      ) : (
        <svg viewBox="0 0 1000 600" role="img" aria-label={`${work.title} computed trajectory`}>
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
        </svg>
      )}
      <div className="artwork-title-watermark">{work.title}</div>
    </div>
  );
}

function TracePanel({ result, progress }: { result: WorkResult; progress: number }) {
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
        {result.series.slice(0, 5).map((series) => (
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
        {result.series.slice(0, 5).map((series) => (
          <span key={series.id}>
            <i style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function StudyPanel({
  work,
  result,
  progress,
}: {
  work: WorkManifest;
  result: WorkResult;
  progress: number;
}) {
  const row = Math.min(result.times.length - 1, Math.floor(progress * (result.times.length - 1)));
  const sampledRows = Array.from({ length: 21 }, (_, index) =>
    Math.round((index / 20) * (result.times.length - 1)),
  );
  const currentSample = sampledRows.reduce((closest, candidate) =>
    Math.abs(candidate - row) < Math.abs(closest - row) ? candidate : closest,
  );
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
      <section>
        <p className="eyebrow">Live data</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>t</th>
                {result.series.map((series) => (
                  <th key={series.id}>{series.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampledRows.map((sample) => (
                <tr key={sample} aria-current={sample === currentSample ? 'true' : undefined}>
                  <td>{(result.times[sample] ?? 0).toFixed(3)}</td>
                  {result.series.map((series) => (
                    <td key={series.id}>{(series.values[sample] ?? 0).toFixed(4)}</td>
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
  const { result, error } = useWorkSimulation(work, values);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (now: number) => {
      const previous = previousTime.current ?? now;
      previousTime.current = now;
      const elapsed = Math.min(0.05, (now - previous) / 1000);
      setProgress((current) => (current + elapsed / Math.max(6, result.duration)) % 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      previousTime.current = null;
    };
  }, [playing, result.duration]);

  const changeMode = (next: MuseumMode) => {
    setMode(next);
    if (next === 'exhibit') setPlaying(true);
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
        </section>
        <ScientificArtwork work={work} result={result} progress={progress} />
        {error && (
          <div className="simulation-error" role="alert">
            {error}
          </div>
        )}
        {mode === 'study' && <StudyPanel work={work} result={result} progress={progress} />}
      </div>
      <TracePanel result={result} progress={progress} />
      <section className="work-controls" aria-label="Simulation controls">
        <button
          type="button"
          className="play-control"
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? 'Ⅱ' : '▶'}
          <span>{playing ? 'Pause' : 'Play'}</span>
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
          {(progress * result.duration).toFixed(1)} / {result.duration.toFixed(1)}
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
