import { compileSystem } from '../model/equations.ts';
import type { InputProfile, ModelDefinition, ParameterValues, SpeciesId } from '../model/schema.ts';
import { NONNEGATIVE_TOLERANCE } from './numerical-tolerance.ts';
import { createRk4Scratch, rk4Step } from './rk4.ts';
import type { Diagnostics, NumericalError, SimulationResult } from './simulation-result.ts';
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
 * Deterministic: identical inputs always produce identical results.
 *
 * Numerical safety: a value below zero by at most NONNEGATIVE_TOLERANCE is
 * corrected to zero and counted; a larger negative value, a non-finite
 * value, or a reservoir decrease beyond the tolerance aborts integration
 * and returns an `invalid` result with diagnostics — it is never clamped
 * away and never yields a playable trajectory.
 */
export function integrate(opts: IntegrateOptions): SimulationResult {
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
  const diagnostics: Diagnostics = {
    smallClampCount: 0,
    reservoirCorrectionCount: 0,
    stepsCompleted: 0,
  };

  const stateIdOf = (i: number) =>
    i === system.reservoirIndex ? 'reservoir' : model.species[i].id;

  const invalid = (error: NumericalError): SimulationResult => ({
    status: 'invalid',
    error,
    diagnostics,
  });

  const record = (frame: number, t: number) => {
    times[frame] = t;
    for (let i = 0; i < nSpecies; i++) quantities[i][frame] = y[i];
    reservoir[frame] = y[system.reservoirIndex];
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
    const prevReservoir = y[system.reservoirIndex];
    rk4Step(system.derivatives, t, y, dt, scratch);
    const tNow = step * dt;

    for (let i = 0; i < system.size; i++) {
      if (!Number.isFinite(y[i])) {
        return invalid({
          kind: 'non-finite',
          message: `State "${stateIdOf(i)}" became non-finite at t = ${tNow.toFixed(3)} s.`,
          time: tNow,
          step,
          stateIndex: i,
          stateId: stateIdOf(i),
          value: y[i],
          tolerance: NONNEGATIVE_TOLERANCE,
        });
      }
      if (y[i] < 0) {
        if (y[i] < -NONNEGATIVE_TOLERANCE) {
          return invalid({
            kind: 'negative-quantity',
            message: `Quantity "${stateIdOf(i)}" went negative (${y[i].toExponential(3)}) at t = ${tNow.toFixed(3)} s, beyond tolerance.`,
            time: tNow,
            step,
            stateIndex: i,
            stateId: stateIdOf(i),
            value: y[i],
            tolerance: NONNEGATIVE_TOLERANCE,
          });
        }
        y[i] = 0;
        diagnostics.smallClampCount++;
      }
    }

    // Cumulative output must not decrease. Correct floating-point noise
    // within tolerance; report anything larger instead of hiding it.
    const cur = y[system.reservoirIndex];
    if (cur < prevReservoir) {
      const decrease = prevReservoir - cur;
      if (decrease > NONNEGATIVE_TOLERANCE) {
        return invalid({
          kind: 'reservoir-decrease',
          message: `Cumulative output decreased by ${decrease.toExponential(3)} at t = ${tNow.toFixed(3)} s, beyond tolerance.`,
          time: tNow,
          step,
          stateIndex: system.reservoirIndex,
          stateId: 'reservoir',
          value: cur,
          tolerance: NONNEGATIVE_TOLERANCE,
        });
      }
      y[system.reservoirIndex] = prevReservoir;
      diagnostics.reservoirCorrectionCount++;
    }

    diagnostics.stepsCompleted = step;
    record(step, tNow);
  }

  const trajectory: Trajectory = { duration, dt, times, quantities, reservoir, rates };
  return { status: 'valid', trajectory, diagnostics };
}
