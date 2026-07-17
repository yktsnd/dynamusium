import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatAmount } from '../lib/formatting/format.ts';
import { useSimulationStore } from '../state/simulation-store.ts';
import { niceScale } from './chart-scale.ts';
import { useSharedCursor } from './shared-cursor.ts';
import {
  TRACE_LEFT_MARGIN,
  TRACE_NOMINAL_W,
  TRACE_READOUT_WIDTH,
  TRACE_RIGHT_GAP,
} from './trace-layout.ts';
import './charts.css';

export interface ChartSeries {
  id: string;
  label: string;
  /** CSS color (design-token var). */
  color: string;
  dashed?: boolean;
  values: Float64Array;
}

interface Props {
  title: string;
  unit: string;
  series: ChartSeries[];
  duration: number;
  /** Force the y domain to include zero (rates cross it; quantities start there). */
  includeZero?: boolean;
  /** Emphasized series id (e.g. the selected process). */
  emphasis?: string | null;
}

const W = TRACE_NOMINAL_W;
const H = 172;
const M = { l: TRACE_LEFT_MARGIN, r: TRACE_READOUT_WIDTH + TRACE_RIGHT_GAP, t: 16, b: 14 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const READOUT_MIN_GAP_PX = 20;

/** Clamp to a valid sample index — `t` may transiently sit a hair outside
 * [0, duration] (e.g. a browser's first rAF timestamp preceding its own
 * wall-clock reference); never let that reach an SVG coordinate as NaN. */
function sampleIndex(t: number, len: number, duration: number): number {
  return Math.min(len - 1, Math.max(0, Math.round((t / duration) * (len - 1))));
}

/**
 * Sort series by their natural y and nudge apart any rows closer than
 * `minGap`, keeping the whole block inside [top, bottom]: a forward pass
 * pushes crowded rows down, a backward pass pulls the block back up if that
 * push ran past the bottom edge, and — only when there are more rows than
 * the strip has room for — a final even distribution across the full range
 * as a last resort (rows end up closer than minGap, never overlapping the
 * bounds or reporting a coordinate outside them).
 */
function layoutReadoutRows(
  items: { id: string; y: number }[],
  minGap: number,
  bounds: { top: number; bottom: number },
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const n = sorted.length;
  const out = new Map<string, number>();
  if (n === 0) return out;

  const positioned = sorted.map((it) => Math.min(bounds.bottom, Math.max(bounds.top, it.y)));
  for (let i = 1; i < n; i++) {
    if (positioned[i] < positioned[i - 1] + minGap) positioned[i] = positioned[i - 1] + minGap;
  }
  if (positioned[n - 1] > bounds.bottom) {
    positioned[n - 1] = bounds.bottom;
    for (let i = n - 2; i >= 0; i--) {
      if (positioned[i] > positioned[i + 1] - minGap) positioned[i] = positioned[i + 1] - minGap;
    }
  }
  if (positioned[0] < bounds.top) {
    const step = n > 1 ? (bounds.bottom - bounds.top) / (n - 1) : 0;
    for (let i = 0; i < n; i++) positioned[i] = bounds.top + i * step;
  }
  sorted.forEach((it, i) => out.set(it.id, positioned[i]));
  return out;
}

/**
 * Shared line-chart base for quantities and rates. Renders from trajectory
 * series only; the playback and hover cursors are synchronized across all
 * instances via the store.
 *
 * The SVG stretches to its container independently on x and y
 * (`preserveAspectRatio="none"`, see trace-layout.ts) so its left/right
 * margins line up with the time-axis scrubber below. That non-uniform
 * stretch would distort glyph shapes if text were sized directly in
 * viewBox units, so all <text> is nested in a group with an inverse
 * vertical correction (`corr`) measured from the rendered box, keeping
 * labels legible at any strip height.
 */
export function TimeSeriesChart({
  title,
  unit,
  series,
  duration,
  includeZero = true,
  emphasis = null,
}: Props) {
  const time = useSimulationStore((s) => s.time);
  const hoverTime = useSimulationStore((s) => s.hoverTime);
  const cursor = useSharedCursor(duration, M.l, PW);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [{ corr, sy }, setFit] = useState({ corr: 1, sy: 1 });

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const sx = rect.width / W;
        const rectSy = rect.height / H;
        setFit({ corr: sx / rectSy, sy: rectSy });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => {
    let min = includeZero ? 0 : Infinity;
    let max = includeZero ? 0 : -Infinity;
    for (const s of series)
      for (let i = 0; i < s.values.length; i++) {
        if (s.values[i] < min) min = s.values[i];
        if (s.values[i] > max) max = s.values[i];
      }
    return niceScale(min, max);
  }, [series, includeZero]);

  const x = (t: number) => M.l + (t / duration) * PW;
  const y = (v: number) => M.t + PH - ((v - scale.min) / (scale.max - scale.min)) * PH;
  /** Pre-divide a small local offset for use inside a `scale(1, corr)` text group. */
  const cy = (dy: number) => dy / corr;

  const paths = useMemo(() => {
    const px = (t: number) => M.l + (t / duration) * PW;
    const py = (v: number) => M.t + PH - ((v - scale.min) / (scale.max - scale.min)) * PH;
    return series.map((s) => {
      const n = s.values.length;
      const stride = Math.max(1, Math.floor(n / 340));
      const pts: string[] = [];
      for (let i = 0; i < n; i += stride)
        pts.push(`${px((i / (n - 1)) * duration).toFixed(1)},${py(s.values[i]).toFixed(2)}`);
      pts.push(`${px(duration).toFixed(1)},${py(s.values[n - 1]).toFixed(2)}`);
      return `M ${pts.join(' L ')}`;
    });
  }, [series, duration, scale]);

  const valueAt = (s: ChartSeries, t: number) =>
    s.values[sampleIndex(t, s.values.length, duration)];

  const hover = hoverTime !== null ? hoverTime : null;
  const activeTime = hover ?? time;

  const readoutRows = useMemo(() => {
    const py = (v: number) => M.t + PH - ((v - scale.min) / (scale.max - scale.min)) * PH;
    const valAt = (s: ChartSeries) => s.values[sampleIndex(activeTime, s.values.length, duration)];
    const minGap = sy > 0 ? READOUT_MIN_GAP_PX / sy : READOUT_MIN_GAP_PX;
    const bounds = { top: M.t + 4, bottom: M.t + PH - 2 };
    const positioned = layoutReadoutRows(
      series.map((s) => ({ id: s.id, y: py(valAt(s)) })),
      minGap,
      bounds,
    );
    return series.map((s) => ({
      series: s,
      value: valAt(s),
      y: positioned.get(s.id) ?? py(valAt(s)),
    }));
  }, [series, activeTime, duration, scale, sy]);

  const readoutX = M.l + PW + TRACE_RIGHT_GAP;

  return (
    <div className="chart-strip">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="chart-plot"
        role="img"
        aria-label={`${title} over time, in ${unit}`}
        {...cursor}
      >
        <line className="chart-grid" x1={M.l} x2={M.l + PW} y1={M.t} y2={M.t} />
        {scale.ticks
          .filter((tv) => tv === 0)
          .map((tv) => (
            <line key={tv} className="chart-zero" x1={M.l} x2={M.l + PW} y1={y(tv)} y2={y(tv)} />
          ))}
        {series.map((s, i) => (
          <path
            key={s.id}
            d={paths[i]}
            fill="none"
            stroke={s.color}
            strokeWidth={emphasis === s.id ? 3 : 1.5}
            strokeDasharray={s.dashed ? '4 4' : undefined}
            opacity={emphasis && emphasis !== s.id ? 0.35 : 1}
          />
        ))}
        {/* playback cursor */}
        <line className="chart-cursor" x1={x(time)} x2={x(time)} y1={M.t} y2={M.t + PH} />
        {hover !== null && (
          <g>
            <line
              className="chart-hover-cursor"
              x1={x(hover)}
              x2={x(hover)}
              y1={M.t}
              y2={M.t + PH}
            />
            {series.map((s) => (
              <circle
                key={s.id}
                cx={x(hover)}
                cy={y(valueAt(s, hover))}
                r={3.5}
                fill={s.color}
                stroke="var(--bg)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        )}
        {scale.ticks.map((tv) => (
          <g key={tv} transform={`translate(${M.l - 6} ${y(tv)}) scale(1 ${corr})`}>
            <text className="chart-tick t-num" x={0} y={cy(3)} textAnchor="end">
              {formatAmount(tv, Math.abs(scale.max) < 2 ? 1 : 0)}
            </text>
          </g>
        ))}
        {/* right-edge readout column: symbol + current value, always visible */}
        <g data-testid={`readout-${title.toLowerCase()}`}>
          {readoutRows.map(({ series: s, value, y: ry }) => (
            <g key={s.id}>
              <rect x={readoutX} y={ry - 1} width={8} height={2} fill={s.color} />
              <g transform={`translate(${readoutX + 12} ${ry}) scale(1 ${corr})`}>
                <text className="chart-readout-label t-num" x={0} y={cy(3)}>
                  {s.label}
                </text>
              </g>
              <g transform={`translate(${readoutX + TRACE_READOUT_WIDTH} ${ry}) scale(1 ${corr})`}>
                <text className="chart-readout-value t-num" x={0} y={cy(3)} textAnchor="end">
                  {formatAmount(value)}
                </text>
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
