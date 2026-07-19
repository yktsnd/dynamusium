import { describe, expect, it } from 'vitest';
import {
  CollectiveKernelError,
  simulateFput,
  simulateKuramoto,
  type CollectiveKernelCheck,
  type CollectiveKernelResult,
  type CollectiveObservable,
} from '../../src/museum/runtimes/collective-kernels.ts';

function observable(result: CollectiveKernelResult, id: string): CollectiveObservable {
  const found = result.observables.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing observable: ${id}`);
  return found;
}

function check(result: CollectiveKernelResult, id: string): CollectiveKernelCheck {
  const found = result.checks.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing check: ${id}`);
  return found;
}

function metric(result: CollectiveKernelResult, checkId: string, metricId: string): number {
  const found = check(result, checkId).metrics.find((candidate) => candidate.id === metricId);
  if (found === undefined) throw new Error(`missing metric: ${checkId}/${metricId}`);
  return found.value;
}

function endpoint(result: CollectiveKernelResult): Float64Array {
  const [samples, dimension] = result.stateShape;
  return result.rawState.slice((samples - 1) * dimension, samples * dimension);
}

function linfDistance(left: Float64Array, right: Float64Array): number {
  expect(left.length).toBe(right.length);
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  }
  return maximum;
}

function maximumAbsolute(values: Float64Array): number {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, Math.abs(value));
  return maximum;
}

function expectFiniteStructuredResult(result: CollectiveKernelResult) {
  const [samples, dimension] = result.stateShape;
  expect(samples).toBe(result.times.length);
  expect(result.rawState.length).toBe(samples * dimension);
  expect(Array.from(result.times).every(Number.isFinite)).toBe(true);
  expect(Array.from(result.rawState).every(Number.isFinite)).toBe(true);
  for (const item of result.observables) {
    expect(Array.from(item.values).every(Number.isFinite)).toBe(true);
  }
  expect(result.provenance.reproducibility).toBe('bitwise-deterministic');
  expect(result).not.toHaveProperty('points');
  expect(result).not.toHaveProperty('field');
}

describe('12-oscillator Kuramoto kernel', () => {
  it('keeps every unwrapped phase as raw state and derives the order vector from it', () => {
    const result = simulateKuramoto({ duration: 4, dt: 0.02 });

    expectFiniteStructuredResult(result);
    expect(result.stateShape).toEqual([201, 12]);
    expect(result.provenance.state.components).toHaveLength(12);
    expect(result.provenance.execution.method).toBe('classical-rk4-fixed-step');
    const real = observable(result, 'order-real').values;
    const imaginary = observable(result, 'order-imaginary').values;
    const coherence = observable(result, 'coherence').values;
    expect(real).toHaveLength(result.times.length);
    for (let sample = 0; sample < result.times.length; sample += 1) {
      expect(coherence[sample]).toBeCloseTo(Math.hypot(real[sample], imaginary[sample]), 14);
      expect(coherence[sample]).toBeGreaterThanOrEqual(0);
      expect(coherence[sample]).toBeLessThanOrEqual(1 + 1e-12);
    }
    expect(check(result, 'coherence-bound').status).toBe('passed');
    expect(observable(result, 'mean-frequencies').values).toHaveLength(12);
    expect(observable(result, 'locking-residuals').values).toHaveLength(12);
    expect(result.provenance.analysisWindow).toEqual([2, 4]);
  });

  it('replays the complete trajectory and evidence bit for bit', () => {
    const options = { coupling: 1.35, spread: 1.1, duration: 6, dt: 0.02 };
    expect(simulateKuramoto(options)).toEqual(simulateKuramoto(options));
  });

  it('emits a locking claim only when latter-half mean-frequency evidence passes', () => {
    const locked = simulateKuramoto({
      coupling: 1.8,
      spread: 0.8,
      duration: 24,
      dt: 1 / 30,
      lockingTolerance: 1e-3,
    });
    const uncoupled = simulateKuramoto({
      coupling: 0,
      spread: 0.8,
      duration: 24,
      dt: 1 / 30,
      lockingTolerance: 1e-3,
    });

    expect(check(locked, 'frequency-locking')).toMatchObject({
      status: 'passed',
      severity: 'claim',
    });
    expect(check(locked, 'frequency-locking').claim).toBeTruthy();
    expect(metric(locked, 'frequency-locking', 'mean-frequency-spread')).toBeLessThanOrEqual(1e-3);
    expect(check(uncoupled, 'frequency-locking')).toMatchObject({
      status: 'failed',
      severity: 'claim',
    });
    expect(check(uncoupled, 'frequency-locking')).not.toHaveProperty('claim');
    expect(metric(uncoupled, 'frequency-locking', 'mean-frequency-spread')).toBeGreaterThan(0.7);
    const naturalFrequencies = observable(uncoupled, 'natural-frequencies').values;
    const observedFrequencies = observable(uncoupled, 'mean-frequencies').values;
    for (let oscillator = 0; oscillator < 12; oscillator += 1) {
      expect(observedFrequencies[oscillator]).toBeCloseTo(naturalFrequencies[oscillator], 13);
    }
  });

  it('shows fourth-order endpoint refinement under step halving', () => {
    const scientificInputs = { coupling: 1.2, spread: 1.3, duration: 4 };
    const coarse = simulateKuramoto({ ...scientificInputs, dt: 0.2 });
    const fine = simulateKuramoto({ ...scientificInputs, dt: 0.1 });
    const reference = simulateKuramoto({ ...scientificInputs, dt: 0.025 });
    const coarseError = linfDistance(endpoint(coarse), endpoint(reference));
    const fineError = linfDistance(endpoint(fine), endpoint(reference));

    expect(fineError).toBeLessThan(coarseError * 0.2);
  });
});

