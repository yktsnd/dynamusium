import { describe, expect, it } from 'vitest';
import {
  AnalyticFieldSolverError,
  simulateBudykoSellers,
  simulateFixedBoundaryWave,
  simulateFreeGaussianSchrodinger,
  simulatePeriodicHeat,
  type AnalyticFieldSolverResult,
} from '../../src/museum/runtimes/analytic-field-solvers.ts';

function evidence(result: AnalyticFieldSolverResult, id: string) {
  const found = result.evidence.find((item) => item.id === id);
  if (found === undefined) throw new Error(`missing evidence: ${id}`);
  return found;
}

function summary(result: AnalyticFieldSolverResult, id: string): Float64Array {
  const found = result.summaries.find((item) => item.id === id);
  if (found === undefined) throw new Error(`missing summary: ${id}`);
  return found.values;
}

function component(
  result: AnalyticFieldSolverResult,
  frameIndex: number,
  id: string,
): Float64Array {
  const frame = result.frames[frameIndex];
  if (frame === undefined) throw new Error(`missing frame ${frameIndex}`);
  const found = frame.components[id];
  if (found === undefined) throw new Error(`missing component: ${id}`);
  return found;
}

function expectStructuredResult(result: AnalyticFieldSolverResult, componentIds: string[]) {
  expect(result.frames.length).toBeGreaterThanOrEqual(2);
  expect(result.times.length).toBe(result.frames.length);
  expect(result.coordinates.x.length).toBe(result.metadata.grid.width);
  expect(result.coordinates.y.length).toBe(result.metadata.grid.height);
  expect(result.metadata.provenance.sourceUrl).toMatch(/^https:\/\//);
  expect(evidence(result, 'finite-components').status).toBe('passed');
  for (let frameIndex = 0; frameIndex < result.frames.length; frameIndex += 1) {
    const frame = result.frames[frameIndex];
    expect(frame?.time).toBe(result.times[frameIndex]);
    for (const id of componentIds) {
      const values = frame?.components[id];
      expect(values?.length).toBe(result.metadata.grid.width * result.metadata.grid.height);
      expect(Array.from(values ?? []).every(Number.isFinite)).toBe(true);
    }
  }
  for (const series of result.summaries) {
    expect(series.values.length).toBe(result.times.length);
    expect(Array.from(series.values).every(Number.isFinite)).toBe(true);
  }
}

describe('fixed-boundary exact wave mode', () => {
  it('satisfies the fixed boundary and exchanges energy without drift', () => {
    const speed = 1.2;
    const modeX = 2;
    const modeY = 1;
    const angularFrequency = speed * Math.PI * Math.hypot(modeX, modeY);
    const period = (2 * Math.PI) / angularFrequency;
    const result = simulateFixedBoundaryWave({
      width: 49,
      height: 33,
      speed,
      modeX,
      modeY,
      duration: period,
      snapshotCount: 5,
    });

    expectStructuredResult(result, ['displacement', 'velocity']);
    expect(result.metadata.boundary).toBe('fixed-dirichlet-x-y');
    expect(evidence(result, 'fixed-boundary-residual').status).toBe('passed');
    expect(evidence(result, 'energy-residual').status).toBe('passed');
    expect(evidence(result, 'grid-refinement-pde-residual').status).toBe('passed');
    const totalEnergy = summary(result, 'total-energy');
    for (const value of totalEnergy) expect(value).toBeCloseTo(totalEnergy[0], 12);
    expect(summary(result, 'rms-displacement')[1]).toBeLessThan(1e-14);
    expect(summary(result, 'kinetic-energy')[1]).toBeCloseTo(totalEnergy[0], 12);
  });

  it('returns large finite physical values without display clamping', () => {
    const result = simulateFixedBoundaryWave({
      width: 33,
      height: 33,
      modeX: 1,
      modeY: 1,
      amplitude: 2_000_000,
      duration: 0.1,
      snapshotCount: 2,
    });
    const first = component(result, 0, 'displacement');
    expect(Math.max(...first)).toBeCloseTo(2_000_000, 6);
  });
});

describe('periodic exact Fourier heat evolution', () => {
  it('preserves the zero mode and applies the exact modal decay rate', () => {
    const diffusivity = 0.2;
    const amplitude = 3;
    const meanTemperature = 2;
    const duration = 2;
    const result = simulatePeriodicHeat({
      width: 48,
      height: 32,
      diffusivity,
      meanTemperature,
      duration,
      snapshotCount: 3,
      modes: [{ amplitude, waveNumberX: 1, waveNumberY: 0 }],
    });

    expectStructuredResult(result, ['temperature']);
    expect(result.metadata.boundary).toBe('periodic-x-y');
    expect(evidence(result, 'mean-temperature-residual').status).toBe('passed');
    expect(evidence(result, 'variance-increase').status).toBe('passed');
    expect(evidence(result, 'grid-refinement-pde-residual').status).toBe('passed');
    for (const value of summary(result, 'mean-temperature')) {
      expect(value).toBeCloseTo(meanTemperature, 12);
    }
    const finalAtOrigin = component(result, 2, 'temperature')[0];
    expect(finalAtOrigin).toBeCloseTo(
      meanTemperature + amplitude * Math.exp(-diffusivity * duration),
      12,
    );
    const variances = summary(result, 'variance-temperature');
    expect(variances[2]).toBeLessThan(variances[1]);
    expect(variances[1]).toBeLessThan(variances[0]);
  });
});

describe('free exact Gaussian Schrodinger packet', () => {
  it('translates and disperses while separating full norm from display truncation', () => {
    const result = simulateFreeGaussianSchrodinger({
      width: 65,
      height: 49,
      xMin: -8,
      xMax: 8,
      yMin: -6,
      yMax: 6,
      packetWidth: 1,
      centerX: -2,
      momentumX: 1,
      duration: 2,
      snapshotCount: 3,
    });

    expectStructuredResult(result, ['real', 'imaginary', 'probabilityDensity']);
    expect(result.metadata.boundary).toBe('open-domain-truncated-for-display');
    expect(evidence(result, 'full-space-norm-residual').value).toBe(0);
    expect(evidence(result, 'density-identity-residual').status).toBe('passed');
    expect(evidence(result, 'grid-refinement-interpolation-error').status).toBe('passed');
    expect(evidence(result, 'display-quadrature-residual').status).toBe('passed');
    const norms = summary(result, 'sampled-domain-norm');
    const losses = summary(result, 'analytic-truncation-loss');
    for (let index = 0; index < norms.length; index += 1) {
      expect(norms[index] + losses[index]).toBeCloseTo(1, 5);
    }
    expect(summary(result, 'sampled-mean-x')[2]).toBeCloseTo(0, 4);
    expect(summary(result, 'analytic-packet-width')[2]).toBeGreaterThan(
      summary(result, 'analytic-packet-width')[0],
    );
  });
});

describe('Budyko-Sellers zonal energy-balance relaxation', () => {
  it('relaxes the uniform linear case to its exact radiative equilibrium', () => {
    const meanSolarFlux = 340;
    const albedo = 0.3;
    const outgoingIntercept = 203.3;
    const outgoingSlope = 2.09;
    const expectedEquilibrium = (meanSolarFlux * (1 - albedo) - outgoingIntercept) / outgoingSlope;
    const result = simulateBudykoSellers({
      latitudeCells: 32,
      meanSolarFlux,
      insolationP2: 0,
      outgoingIntercept,
      outgoingSlope,
      warmAlbedo: albedo,
      coldAlbedo: albedo,
      heatCapacity: 10,
      dtYears: 0.5,
      steps: 240,
      snapshotCount: 5,
      equilibriumTolerance: 1e-6,
      initialCondition: { kind: 'uniform', temperature: -20 },
    });

    expectStructuredResult(result, ['temperature']);
    expect(result.metadata.boundary).toBe('no-flux-in-sin-latitude');
    expect(evidence(result, 'equilibrium-residual').status).toBe('passed');
    expect(evidence(result, 'transport-integral-residual').status).toBe('passed');
    expect(evidence(result, 'no-flux-boundary-residual').value).toBe(0);
    expect(evidence(result, 'grid-refinement-profile-rms').value).toBeLessThan(1e-10);
    expect(evidence(result, 'grid-refinement-profile-rms').status).toBe('passed');
    expect(evidence(result, 'grid-refinement-profile-rms').tolerance).toBe(1);
    const final = component(result, result.frames.length - 1, 'temperature');
    for (const value of final) expect(value).toBeCloseTo(expectedEquilibrium, 6);
    expect(result.times.at(-1)).toBe(120);
  });

  it('keeps the scientific state zonal while the feedback profile relaxes', () => {
    const result = simulateBudykoSellers({
      latitudeCells: 32,
      dtYears: 0.25,
      steps: 400,
      snapshotCount: 4,
    });

    expectStructuredResult(result, ['temperature']);
    const final = component(result, result.frames.length - 1, 'temperature');
    expect(result.metadata.grid.width).toBe(1);
    expect(result.metadata.grid.height).toBe(32);
    expect(final).toHaveLength(32);
    const imbalance = summary(result, 'maximum-energy-imbalance');
    expect(imbalance.at(-1)).toBeLessThan(imbalance[0]);
    expect(evidence(result, 'grid-refinement-profile-rms').value).toBeGreaterThanOrEqual(0);
  });
});

describe('analytic field input and browser-budget honesty', () => {
  it('rejects non-finite inputs, unresolved modes, and oversized runs', () => {
    const cases: Array<() => unknown> = [
      () => simulateFixedBoundaryWave({ amplitude: Number.NaN }),
      () =>
        simulatePeriodicHeat({
          width: 16,
          height: 16,
          modes: [{ amplitude: 1, waveNumberX: 5, waveNumberY: 0 }],
        }),
      () => simulateFreeGaussianSchrodinger({ momentumX: Number.POSITIVE_INFINITY }),
      () => simulateBudykoSellers({ solarScale: Number.NaN }),
    ];

    for (const run of cases) {
      expect(run).toThrow(AnalyticFieldSolverError);
    }
    expect(() => simulateFreeGaussianSchrodinger({ width: 129, height: 129 })).toThrowError(
      expect.objectContaining({ kind: 'budget' }),
    );
    expect(() => simulateBudykoSellers({ latitudeCells: 128, steps: 20_000 })).toThrowError(
      expect.objectContaining({ kind: 'budget' }),
    );
  });
});
