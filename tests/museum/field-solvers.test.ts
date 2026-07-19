import { describe, expect, it } from 'vitest';
import {
  FieldSolverError,
  simulateCahnHilliard,
  simulateGrayScott,
  simulateIsing,
  simulateLinearRotatingShallowWater,
  type FieldSolverResult,
} from '../../src/museum/runtimes/field-solvers.ts';

function evidence(result: FieldSolverResult, id: string) {
  const found = result.evidence.find((item) => item.id === id);
  if (found === undefined) throw new Error(`missing evidence: ${id}`);
  return found;
}

function summary(result: FieldSolverResult, id: string): Float64Array {
  const found = result.summaries.find((item) => item.id === id);
  if (found === undefined) throw new Error(`missing summary: ${id}`);
  return found.values;
}

function component(
  result: FieldSolverResult,
  frameIndex: number,
  id: string,
): Float64Array | Int8Array {
  const frame = result.frames[frameIndex];
  if (frame === undefined) throw new Error(`missing frame ${frameIndex}`);
  const found = frame.components[id];
  if (found === undefined) throw new Error(`missing component: ${id}`);
  return found;
}

function expectStructuredResult(result: FieldSolverResult, componentIds: string[]) {
  expect(result.frames.length).toBeGreaterThanOrEqual(2);
  expect(result.times.length).toBe(result.frames.length);
  expect(result.metadata.boundary).toBe('periodic-x-y');
  expect(['bitwise-deterministic', 'seeded-replay']).toContain(result.metadata.reproducibility);
  expect(result.evidence.length).toBeGreaterThan(0);
  for (let frameIndex = 0; frameIndex < result.frames.length; frameIndex += 1) {
    const frame = result.frames[frameIndex];
    expect(frame?.time).toBe(result.times[frameIndex]);
    for (const id of componentIds) {
      expect(frame?.components[id]?.length).toBe(
        result.metadata.grid.width * result.metadata.grid.height,
      );
    }
  }
  for (const series of result.summaries) {
    expect(series.values.length).toBe(result.times.length);
    expect(Array.from(series.values).every(Number.isFinite)).toBe(true);
  }
}

describe('Gray-Scott reaction-diffusion runtime', () => {
  it('preserves the exact homogeneous steady state u=1, v=0', () => {
    const result = simulateGrayScott({
      width: 16,
      height: 16,
      dt: 0.5,
      steps: 24,
      snapshotCount: 4,
      initialCondition: { kind: 'uniform', u: 1, v: 0 },
    });

    expectStructuredResult(result, ['u', 'v']);
    expect(result.metadata.solverId).toBe('gray-scott');
    expect(Array.from(component(result, result.frames.length - 1, 'u')).every((x) => x === 1)).toBe(
      true,
    );
    expect(Array.from(component(result, result.frames.length - 1, 'v')).every((x) => x === 0)).toBe(
      true,
    );
    expect(Array.from(summary(result, 'mean-u')).every((x) => x === 1)).toBe(true);
    expect(Array.from(summary(result, 'mean-v')).every((x) => x === 0)).toBe(true);
    expect(evidence(result, 'diffusion-cfl').status).toBe('passed');
    expect(evidence(result, 'minimum-concentration').value).toBe(0);
  });

  it('rejects a diffusion CFL violation rather than returning a field', () => {
    expect(() =>
      simulateGrayScott({
        width: 16,
        height: 16,
        diffusionU: 1,
        diffusionV: 1,
        dt: 1,
        steps: 2,
        snapshotCount: 2,
      }),
    ).toThrowError(expect.objectContaining({ kind: 'stability-limit' }));
  });

  it('treats the reviewed seed width as a physical length and records it', () => {
    const initialCondition = {
      kind: 'central-square' as const,
      halfWidth: 3,
      uInside: 0.5,
      vInside: 0.25,
      uOutside: 1,
      vOutside: 0,
    };
    const fine = simulateGrayScott({
      width: 24,
      height: 16,
      dx: 1,
      dy: 1,
      steps: 1,
      snapshotCount: 2,
      initialCondition,
    });
    const coarse = simulateGrayScott({
      width: 12,
      height: 8,
      dx: 2,
      dy: 2,
      steps: 1,
      snapshotCount: 2,
      initialCondition,
    });

    const fineSeedCells = Array.from(component(fine, 0, 'v')).filter((value) => value > 0).length;
    const coarseSeedCells = Array.from(component(coarse, 0, 'v')).filter(
      (value) => value > 0,
    ).length;
    expect(fineSeedCells).toBe(49);
    expect(coarseSeedCells).toBe(9);
    expect(fine.metadata.parameters.initialCondition).toBe(JSON.stringify(initialCondition));
    expect(coarse.metadata.parameters.initialCondition).toBe(JSON.stringify(initialCondition));
  });
});

