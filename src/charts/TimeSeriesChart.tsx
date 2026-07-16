import { useMemo } from 'react';
import { formatAmount, formatTime } from '../lib/formatting/format.ts';
import { useSimulationStore } from '../state/simulation-store.ts';
import { niceScale } from './chart-scale.ts';
import { useSharedCursor } from './shared-cursor.ts';
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

const W = 420;
const H = 172;
const M = { l: 42, r: 14, t: 10, b: 22 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

/**
 * Shared line-chart base for quantities and rates. Renders from trajectory
 * series only; the playback and hover cursors are synchronized across all
 * instances via the store.
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

  const valueAt = (s: ChartSeries, t: number) => {
    const idx = Math.min(s.values.length - 1, Math.round((t / duration) * (s.values.length - 1)));
    return s.values[idx];
  };

  const hover = hoverTime !== null ? hoverTime : null;

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="t-label">{title}</span>
        <span className="chart-legend" role="list">
          {series.map((s) => (
            <span key={s.id} className="chart-legend-item" role="listitem">
              <svg width="14" height="6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="14"
                  y2="3"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray={s.dashed ? '3 3' : undefined}
                />
              </svg>
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-plot"
        role="img"
        aria-label={`${title} over time, in ${unit}`}
        {...cursor}
      >
        {scale.ticks.map((tv) => (
          <g key={tv}>
            <line
              className={tv === 0 ? 'chart-zero' : 'chart-grid'}
              x1={M.l}
              x2={M.l + PW}
              y1={y(tv)}
              y2={y(tv)}
            />
            <text className="chart-tick t-num" x={M.l - 6} y={y(tv) + 3} textAnchor="end">
              {formatAmount(tv, Math.abs(scale.max) < 2 ? 1 : 0)}
            </text>
          </g>
        ))}
        {Array.from({ length: Math.floor(duration / 10) + 1 }, (_, i) => i * 10).map((tv) => (
          <text
            key={tv}
            className="chart-tick t-num"
            x={x(tv)}
            y={M.t + PH + 14}
            textAnchor="middle"
          >
            {tv}
          </text>
        ))}
        {series.map((s, i) => (
          <path
            key={s.id}
            d={paths[i]}
            fill="none"
            stroke={s.color}
            strokeWidth={emphasis === s.id ? 3 : 2}
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
      </svg>
      {/* readout row: hover preview wins over playback time */}
      <div className="chart-readout t-num" data-testid={`readout-${title.toLowerCase()}`}>
        <span className="chart-readout-time">{formatTime(hover ?? time)}</span>
        {series.map((s) => (
          <span key={s.id} className="chart-readout-item">
            <i className="chart-chip" style={{ background: s.color }} aria-hidden="true" />
            <span className="chart-readout-label">{s.label}</span>{' '}
            {formatAmount(valueAt(s, hover ?? time))}
          </span>
        ))}
      </div>
    </figure>
  );
}
