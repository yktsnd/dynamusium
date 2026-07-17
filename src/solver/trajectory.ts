import type { Frame, ProcessRates } from '../model/schema.ts';

/**
 * A fully computed simulation result. Immutable after integration: playback,
 * scrubbing, and rendering only ever read from it.
 */
export interface Trajectory {
  duration: number;
  dt: number;
  /** Frame times, uniform spacing `dt`, length N. */
  times: Float64Array;
  /** Per species (model order): quantity series of length N. */
  quantities: Float64Array[];
  /** Cumulative reservoir output, length N, nondecreasing. */
  reservoir: Float64Array;
  /** Per process (model order): forward / reverse / net series of length N. */
  rates: { forward: Float64Array; reverse: Float64Array; net: Float64Array }[];
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/**
 * Linearly interpolated system state at time t (clamped to [0, duration]).
 */
export function frameAt(traj: Trajectory, t: number): Frame {
  const clamped = Math.min(traj.duration, Math.max(0, t));
  const pos = clamped / traj.dt;
  const i0 = Math.min(traj.times.length - 1, Math.floor(pos));
  const i1 = Math.min(traj.times.length - 1, i0 + 1);
  const u = i1 === i0 ? 0 : pos - i0;

  const rates: ProcessRates[] = traj.rates.map((r) => ({
    forward: lerp(r.forward[i0], r.forward[i1], u),
    reverse: lerp(r.reverse[i0], r.reverse[i1], u),
    net: lerp(r.net[i0], r.net[i1], u),
  }));

  return {
    time: clamped,
    quantities: traj.quantities.map((q) => lerp(q[i0], q[i1], u)),
    reservoir: lerp(traj.reservoir[i0], traj.reservoir[i1], u),
    rates,
  };
}

/** Maximum value across one or more series (for chart/visual scaling). */
export function seriesMax(series: Float64Array[]): number {
  let max = 0;
  for (const s of series) for (let i = 0; i < s.length; i++) if (s[i] > max) max = s[i];
  return max;
}
