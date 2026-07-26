import { describe, expect, it } from 'vitest';
import { integrateAdaptiveDopri54 } from '../../src/museum/runtimes/adaptive-dopri54.ts';

function crossingRun(
  surface: (time: number, state: readonly number[]) => number,
  mayCrossBetween?: (
    startTime: number,
    startState: readonly number[],
    endTime: number,
    endState: readonly number[],
  ) => boolean,
) {
  return integrateAdaptiveDopri54({
    initial: [-1],
    duration: 2,
    outputSteps: 1,
    derivative: () => [1],
    relativeTolerance: 1e-10,
    absoluteTolerance: 1e-12,
    initialStep: 2,
    minimumStep: 1e-8,
    maximumStep: 2,
    maximumAttempts: 10_000,
    event: {
      id: 'interior-entry',
      surface,
      rootTolerance: 1e-10,
      ...(mayCrossBetween ? { mayCrossBetween } : {}),
    },
  });
}

describe('adaptive Dormand–Prince terminal event inspection', () => {
  it('detects an entry and exit that both occur inside one accepted step', () => {
    const result = crossingRun((_time, state) => Math.abs(state[0] ?? Number.NaN) - 0.1);

    expect(result.terminalEvent?.time).toBeCloseTo(0.9, 8);
    expect(result.terminalEvent?.surfaceResidual).toBeLessThanOrEqual(1e-8);
    expect(result.times.at(-1)).toBe(result.terminalEvent?.time);
  });

  it('bisects a guarded step when fixed probes straddle a narrow event region', () => {
    const lower = 0.22;
    const upper = 0.24;
    const result = crossingRun(
      (_time, state) => Math.abs((state[0] ?? Number.NaN) - 0.23) - 0.01,
      (_startTime, startState, _endTime, endState) => {
        const start = startState[0] ?? Number.NaN;
        const end = endState[0] ?? Number.NaN;
        return Math.min(start, end) <= upper && Math.max(start, end) >= lower;
      },
    );

    expect(result.terminalEvent?.time).toBeCloseTo(1.22, 8);
    expect(result.terminalEvent?.surfaceResidual).toBeLessThanOrEqual(1e-8);
    expect(result.rejectedSteps).toBeGreaterThan(0);
  });
});
