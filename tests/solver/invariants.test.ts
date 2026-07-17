import { describe, expect, it } from 'vitest';
import { demonstrationModel } from '../../src/model/demonstration-model.ts';
import type { ParameterValues } from '../../src/model/schema.ts';
import { defaultParameterValues } from '../../src/model/validation.ts';
import { presets } from '../../src/features/presets/presets.ts';
import { integrate, type IntegrateOptions } from '../../src/solver/integrate.ts';
import { frameAt } from '../../src/solver/trajectory.ts';
import type { Trajectory } from '../../src/solver/trajectory.ts';
import {
  MASS_BALANCE_RELATIVE_TOLERANCE,
  MONOTONICITY_TOLERANCE,
} from '../../src/solver/numerical-tolerance.ts';

function integrateValid(opts: IntegrateOptions): Trajectory {
  const r = integrate(opts);
  if (r.status !== 'valid') throw new Error('expected valid: ' + r.error.message);
  return r.trajectory;
}

const abIndex = demonstrationModel.processes.findIndex((p) => p.id === 'ab');

function totalSpeciesMass(quantities: Float64Array[], frame: number): number {
  let sum = 0;
  for (const series of quantities) sum += series[frame];
  return sum;
}

describe('mass balance (closed system)', () => {
  it('conserves total species mass when there is no feed and no drain', () => {
    const params = { ...defaultParameterValues(demonstrationModel), kout: 0 };
    const traj = integrateValid({
      model: demonstrationModel,
      params,
      profile: { kind: 'none' },
      initialOverrides: { a: 5, b: 0.2, c: 0 },
    });

    const initialTotal = 5 + 0.2 + 0;
    for (let frame = 0; frame < traj.times.length; frame += 100) {
      const total = totalSpeciesMass(traj.quantities, frame);
      const relativeError = Math.abs(total - initialTotal) / initialTotal;
      expect(relativeError).toBeLessThanOrEqual(MASS_BALANCE_RELATIVE_TOLERANCE);
    }
  });
});

describe('cumulative output monotonicity', () => {
  it('never lets the reservoir series decrease under a constant feed', () => {
    const traj = integrateValid({
      model: demonstrationModel,
      params: defaultParameterValues(demonstrationModel),
      profile: { kind: 'constant', rate: 0.8 },
    });

    for (let i = 1; i < traj.reservoir.length; i++) {
      expect(traj.reservoir[i]).toBeGreaterThanOrEqual(
        traj.reservoir[i - 1] - MONOTONICITY_TOLERANCE,
      );
    }
  });
});