describe('Cahn-Hilliard mass-conserving runtime', () => {
  it('conserves the periodic-domain integral without post-step correction', () => {
    const result = simulateCahnHilliard({
      width: 16,
      height: 16,
      dt: 0.004,
      steps: 160,
      snapshotCount: 5,
      initialCondition: {
        kind: 'cosine-modes',
        mean: 0.17,
        amplitude: 0.025,
        modeX: 2,
        modeY: 3,
      },
    });

    expectStructuredResult(result, ['phi']);
    const mass = evidence(result, 'mass-residual');
    expect(mass.status).toBe('passed');
    expect(mass.value).toBeLessThanOrEqual(mass.tolerance ?? 0);
    const means = summary(result, 'mean-phi');
    for (const mean of means) expect(mean).toBeCloseTo(0.17, 12);
    const energies = summary(result, 'free-energy');
    expect(energies.at(-1)).toBeLessThanOrEqual((energies[0] ?? 0) + 1e-12);
  });

  it('keeps a homogeneous chemical potential exactly stationary', () => {
    const result = simulateCahnHilliard({
      width: 12,
      height: 12,
      dt: 0.005,
      steps: 20,
      snapshotCount: 3,
      initialCondition: { kind: 'uniform', value: 0.25 },
    });

    expect(
      Array.from(component(result, result.frames.length - 1, 'phi')).every(
        (value) => value === 0.25,
      ),
    ).toBe(true);
    expect(result.metadata.parameters.initialCondition).toBe(
      JSON.stringify({ kind: 'uniform', value: 0.25 }),
    );
  });

  it('rejects an explicit fourth-order stability-limit violation', () => {
    expect(() =>
      simulateCahnHilliard({
        width: 16,
        height: 16,
        dt: 0.1,
        steps: 2,
        snapshotCount: 2,
      }),
    ).toThrowError(expect.objectContaining({ kind: 'stability-limit' }));
  });
});

describe('seeded two-dimensional Ising runtime', () => {
  it('replays every Metropolis frame and summary exactly for the same seed', () => {
    const options = {
      seed: 0x5eed1234,
      width: 16,
      height: 16,
      temperature: 2.2,
      sweeps: 24,
      snapshotCount: 5,
      initialState: 'random' as const,
    };
    const first = simulateIsing(options);
    const second = simulateIsing(options);

    expectStructuredResult(first, ['spin']);
    expect(first.metadata.temporal.unit).toBe('sweep');
    expect(first.metadata.dynamics).toBe('stochastic');
    expect(first.metadata.reproducibility).toBe('seeded-replay');
    expect(first.metadata.parameters.seed).toBe(options.seed);
    expect(first.times).toEqual(second.times);
    expect(first.summaries).toEqual(second.summaries);
    for (let index = 0; index < first.frames.length; index += 1) {
      expect(component(first, index, 'spin')).toEqual(component(second, index, 'spin'));
    }
  });

  it('leaves the all-up ferromagnetic ground state invariant at zero temperature', () => {
    const result = simulateIsing({
      seed: 17,
      width: 12,
      height: 12,
      temperature: 0,
      coupling: 1,
      field: 0,
      sweeps: 12,
      snapshotCount: 4,
      initialState: 'up',
    });

    expect(
      Array.from(component(result, result.frames.length - 1, 'spin')).every((spin) => spin === 1),
    ).toBe(true);
    expect(Array.from(summary(result, 'magnetization')).every((value) => value === 1)).toBe(true);
    expect(Array.from(summary(result, 'energy')).every((value) => value === -2)).toBe(true);
    expect(Array.from(summary(result, 'acceptance')).every((value) => value === 0)).toBe(true);
  });
});

