import { compileSystem } from '../model/equations.ts';
import type { InputProfile, ModelDefinition, ParameterValues, SpeciesId } from '../model/schema.ts';
import { NONNEGATIVE_TOLERANCE } from './numerical-tolerance.ts';
import { createRk4Scratch, rk4Step } from './rk4.ts';
import type { Trajectory } from './trajectory.ts';

export interface IntegrateOptions {
  model: ModelDefinition;
  params: ParameterValues;
  profile: InputProfile;
  initialOverrides?: Partial<Record<SpeciesId, number>>;
  /** Override the model's simulation config (e.g. per preset). */
  duration?: number;
}

/**
 * Integrate the model ODE system with fixed-step RK4 and record every step.
 *
 * Deterministic: identical inputs always produce identical output arrays.
 * Small negative excursions within NONNEGATIVE_TOLERANCE are clamped to zero
 * after each step; larger ones are clamped too but indicate a step-size
 * problem and are counted in `clampViolations`.
 */
export function integrate(opts: IntegrateOptions): Trajectory & { clampViolations: number } {
  const { model, params, profile } = opts;
  const duration = opts.duration ?? model.config.duration;
  const dt = model.config.dt;
  const steps = Math.round(duration / dt);
  const frames = steps + 1;

  const system = compileSystem(model, params, profile, opts.initialOverrides ?? {});
  const nSpecies = model.species.length;

  const times = new Float64Array(frames);
  const quantities = model.species.map(() => new Float64Array(frames));
  const reservoir = new Float64Array(frames);
  const rates = model.processes.map(() => ({
    forward: new Float64Array(frames),
    reverse: new Float64Array(frames),
    net: new Float64Array(frames),
  }));

  const y = Float64Array.from(system.initialState);
  const scratch = createRk4Scratch(system.size);
  let clampViolations = 0;

  const record = (frame: number, t: number) => {
    times[frame] = t;
    for (let i = 0; i < nSpecies; i++) quantities[i][frame] = y[i];
    // Guard against interpolation/rounding making the cumulative series dip.
    reservoir[frame] =
      frame === 0
        ? y[system.reservoirIndex]
        : Math.max(reservoir[frame - 1], y[system.reservoirIndex]);
    const r = system.ratesAt(t, y);
    for (let p = 0; p < r.length; p++) {
      rates[p].forward[frame] = r[p].forward;
      rates[p].reverse[frame] = r[p].reverse;
      rates[p].net[frame] = r[p].net;
    }
  };

  record(0, 0);
  for (let step = 1; step < frames; step++) {
    // Recompute t from the step index to avoid floating-point drift.
    const t = (step - 1) * dt;
    rk4Step(system.derivatives, t, y, dt, scratch);
    for (let i = 0; i < system.size; i++) {
      if (y[i] < 0) {
        if (y[i] < -NONNEGATIVE_TOLERANCE) clampViolations++;
        y[i] = 0;
      }
    }
    record(step, step * dt);
  }

  return { duration, dt, times, quantities, reservoir, rates, clampViolations };
}