describe('fixed-end alpha-FPUT kernel', () => {
  it('returns q/p raw state, modal Q/P/energies, exact H, and a bounded residual', () => {
    const result = simulateFput({ duration: 40, dt: 0.02, alpha: 0.25, amplitude: 0.8 });

    expectFiniteStructuredResult(result);
    expect(result.stateShape).toEqual([2001, 16]);
    expect(result.provenance.execution.method).toBe('velocity-verlet');
    expect(result.provenance.boundary).toContain('fixed endpoints');
    for (let mode = 1; mode <= 8; mode += 1) {
      expect(observable(result, `mode-${mode}-coordinate`).values).toHaveLength(2001);
      expect(observable(result, `mode-${mode}-momentum`).values).toHaveLength(2001);
      expect(observable(result, `mode-${mode}-harmonic-energy`).values).toHaveLength(2001);
    }
    expect(observable(result, 'hamiltonian').values).toHaveLength(2001);
    expect(observable(result, 'nonlinear-interaction-energy').values).toHaveLength(2001);
    expect(observable(result, 'first-mode-recurrence-distance').values[0]).toBe(0);
    expect(check(result, 'energy-residual').status).toBe('passed');
    expect(metric(result, 'energy-residual', 'maximum-relative-hamiltonian-residual')).toBeLessThan(
      5e-4,
    );
    expect(check(result, 'first-mode-recurrence').status).toBe('failed');
    expect(check(result, 'first-mode-recurrence')).not.toHaveProperty('claim');
  });

  it('replays raw state, observables, provenance, and checks bit for bit', () => {
    const options = { alpha: 0.4, amplitude: 0.7, duration: 8, dt: 0.02 };
    expect(simulateFput(options)).toEqual(simulateFput(options));
  });

  it('matches the harmonic alpha=0 modal decomposition', () => {
    const result = simulateFput({ alpha: 0, amplitude: 0.8, duration: 20, dt: 0.02 });
    const hamiltonian = observable(result, 'hamiltonian').values;
    const harmonicSum = observable(result, 'harmonic-energy-sum').values;
    const interaction = observable(result, 'nonlinear-interaction-energy').values;

    for (let sample = 0; sample < result.times.length; sample += 1) {
      expect(harmonicSum[sample]).toBeCloseTo(hamiltonian[sample], 12);
    }
    expect(maximumAbsolute(interaction)).toBeLessThan(1e-12);
    for (let mode = 2; mode <= 8; mode += 1) {
      expect(
        maximumAbsolute(observable(result, `mode-${mode}-harmonic-energy`).values),
      ).toBeLessThan(1e-24);
    }
  });

  it('shows second-order state and Hamiltonian-residual refinement', () => {
    const scientificInputs = { alpha: 0.4, amplitude: 0.9, duration: 6 };
    const coarse = simulateFput({ ...scientificInputs, dt: 0.08 });
    const fine = simulateFput({ ...scientificInputs, dt: 0.04 });
    const reference = simulateFput({ ...scientificInputs, dt: 0.01 });
    const coarseError = linfDistance(endpoint(coarse), endpoint(reference));
    const fineError = linfDistance(endpoint(fine), endpoint(reference));
    const coarseEnergyResidual = metric(
      coarse,
      'energy-residual',
      'maximum-relative-hamiltonian-residual',
    );
    const fineEnergyResidual = metric(
      fine,
      'energy-residual',
      'maximum-relative-hamiltonian-residual',
    );

    expect(fineError).toBeLessThan(coarseError * 0.35);
    expect(fineEnergyResidual).toBeLessThan(coarseEnergyResidual * 0.35);
  });

  it('attaches a recurrence claim only after resolved departure and return', () => {
    const result = simulateFput({ alpha: 1, amplitude: 0.8, duration: 240, dt: 0.02 });
    const recurrence = check(result, 'first-mode-recurrence');

    expect(recurrence.status).toBe('passed');
    expect(recurrence.claim).toBeTruthy();
    expect(metric(result, 'first-mode-recurrence', 'maximum-first-mode-departure')).toBeGreaterThan(
      0.8,
    );
    expect(metric(result, 'first-mode-recurrence', 'best-return-after-departure')).toBeLessThan(
      0.05,
    );
  });
});

describe('collective-kernel numerical safety and browser budget', () => {
  it('rejects non-finite scientific inputs without substituting fallback values', () => {
    const runs: Array<() => unknown> = [
      () => simulateKuramoto({ coupling: Number.NaN }),
      () => simulateKuramoto({ initialPhases: Array(12).fill(Number.POSITIVE_INFINITY) }),
      () => simulateFput({ alpha: Number.NEGATIVE_INFINITY }),
      () => simulateFput({ amplitude: Number.NaN }),
    ];

    for (const run of runs) {
      expect(run).toThrow(CollectiveKernelError);
    }
  });

  it('rejects nonintegral schedules and runs beyond the fixed output/compute budget', () => {
    expect(() => simulateKuramoto({ duration: 1, dt: 0.3 })).toThrowError(
      expect.objectContaining({ kind: 'invalid-input' }),
    );
    expect(() => simulateFput({ duration: 500.01, dt: 0.01 })).toThrowError(
      expect.objectContaining({ kind: 'budget-exceeded' }),
    );
  });
});
