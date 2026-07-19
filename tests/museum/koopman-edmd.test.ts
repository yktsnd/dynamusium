import { describe, expect, it } from 'vitest';
import {
  analyzeFiniteEdmd,
  EDMD_BROWSER_LIMITS,
  type EdmdRequest,
} from '../../src/museum/analyzers/koopman-edmd.ts';

function times(count: number, interval: number) {
  return Array.from({ length: count }, (_, index) => index * interval);
}

describe('finite-sample ridge EDMD', () => {
  it('recovers the decay rate of a scalar linear flow with chronological holdout', () => {
    const sampleTimes = times(180, 0.05);
    const rate = -0.4;
    const result = analyzeFiniteEdmd({
      times: sampleTimes,
      observables: [
        {
          id: 'x',
          label: 'state',
          unit: '1',
          values: sampleTimes.map((time) => Math.exp(rate * time)),
        },
      ],
      dictionary: [
        {
          id: 'identity-x',
          definition: 'x',
          source: 'linear-decay-test-law',
          evaluate: ({ x }) => x ?? Number.NaN,
        },
      ],
      options: { ridge: 1e-12, holdoutPairs: 30 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sampleInterval).toBeCloseTo(0.05, 12);
    expect(result.trainingResidual).toBeLessThan(1e-10);
    expect(result.holdoutResidual).toBeLessThan(1e-10);
    expect(result.modes).toHaveLength(1);
    expect(result.modes[0]?.discreteEigenvalue.real).toBeCloseTo(Math.exp(rate * 0.05), 9);
    expect(result.modes[0]?.decayRate).toBeCloseTo(rate, 8);
    expect(result.modes[0]?.angularFrequency).toBeCloseTo(0, 10);
    expect(result.conditioning.numericalRank).toBe(1);
    expect(result.provenance.dictionaryOrder).toEqual([
      { id: 'identity-x', definition: 'x', source: 'linear-decay-test-law' },
    ]);
    expect(result.interpretation).toContain('not the complete or continuous Koopman spectrum');
  });

  it('recovers a conjugate finite EDMD pair for a linear oscillator', () => {
    const sampleTimes = times(260, 0.04);
    const angularFrequency = 1.7;
    const result = analyzeFiniteEdmd({
      times: sampleTimes,
      observables: [
        {
          id: 'q',
          label: 'position',
          unit: '1',
          values: sampleTimes.map((time) => Math.cos(angularFrequency * time)),
        },
        {
          id: 'p',
          label: 'momentum',
          unit: '1',
          values: sampleTimes.map((time) => -Math.sin(angularFrequency * time)),
        },
      ],
      dictionary: [
        {
          id: 'q-coordinate',
          definition: 'q',
          source: 'linear-oscillator-test-law',
          evaluate: ({ q }) => q ?? Number.NaN,
        },
        {
          id: 'p-coordinate',
          definition: 'p',
          source: 'linear-oscillator-test-law',
          evaluate: ({ p }) => p ?? Number.NaN,
        },
      ],
      options: { ridge: 1e-12, holdoutPairs: 40 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trainingResidual).toBeLessThan(1e-9);
    expect(result.holdoutResidual).toBeLessThan(1e-9);
    expect(result.conditioning.numericalRank).toBe(2);
    expect(result.modes).toHaveLength(2);
    const frequencies = result.modes
      .map((mode) => mode.angularFrequency ?? Number.NaN)
      .sort((left, right) => left - right);
    expect(frequencies[0]).toBeCloseTo(-angularFrequency, 7);
    expect(frequencies[1]).toBeCloseTo(angularFrequency, 7);
    for (const mode of result.modes) {
      expect(mode.decayRate).toBeCloseTo(0, 8);
      expect(mode.relativeEigenResidual).toBeLessThan(1e-10);
      expect(mode.eigenfunctionCoefficients).toHaveLength(2);
    }
  });

  it('is deterministic and records observable and dictionary provenance', () => {
    const sampleTimes = times(100, 0.1);
    const request: EdmdRequest = {
      times: sampleTimes,
      observables: [
        {
          id: 'x',
          label: 'x state',
          unit: 'mol',
          values: sampleTimes.map((time) => Math.exp(-0.2 * time)),
        },
      ],
      dictionary: [
        {
          id: 'x',
          definition: 'x',
          source: 'reviewed-equation:linear-decay',
          evaluate: ({ x }) => x ?? Number.NaN,
        },
      ],
    };

    const first = analyzeFiniteEdmd(request);
    const second = analyzeFiniteEdmd(request);
    expect(second).toEqual(first);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.provenance.observableOrder).toEqual([{ id: 'x', label: 'x state', unit: 'mol' }]);
    expect(first.provenance.dictionaryOrder[0]?.source).toBe('reviewed-equation:linear-decay');
    expect(first.provenance.trainingPairRange[0]).toBe(0);
    expect(first.provenance.holdoutPairRange[0]).toBe(first.trainingPairs);
  });

  it('returns explicit failures for rank deficiency, non-finite data, and short holdout', () => {
    const sampleTimes = times(80, 0.1);
    const values = sampleTimes.map((time) => Math.exp(-time));
    const base = {
      times: sampleTimes,
      observables: [{ id: 'x', label: 'x', unit: '1', values }],
    };
    const rankDeficient = analyzeFiniteEdmd({
      ...base,
      dictionary: [
        { id: 'x', definition: 'x', source: 'test', evaluate: ({ x }) => x ?? Number.NaN },
        {
          id: 'twice-x',
          definition: '2 x',
          source: 'test',
          evaluate: ({ x }) => 2 * (x ?? Number.NaN),
        },
      ],
    });
    expect(rankDeficient).toMatchObject({ ok: false, code: 'rank-deficient' });

    const nonfinite = analyzeFiniteEdmd({
      ...base,
      observables: [{ id: 'x', label: 'x', unit: '1', values: [...values.slice(0, -1), NaN] }],
      dictionary: [
        { id: 'x', definition: 'x', source: 'test', evaluate: ({ x }) => x ?? Number.NaN },
      ],
    });
    expect(nonfinite).toMatchObject({ ok: false, code: 'non-finite-input' });

    const shortHoldout = analyzeFiniteEdmd({
      ...base,
      dictionary: [
        { id: 'x', definition: 'x', source: 'test', evaluate: ({ x }) => x ?? Number.NaN },
      ],
      options: { holdoutPairs: 2 },
    });
    expect(shortHoldout).toMatchObject({ ok: false, code: 'insufficient-holdout' });
  });

  it('rejects non-uniform sampling and data beyond the declared browser budget', () => {
    const nonuniform = analyzeFiniteEdmd({
      times: [0, 0.1, 0.21, ...times(30, 0.1).map((time) => time + 0.31)],
      observables: [
        {
          id: 'x',
          label: 'x',
          unit: '1',
          values: Array.from({ length: 33 }, (_, index) => Math.exp(-0.1 * index)),
        },
      ],
      dictionary: [
        { id: 'x', definition: 'x', source: 'test', evaluate: ({ x }) => x ?? Number.NaN },
      ],
    });
    expect(nonuniform).toMatchObject({ ok: false, code: 'non-uniform-sampling' });

    const excessiveTimes = times(EDMD_BROWSER_LIMITS.maximumSnapshots + 1, 0.1);
    const oversized = analyzeFiniteEdmd({
      times: excessiveTimes,
      observables: [
        {
          id: 'x',
          label: 'x',
          unit: '1',
          values: excessiveTimes.map(() => 1),
        },
      ],
      dictionary: [{ id: 'one', definition: '1', source: 'test', evaluate: () => 1 }],
    });
    expect(oversized).toMatchObject({ ok: false, code: 'browser-limit-exceeded' });
  });
});
