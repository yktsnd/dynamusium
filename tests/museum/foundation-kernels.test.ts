import { describe, expect, it } from 'vitest';
import {
  FED_REACTION_CHAIN_REVIEWED_PROFILE,
  FoundationKernelError,
  LORENZ_REVIEWED_PROFILE,
  simulateFedReactionChainFoundation,
  simulateLorenzFoundation,
  type FoundationCheck,
  type FoundationKernelResult,
  type FoundationSeries,
} from '../../src/museum/runtimes/foundation-kernels.ts';

function stateSeries(result: FoundationKernelResult, id: string): FoundationSeries {
  const found = result.state.components.find((item) => item.id === id);
  if (found === undefined) throw new Error(`missing state series: ${id}`);
  return found;
}

function observable(result: FoundationKernelResult, id: string): FoundationSeries {
  const found = result.observables.find((item) => item.id === id);
  if (found === undefined) throw new Error(`missing observable: ${id}`);
  return found;
}

function check(result: FoundationKernelResult, id: string): FoundationCheck {
  const found = result.checks.find((item) => item.id === id);
  if (found === undefined) throw new Error(`missing check: ${id}`);
  return found;
}

function expectCommonContract(result: FoundationKernelResult) {
  expect(result.times.length).toBeGreaterThan(1);
  expect(result.times[0]).toBe(0);
  expect(result.times.at(-1)).toBe(result.provenance.solver.duration);
  expect(result.provenance.solver.steps + 1).toBe(result.times.length);
  expect(result.provenance.solver.precision).toBe('float64');
  expect(result.provenance.solver.id).toBe('classical-rk4-fixed-v1');
  expect(result).not.toHaveProperty('points');
  expect(result).not.toHaveProperty('geometry');
  for (const item of [...result.state.components, ...result.observables]) {
    expect(item.values.length).toBe(result.times.length);
    expect(Array.from(item.values).every(Number.isFinite)).toBe(true);
  }
  for (const item of result.checks) {
    expect(Number.isFinite(item.value)).toBe(true);
    if (item.tolerance !== undefined) expect(Number.isFinite(item.tolerance)).toBe(true);
  }
}

describe('Lorenz foundation kernel', () => {
  it('returns only raw state and declared observables under the reviewed profile', () => {
    const result = simulateLorenzFoundation();

    expectCommonContract(result);
    expect(result.provenance.kernelId).toBe('lorenz-foundation');
    expect(result.provenance.reviewedProfileId).toBe(LORENZ_REVIEWED_PROFILE.id);
    expect(result.provenance.solver.stepSize).toBe(LORENZ_REVIEWED_PROFILE.stepSize);
    expect(result.state.components.map((item) => item.id)).toEqual(['x', 'y', 'z']);
    expect(result.observables.map((item) => item.id)).toEqual(['state-radius', 'sign-lobe']);
    expect(stateSeries(result, 'x').values[0]).toBe(0.1);
    expect(stateSeries(result, 'y').values[0]).toBe(0);
    expect(stateSeries(result, 'z').values[0]).toBe(0);
  });

  it('passes short-time refinement and analytic equilibrium residual checks', () => {
    const result = simulateLorenzFoundation();
    const refinement = check(result, 'short-time-step-halving');
    const equilibrium = check(result, 'analytic-equilibrium-residual');

    expect(refinement.status).toBe('passed');
    expect(refinement.comparison).toBe('less-than-or-equal');
    expect(refinement.value).toBeLessThanOrEqual(refinement.tolerance ?? 0);
    expect(refinement.scope.endTime).toBe(LORENZ_REVIEWED_PROFILE.comparisonDuration);
    expect(equilibrium.status).toBe('passed');
    expect(equilibrium.value).toBeLessThanOrEqual(equilibrium.tolerance ?? 0);
  });

  it('reports finite-window boundedness, both sign lobes, and a metric-scoped recurrence rate', () => {
    const result = simulateLorenzFoundation();
    const bounded = check(result, 'post-burn-in-bounded-norm');
    const lobes = check(result, 'two-lobe-minimum-occupancy');
    const recurrence = check(result, 'normalized-near-return-fraction');

    expect(bounded.status).toBe('passed');
    expect(bounded.value).toBeLessThanOrEqual(LORENZ_REVIEWED_PROFILE.boundedNormLimit);
    expect(lobes.status).toBe('passed');
    expect(lobes.comparison).toBe('greater-than-or-equal');
    expect(lobes.value).toBeGreaterThanOrEqual(lobes.tolerance ?? 1);
    expect(recurrence.status).toBe('observed');
    expect(recurrence.comparison).toBe('informational');
    expect(recurrence.value).toBeGreaterThan(0);
    expect(recurrence.value).toBeLessThanOrEqual(1);

    const lobeValues = new Set(Array.from(observable(result, 'sign-lobe').values));
    expect(lobeValues).toEqual(new Set([-1, 1]));
  });

  it('replays bit-for-bit for identical inputs', () => {
    const first = simulateLorenzFoundation({ rho: 28, sigma: 10 });
    const second = simulateLorenzFoundation({ rho: 28, sigma: 10 });

    expect(first.times).toEqual(second.times);
    expect(first.state.components).toEqual(second.state.components);
    expect(first.observables).toEqual(second.observables);
    expect(first.checks).toEqual(second.checks);
  });
});

