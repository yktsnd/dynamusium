import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { works } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';
import { hodgkinHuxleyAlphaRates, rk4, simulateWork } from '../../src/museum/simulation.ts';
import { useWorkSimulation } from '../../src/museum/useWorkSimulation.ts';
import type { WorkManifest } from '../../src/museum/types.ts';

function work(slug: string): WorkManifest {
  const found = works.find((candidate) => candidate.slug === slug);
  if (!found) throw new Error(`Missing test work ${slug}.`);
  return found;
}

describe('museum numerical safety', () => {
  it('rejects derivative dimension mismatches instead of filling missing entries with zero', () => {
    expect(() => rk4([1, 2], 1, () => [0], 1)).toThrow(/dimension 1; expected 2/);
  });

  it('rejects non-finite derivatives and intermediate RK4 stages', () => {
    expect(() => rk4([1], 1, () => [Number.NaN], 1)).toThrow(/k1 derivative\[0\] is non-finite/);
    expect(() => rk4([Number.MAX_VALUE], 1, () => [Number.MAX_VALUE], 1)).toThrow(
      /stage.*non-finite/,
    );
  });

  it('rejects a detected between-sample event before accepting the RK4 state', () => {
    expect(() =>
      rk4(
        [0],
        1,
        () => [1],
        1,
        (_previous, next) => {
          if ((next[0] ?? 0) >= 1) throw new Error('declared crossing event');
        },
      ),
    ).toThrow(/declared crossing event/);
  });

  it('preserves large finite states instead of clamping them to one million', () => {
    const initial = 2_000_000;
    const solved = rk4([initial], 1, () => [0], 1);
    expect(solved.states.at(-1)?.[0]).toBe(initial);

    const result = simulateWork(work('kepler-orbit'), { axis: initial });
    expect(Math.max(...result.series[0].values)).toBeGreaterThan(1_000_000);
  });

  it('rejects non-finite and unstable field inputs before display normalization can hide them', () => {
    expect(() => simulateWork(work('gray-scott'), { feed: Number.NaN })).toThrow(/non-finite/);
    expect(() => simulateWork(work('gray-scott'), { feed: Number.MAX_VALUE })).toThrow(
      /explicit reaction step number .* exceeds the limit/,
    );

    const execution = executeWork(work('gray-scott'), { feed: Number.NaN }, 'non-finite-audit');
    expect(execution.display).toBeNull();
    expect(execution.run).toMatchObject({
      status: 'invalid',
      failure: {
        kind: 'hard-constraint-violation',
      },
    });
    if (execution.run.status === 'invalid') {
      expect(execution.run.failure.message).toMatch(/must be finite/);
    }
  });

  it('enforces the registered kernel/runtime pair', () => {
    const lorenz = work('lorenz-atmosphere');
    const mismatched: WorkManifest = { ...lorenz, runtime: 'analytic-v1' };
    expect(() => simulateWork(mismatched, {})).toThrow(
      /registered for runtime "ode-v1", not declared runtime "analytic-v1"/,
    );
  });

  it('keeps Ising registered as a discrete lattice while returning its field view', () => {
    const ising = work('ising-model');
    expect(ising.runtime).toBe('discrete-v1');
    const result = simulateWork(ising, {});
    const gridShape = result.numerical?.provenance.grid?.shape;
    expect(gridShape).toEqual([32, 32]);
    expect(result.field).toMatchObject({ columns: gridShape?.[1], rows: gridShape?.[0] });
    expect(result.field?.values).toHaveLength((gridShape?.[0] ?? 0) * (gridShape?.[1] ?? 0));
  });

  it('uses the correct removable-singularity limits for Hodgkin-Huxley alpha rates', () => {
    expect(hodgkinHuxleyAlphaRates(-40).alphaM).toBeCloseTo(1, 12);
    expect(hodgkinHuxleyAlphaRates(-55).alphaN).toBeCloseTo(0.1, 12);
    expect(hodgkinHuxleyAlphaRates(-40 + 1e-8).alphaM).toBeCloseTo(1, 8);
    expect(hodgkinHuxleyAlphaRates(-55 - 1e-8).alphaN).toBeCloseTo(0.1, 8);
  });

  it('rejects an invalid Oregonator time scale instead of silently replacing it', () => {
    expect(() => simulateWork(work('oregonator'), { epsilon: 0 })).toThrow(
      /epsilon must be greater than zero/,
    );
  });

  it('labels discrete-map samples with the state iteration actually returned', () => {
    const logisticManifest = work('logistic-map');
    const logistic = simulateWork(logisticManifest, {});
    const population = logistic.series.find((series) => series.id === 'x');
    const iteration = logistic.series.find((series) => series.id === 'iteration');
    if (!population || !iteration) throw new Error('Logistic observables are missing.');
    let expected = logisticManifest.parameters.find((item) => item.id === 'initial')?.default;
    const growth = logisticManifest.parameters.find((item) => item.id === 'growth')?.default;
    if (expected === undefined || growth === undefined) throw new Error('Logistic inputs missing.');
    for (let index = 1; index <= 81; index += 1) expected = growth * expected * (1 - expected);
    expect(logistic.times[0]).toBe(81);
    expect(iteration.values[0]).toBe(81);
    expect(population.values[0]).toBe(expected);
    expect(logistic.times.at(-1)).toBe(800);
    expect(iteration.values.at(-1)).toBe(800);
    expect(logistic.presentationDuration).toBe(logisticManifest.duration);

    const standardManifest = work('standard-map');
    const standard = simulateWork(standardManifest, {});
    const theta = standard.series.find((series) => series.id === 'theta');
    const momentum = standard.series.find((series) => series.id === 'momentum');
    if (!theta || !momentum) throw new Error('Standard-map observables are missing.');
    expect(standard.times[0]).toBe(0);
    expect(theta.values[0]).toBe(0.3);
    expect(momentum.values[0]).toBe(
      standardManifest.parameters.find((item) => item.id === 'momentum')?.default,
    );
    expect(standard.presentationDuration).toBe(standardManifest.duration);

    const execution = executeWork(logisticManifest, {}, 'logistic-iteration-audit');
    expect(execution.run.provenance.interval).toEqual([81, 800]);
  });

  it('does not run the initial simulation during render or expose a stale result', () => {
    const lorenz = work('lorenz-atmosphere');
    function Probe() {
      const snapshot = useWorkSimulation(lorenz, { rho: Number.POSITIVE_INFINITY });
      return createElement(
        'span',
        null,
        `${snapshot.status}:${String(snapshot.result === null)}:${String(snapshot.error === null)}`,
      );
    }

    expect(renderToString(createElement(Probe))).toContain('idle:true:true');
  });
});