describe('nonnegative trajectories across presets', () => {
  for (const preset of presets) {
    it(`keeps every quantity and the reservoir nonnegative for preset "${preset.id}"`, () => {
      const params = {
        ...defaultParameterValues(demonstrationModel),
        ...preset.paramOverrides,
      } as ParameterValues;
      const initialOverrides = { ...preset.initialOverrides };
      const result = integrate({
        model: demonstrationModel,
        params,
        profile: structuredClone(preset.profile),
        initialOverrides,
      });

      expect(result.status).toBe('valid');
      if (result.status !== 'valid') throw new Error('expected valid: ' + result.error.message);
      expect(result.diagnostics.smallClampCount).toBe(0);
      const traj = result.trajectory;
      for (const series of traj.quantities) {
        for (let i = 0; i < series.length; i++) {
          expect(series[i]).toBeGreaterThanOrEqual(0);
        }
      }
      for (let i = 0; i < traj.reservoir.length; i++) {
        expect(traj.reservoir[i]).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe('deterministic repeatability', () => {
  it('produces bitwise-identical output for identical inputs', () => {
    const opts = {
      model: demonstrationModel,
      params: defaultParameterValues(demonstrationModel),
      profile: { kind: 'constant' as const, rate: 0.8 },
      initialOverrides: { a: 5, b: 0.2, c: 0 },
    };
    const traj1 = integrateValid(opts);
    const traj2 = integrateValid(opts);

    expect(Array.from(traj1.quantities[0])).toEqual(Array.from(traj2.quantities[0]));
    expect(Array.from(traj1.quantities[1])).toEqual(Array.from(traj2.quantities[1]));
    expect(Array.from(traj1.reservoir)).toEqual(Array.from(traj2.reservoir));
    expect(Array.from(traj1.rates[abIndex].net)).toEqual(Array.from(traj2.rates[abIndex].net));
  });
});

describe('forward/reverse rate correctness', () => {
  it('computes A<->B forward and reverse rates from mass-action kinetics at t=0', () => {
    const params = { ...defaultParameterValues(demonstrationModel), kout: 0 };
    const traj = integrateValid({
      model: demonstrationModel,
      params,
      profile: { kind: 'none' },
      initialOverrides: { a: 5, b: 0.2, c: 0 },
    });

    const rates = traj.rates[abIndex];
    expect(rates.forward[0]).toBeCloseTo(0.5 * 5, 12);
    expect(rates.reverse[0]).toBeCloseTo(0.2 * 0.2, 12);
    expect(rates.net[0]).toBeCloseTo(rates.forward[0] - rates.reverse[0], 12);
  });

  it('gives a negative net rate when the reverse reaction dominates', () => {
    const params = { ...defaultParameterValues(demonstrationModel), kout: 0 };
    const traj = integrateValid({
      model: demonstrationModel,
      params,
      profile: { kind: 'none' },
      initialOverrides: { a: 0, b: 5, c: 0 },
    });

    expect(traj.rates[abIndex].net[0]).toBeLessThan(0);
  });
});

describe('mass balance (open system)', () => {
  it('accumulates species plus reservoir mass equal to the fed integral', () => {
    const params = defaultParameterValues(demonstrationModel);
    const rate = 0.8;
    const traj = integrateValid({
      model: demonstrationModel,
      params,
      profile: { kind: 'constant', rate },
    });

    const initialTotal = demonstrationModel.species.reduce((sum, s) => sum + s.initial, 0);
    const lastFrame = traj.times.length - 1;
    const finalTotal = totalSpeciesMass(traj.quantities, lastFrame) + traj.reservoir[lastFrame];
    const duration = traj.times[lastFrame];

    expect(finalTotal).toBeCloseTo(initialTotal + rate * duration, 6);
  });
});

describe('frameAt interpolation', () => {
  const traj = integrateValid({
    model: demonstrationModel,
    params: defaultParameterValues(demonstrationModel),
    profile: { kind: 'constant', rate: 0.8 },
  });

  it('matches the underlying series exactly at a frame time', () => {
    const index = 10;
    const t = index * traj.dt;
    const frame = frameAt(traj, t);
    expect(frame.time).toBeCloseTo(t, 12);
    for (let s = 0; s < traj.quantities.length; s++) {
      expect(frame.quantities[s]).toBeCloseTo(traj.quantities[s][index], 12);
    }
    expect(frame.reservoir).toBeCloseTo(traj.reservoir[index], 12);
  });

  it('interpolates strictly between neighboring frames', () => {
    const index = 10;
    const t = (index + 0.5) * traj.dt;
    const frame = frameAt(traj, t);
    for (let s = 0; s < traj.quantities.length; s++) {
      const lo = Math.min(traj.quantities[s][index], traj.quantities[s][index + 1]);
      const hi = Math.max(traj.quantities[s][index], traj.quantities[s][index + 1]);
      expect(frame.quantities[s]).toBeGreaterThanOrEqual(lo);
      expect(frame.quantities[s]).toBeLessThanOrEqual(hi);
    }
  });

  it('clamps negative times to the start of the trajectory', () => {
    const frame = frameAt(traj, -5);
    expect(frame.time).toBe(0);
    for (let s = 0; s < traj.quantities.length; s++) {
      expect(frame.quantities[s]).toBe(traj.quantities[s][0]);
    }
  });

  it('clamps times past the end to the last frame', () => {
    const lastFrame = traj.times.length - 1;
    const frame = frameAt(traj, traj.duration + 1000);
    expect(frame.time).toBe(traj.duration);
    for (let s = 0; s < traj.quantities.length; s++) {
      expect(frame.quantities[s]).toBe(traj.quantities[s][lastFrame]);
    }
  });
});