describe('Fed Reaction Chain foundation kernel', () => {
  it('fully declares the forcing, rates, state, and accounting observable', () => {
    const feed = 1.05;
    const rate = 0.42;
    const result = simulateFedReactionChainFoundation({ feed, rate });

    expectCommonContract(result);
    expect(result.provenance.kernelId).toBe('fed-reaction-chain-foundation');
    expect(result.provenance.reviewedProfileId).toBe(FED_REACTION_CHAIN_REVIEWED_PROFILE.id);
    expect(result.state.components.map((item) => item.id)).toEqual(['a', 'b', 'c', 'collected']);
    expect(result.observables.map((item) => item.id)).toEqual([
      'input-flux',
      'a-to-b-flux',
      'b-to-c-flux',
      'c-to-collected-flux',
      'cumulative-input',
      'a-to-b-cumulative',
      'b-to-c-cumulative',
      'c-to-collected-cumulative',
      'mass-balance-residual',
    ]);
    expect(result.provenance.equation).toContain('I(t)=feed*[0.78+0.22*sin(2*pi*t/18)]');
    expect(result.provenance.forcing?.formula).toBe('I(t)=feed*[0.78+0.22*sin(2*pi*t/18)]');
    expect(result.provenance.forcing?.minimumRate).toBeCloseTo(0.56 * feed, 14);
    expect(result.provenance.forcing?.maximumRate).toBeCloseTo(feed, 14);
    expect(result.provenance.parameters.secondRate).toBeCloseTo(0.72 * rate, 14);
    expect(result.provenance.parameters.collectionRate).toBeCloseTo(0.48 * rate, 14);
  });

  it('computes instantaneous fluxes from the same state and explicit schedule', () => {
    const feed = 0.8;
    const rate = 0.35;
    const result = simulateFedReactionChainFoundation({ feed, rate });
    const sample = 137;
    const time = result.times[sample] ?? 0;
    const a = stateSeries(result, 'a').values[sample] ?? 0;
    const b = stateSeries(result, 'b').values[sample] ?? 0;
    const c = stateSeries(result, 'c').values[sample] ?? 0;
    const expectedInput =
      feed *
      (0.78 +
        0.22 * Math.sin((2 * Math.PI * time) / FED_REACTION_CHAIN_REVIEWED_PROFILE.feedPeriod));

    expect(observable(result, 'input-flux').values[sample]).toBeCloseTo(expectedInput, 14);
    expect(observable(result, 'a-to-b-flux').values[sample]).toBeCloseTo(rate * a, 14);
    expect(observable(result, 'b-to-c-flux').values[sample]).toBeCloseTo(0.72 * rate * b, 14);
    expect(observable(result, 'c-to-collected-flux').values[sample]).toBeCloseTo(
      0.48 * rate * c,
      14,
    );
  });

  it('preserves positivity and the open-system mass balance at every frame', () => {
    const result = simulateFedReactionChainFoundation();
    const cumulativeInput = observable(result, 'cumulative-input').values;
    const residual = observable(result, 'mass-balance-residual').values;
    const initialMass = 0.2 + 0.05;

    for (let index = 0; index < result.times.length; index += 1) {
      const material = result.state.components.reduce(
        (total, item) => total + (item.values[index] ?? 0),
        0,
      );
      expect(material).toBeCloseTo(initialMass + (cumulativeInput[index] ?? 0), 10);
      expect(Math.abs(residual[index] ?? 0)).toBeLessThan(1e-10);
      for (const item of result.state.components)
        expect(item.values[index]).toBeGreaterThanOrEqual(0);
      expect(cumulativeInput[index]).toBeGreaterThanOrEqual(0);
    }

    for (const id of [
      'state-positivity',
      'mass-balance-residual',
      'full-window-step-halving',
      'analytic-feed-integral-residual',
      'cumulative-monotonicity',
    ]) {
      expect(check(result, id).status).toBe('passed');
    }
    for (const id of ['a-to-b-cumulative', 'b-to-c-cumulative', 'c-to-collected-cumulative']) {
      const values = observable(result, id).values;
      expect(values[0]).toBe(0);
      for (let index = 1; index < values.length; index += 1) {
        expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]);
      }
    }
  });

  it('matches the closed-form integral of the declared feed schedule', () => {
    const feed = 1.2;
    const result = simulateFedReactionChainFoundation({ feed });
    const time = result.times.at(-1) ?? 0;
    const angularFrequency = (2 * Math.PI) / FED_REACTION_CHAIN_REVIEWED_PROFILE.feedPeriod;
    const expected =
      feed *
      (FED_REACTION_CHAIN_REVIEWED_PROFILE.feedMeanMultiplier * time +
        (FED_REACTION_CHAIN_REVIEWED_PROFILE.feedOscillationMultiplier / angularFrequency) *
          (1 - Math.cos(angularFrequency * time)));

    expect(observable(result, 'cumulative-input').values.at(-1)).toBeCloseTo(expected, 9);
    const reference = check(result, 'analytic-feed-integral-residual');
    expect(reference.value).toBeLessThanOrEqual(reference.tolerance ?? 0);
  });

  it('replays bit-for-bit for identical input and profile', () => {
    const first = simulateFedReactionChainFoundation({ feed: 1.8, rate: 0.75 });
    const second = simulateFedReactionChainFoundation({ feed: 1.8, rate: 0.75 });

    expect(first.times).toEqual(second.times);
    expect(first.state.components).toEqual(second.state.components);
    expect(first.observables).toEqual(second.observables);
    expect(first.checks).toEqual(second.checks);
  });
});

