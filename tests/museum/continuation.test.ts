import { describe, expect, it } from 'vitest';
import {
  CONTINUATION_BROWSER_LIMITS,
  continueEquilibriumBranch,
  type EquilibriumProblem,
} from '../../src/museum/analyzers/continuation.ts';

describe('bounded pseudo-arclength continuation', () => {
  it('crosses the saddle-node normal form and reports a fold candidate with stability evidence', () => {
    const saddleNode: EquilibriumProblem = {
      residual: ([state], parameter) => [state! * state! - parameter],
      jacobian: ([state]) => [[2 * state!]],
      parameterDerivative: () => [-1],
    };

    const result = continueEquilibriumBranch(
      saddleNode,
      { state: [1], parameter: 1 },
      {
        pointCount: 30,
        parameterDirection: -1,
        initialStep: 0.1,
        minimumStep: 1e-5,
        maximumStep: 0.14,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.points).toHaveLength(30);
    expect(
      Math.max(...result.points.map((point) => point.evidence.residualInfinityNorm)),
    ).toBeLessThan(1e-8);
    expect(result.points.some((point) => point.state[0]! > 0.5)).toBe(true);
    expect(result.points.some((point) => point.state[0]! < -0.2)).toBe(true);
    expect(result.points[0]?.evidence.stability).toEqual(
      expect.objectContaining({
        status: 'computed',
        method: 'analytic-1x1',
        classification: 'unstable',
      }),
    );
    expect(result.points.at(-1)?.evidence.stability.classification).toBe('stable');

    const fold = result.foldCandidates[0];
    expect(fold?.kind).toBe('fold-candidate');
    expect(Math.abs(fold?.parameterEstimate ?? 1)).toBeLessThan(0.02);
    expect(Math.abs(fold?.stateEstimate[0] ?? 1)).toBeLessThan(0.12);
    expect(fold?.limitations.join(' ')).toContain('No interval enclosure');
    expect(result.diagnostics.limitations.join(' ')).toContain('no interval enclosure');
  });

  it('uses deterministic finite differences and bounded real-Schur stability evidence', () => {
    const stableBranch: EquilibriumProblem = {
      residual: ([first, second, third], parameter) => [
        -6 * third! + parameter,
        first! - 11 * third!,
        second! - 6 * third!,
      ],
    };
    const options = {
      pointCount: 8,
      initialStep: 0.04,
      maximumStep: 0.08,
    } as const;

    const first = continueEquilibriumBranch(
      stableBranch,
      { state: [0, 0, 0], parameter: 0 },
      options,
    );
    const second = continueEquilibriumBranch(
      stableBranch,
      { state: [0, 0, 0], parameter: 0 },
      options,
    );

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    for (const point of first.points) {
      expect(point.evidence.stateJacobianSource).toBe('finite-difference');
      expect(point.evidence.parameterDerivativeSource).toBe('finite-difference');
      expect(point.evidence.stability).toEqual(
        expect.objectContaining({
          status: 'computed',
          method: 'bounded-real-schur',
          classification: 'stable',
          unstableDimension: 0,
        }),
      );
      expect(point.evidence.stability.iterations).toBeGreaterThan(0);
      expect(
        point.evidence.stability.eigenvalues.map((value) => value.real).sort((a, b) => a - b),
      ).toEqual([expect.closeTo(-3, 7), expect.closeTo(-2, 7), expect.closeTo(-1, 7)]);
    }
  });

  it('returns an explicit failure for non-finite callback output', () => {
    const result = continueEquilibriumBranch(
      { residual: () => [Number.NaN] },
      { state: [0], parameter: 0 },
      { pointCount: 2 },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'non-finite-evaluation',
        partialPoints: [],
      }),
    );
  });

  it('does not hide a corrector that cannot converge within the declared budget', () => {
    const result = continueEquilibriumBranch(
      {
        residual: ([state], parameter) => [state! * state! - parameter],
        jacobian: ([state]) => [[2 * state!]],
        parameterDerivative: () => [-1],
      },
      { state: [1], parameter: 1 },
      {
        pointCount: 2,
        parameterDirection: -1,
        initialStep: 0.8,
        minimumStep: 0.8,
        maximumStep: 0.8,
        maximumNewtonIterations: 1,
        newtonTolerance: 1e-14,
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        code: 'newton-nonconvergence',
        failedStep: 0.8,
      }),
    );
    if (result.ok) return;
    expect(result.partialPoints).toHaveLength(1);
    expect(result.diagnostics.rejectedSteps).toBe(1);
  });

  it('rejects work above the browser caps before evaluating the problem', () => {
    let evaluations = 0;
    const result = continueEquilibriumBranch(
      {
        residual: ([state], parameter) => {
          evaluations += 1;
          return [state! - parameter];
        },
      },
      { state: [0], parameter: 0 },
      { pointCount: CONTINUATION_BROWSER_LIMITS.maximumPoints + 1 },
    );

    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'invalid-input' }));
    expect(evaluations).toBe(0);
  });
});