describe('linear rotating shallow-water runtime', () => {
  it('conserves surface-height mass on the declared periodic boundary', () => {
    const result = simulateLinearRotatingShallowWater({
      width: 16,
      height: 16,
      dt: 0.05,
      steps: 120,
      snapshotCount: 5,
      initialCondition: { kind: 'cosine-height', amplitude: 0.04, modeX: 1, modeY: 2 },
    });

    expectStructuredResult(result, ['surface-height', 'u', 'v']);
    const mass = evidence(result, 'mass-residual');
    expect(mass.status).toBe('passed');
    expect(mass.value).toBeLessThanOrEqual(mass.tolerance ?? 0);
    for (const mean of summary(result, 'mean-surface-height')) {
      expect(Math.abs(mean)).toBeLessThan(1e-12);
    }
    expect(evidence(result, 'relative-energy-drift').value).toBeLessThan(1e-6);
  });

  it('matches the analytic spatially uniform inertial oscillation', () => {
    const coriolis = 0.7;
    const dt = 0.01;
    const steps = 100;
    const result = simulateLinearRotatingShallowWater({
      width: 8,
      height: 8,
      coriolis,
      dt,
      steps,
      snapshotCount: 2,
      initialCondition: { kind: 'uniform-flow', surfaceHeight: 0, u: 1, v: 0 },
    });
    const finalU = component(result, 1, 'u');
    const finalV = component(result, 1, 'v');
    const time = dt * steps;

    for (let index = 0; index < finalU.length; index += 1) {
      expect(finalU[index]).toBeCloseTo(Math.cos(coriolis * time), 9);
      expect(finalV[index]).toBeCloseTo(-Math.sin(coriolis * time), 9);
    }
    expect(result.metadata.parameters.initialCondition).toBe(
      JSON.stringify({ kind: 'uniform-flow', surfaceHeight: 0, u: 1, v: 0 }),
    );
  });

  it('rejects an RK4 wave CFL violation', () => {
    expect(() =>
      simulateLinearRotatingShallowWater({
        width: 8,
        height: 8,
        dt: 2,
        steps: 2,
        snapshotCount: 2,
      }),
    ).toThrowError(expect.objectContaining({ kind: 'stability-limit' }));
  });
});

describe('field solver input honesty', () => {
  it('throws structured errors for non-finite scientific inputs', () => {
    const cases: Array<() => unknown> = [
      () => simulateGrayScott({ feed: Number.NaN }),
      () => simulateCahnHilliard({ mobility: Number.POSITIVE_INFINITY }),
      () => simulateIsing({ seed: 1, temperature: Number.NaN }),
      () => simulateLinearRotatingShallowWater({ coriolis: Number.NEGATIVE_INFINITY }),
    ];

    for (const run of cases) {
      try {
        run();
        throw new Error('expected solver to reject non-finite input');
      } catch (error) {
        expect(error).toBeInstanceOf(FieldSolverError);
        expect((error as FieldSolverError).kind).toBe('invalid-input');
      }
    }
  });

  it('rejects runs that exceed the fixed browser work or snapshot budget', () => {
    expect(() =>
      simulateGrayScott({ width: 128, height: 128, steps: 1000, snapshotCount: 2 }),
    ).toThrowError(expect.objectContaining({ kind: 'invalid-input' }));
    expect(() => simulateIsing({ seed: 1, sweeps: 40, snapshotCount: 33 })).toThrowError(
      expect.objectContaining({ kind: 'invalid-input' }),
    );
  });
});