describe('foundation kernel failure semantics and browser profiles', () => {
  it('rejects non-finite and domain-invalid inputs with structured errors', () => {
    const runs: Array<() => unknown> = [
      () => simulateLorenzFoundation({ rho: Number.NaN }),
      () => simulateLorenzFoundation({ sigma: -1 }),
      () => simulateFedReactionChainFoundation({ feed: Number.POSITIVE_INFINITY }),
      () =>
        simulateFedReactionChainFoundation({
          initialCondition: { a: -0.1, b: 0, c: 0, collected: 0 },
        }),
    ];

    for (const run of runs) {
      try {
        run();
        throw new Error('expected a structured kernel failure');
      } catch (error) {
        expect(error).toBeInstanceOf(FoundationKernelError);
        expect((error as FoundationKernelError).kind).toBe('invalid-input');
      }
    }
  });

  it('keeps both reviewed profiles inside the fixed browser step budget', () => {
    const lorenz = simulateLorenzFoundation();
    const fed = simulateFedReactionChainFoundation();
    const lorenzComparisonSteps = Math.round(
      lorenz.provenance.solver.comparisonDuration / lorenz.provenance.solver.comparisonStepSize,
    );
    const fedComparisonSteps = Math.round(
      fed.provenance.solver.comparisonDuration / fed.provenance.solver.comparisonStepSize,
    );

    expect(lorenz.provenance.solver.steps + lorenzComparisonSteps).toBeLessThanOrEqual(20_000);
    expect(fed.provenance.solver.steps + fedComparisonSteps).toBeLessThanOrEqual(20_000);
  });
});
