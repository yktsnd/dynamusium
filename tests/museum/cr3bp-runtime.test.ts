import { describe, expect, it } from 'vitest';
import { workBySlug } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';
import { simulateWork } from '../../src/museum/simulation.ts';
import type { WorkResult } from '../../src/museum/types.ts';

const work = workBySlug.get('restricted-three-body');
if (!work) throw new Error('Restricted Three-Body work is missing.');

function minimumPrimaryDistance(result: WorkResult, massRatio: number): number {
  const x = result.series.find((series) => series.id === 'x');
  const y = result.series.find((series) => series.id === 'y');
  if (!x || !y) throw new Error('CR3BP x/y series are missing.');
  return x.values.reduce((minimum, xValue, index) => {
    const yValue = y.values[index];
    if (yValue === undefined) throw new Error('CR3BP x/y series are misaligned.');
    return Math.min(
      minimum,
      Math.hypot(xValue + massRatio, yValue),
      Math.hypot(xValue - 1 + massRatio, yValue),
    );
  }, Number.POSITIVE_INFINITY);
}

describe('reviewed adaptive CR3BP runtime', () => {
  it('completes the canonical interval with adaptive provenance and Jacobi evidence', () => {
    const result = simulateWork(work, { massRatio: 0.012, velocity: 0.62 });

    expect(result.duration).toBe(34);
    expect(result.times).toHaveLength(1601);
    expect(result.numerical?.terminalEvent).toBeUndefined();
    expect(result.numerical?.provenance.execution.id).toBe('dormand-prince-54-event-cr3bp');
    expect(result.numerical?.provenance.execution.fixedStep).toBeUndefined();
    expect(result.numerical?.provenance.execution.adaptive?.relativeTolerance).toBe(1e-9);
    const jacobi = result.numerical?.checks.find((check) => check.id === 'energy-residual');
    expect(jacobi?.status).toBe('passed');
    expect(jacobi?.metrics[0]?.value).toBeLessThanOrEqual(1e-6);
    expect(result.numerical?.checks.find((check) => check.id === 'step-halving')?.status).toBe(
      'passed',
    );
  }, 30_000);

  it.each([
    [0.015, 0.0359],
    [0.49, 0.033],
  ])(
    'does not manufacture a close encounter for mass ratio %s',
    (massRatio, minimum) => {
      const result = simulateWork(work, { massRatio, velocity: 0.62 });

      expect(result.duration).toBe(34);
      expect(result.numerical?.terminalEvent).toBeUndefined();
      expect(minimumPrimaryDistance(result, massRatio)).toBeGreaterThan(minimum);
    },
    30_000,
  );

  it('returns a localized close encounter as a valid terminal scientific event', () => {
    const execution = executeWork(
      work,
      { massRatio: 0.016, velocity: 0.62 },
      'cr3bp-terminal-event-test',
    );

    expect(execution.run.status).toBe('valid');
    if (execution.run.status !== 'valid' || !execution.display) {
      throw new Error('CR3BP terminal event was incorrectly invalidated.');
    }
    const event = execution.display.numerical?.terminalEvent;
    expect(event?.id).toBe('close-encounter-resolution-boundary');
    expect(event?.time).toBeGreaterThan(2.513);
    expect(event?.time).toBeLessThan(2.515);
    expect(event?.surfaceResidual).toBeLessThanOrEqual(1e-8);
    expect(event?.bracketWidth).toBeLessThanOrEqual(1e-8);
    expect(execution.display.duration).toBe(event?.time);
    expect(execution.display.diagnostics).toMatch(/not a physical collision claim/i);
    expect(
      execution.run.claimAssessments.find((check) => check.id === 'close-encounter-terminal-event')
        ?.status,
    ).toBe('passed');
  }, 60_000);

  it('keeps every curated preset valid', () => {
    for (const preset of work.presets) {
      expect(executeWork(work, preset.values, `cr3bp-${preset.id}`).run.status).toBe('valid');
    }
  }, 60_000);
});
