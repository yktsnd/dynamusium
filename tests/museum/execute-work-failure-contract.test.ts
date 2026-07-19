import { beforeEach, describe, expect, it, vi } from 'vitest';

const executionProbe = vi.hoisted(() => ({
  mode: 'pass' as 'pass' | 'divergent-replay' | 'hard-not-run' | 'hard-failed',
  calls: 0,
}));

vi.mock('../../src/museum/simulation.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/museum/simulation.ts')>();
  return {
    ...actual,
    simulateWork: (
      work: Parameters<typeof actual.simulateWork>[0],
      overrides: Parameters<typeof actual.simulateWork>[1],
    ) => {
      const result = actual.simulateWork(work, overrides);
      if (work.slug !== 'execution-contract-probe') return result;
      executionProbe.calls += 1;
      const probed = structuredClone(result);
      if (executionProbe.mode === 'divergent-replay' && executionProbe.calls === 2) {
        probed.diagnostics = `${probed.diagnostics} (second execution differs)`;
      }
      if (executionProbe.mode === 'hard-not-run' || executionProbe.mode === 'hard-failed') {
        if (!probed.numerical) throw new Error('Lorenz probe omitted numerical evidence.');
        probed.numerical.checks.push({
          id: 'finite-output',
          status: executionProbe.mode === 'hard-not-run' ? 'not-run' : 'failed',
          severity: 'claim',
          metrics: [],
          message: `Injected ${executionProbe.mode} base-check result.`,
        });
      }
      return probed;
    },
  };
});

import { works } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';

function probeWork() {
  const lorenz = works.find((work) => work.kernel === 'lorenz');
  if (!lorenz || lorenz.schemaVersion !== 2) throw new Error('Lorenz portrait missing.');
  return { ...structuredClone(lorenz), slug: 'execution-contract-probe' };
}

beforeEach(() => {
  executionProbe.mode = 'pass';
  executionProbe.calls = 0;
});

describe('executeWork hard-failure contract', () => {
  it('compares two complete executions instead of assuming deterministic replay', () => {
    executionProbe.mode = 'divergent-replay';
    const execution = executeWork(probeWork(), {}, 'divergent-replay');

    expect(executionProbe.calls).toBe(2);
    expect(execution.display).toBeNull();
    expect(execution.run.status).toBe('invalid');
    if (execution.run.status !== 'invalid') throw new Error('Expected invalid execution.');
    expect(execution.run.failure.message).toContain('did not reproduce the complete WorkResult');
  });

  it.each([
    ['hard-not-run', 'not-run'],
    ['hard-failed', 'failed'],
  ] as const)('invalidates a base check reported as %s', (mode, status) => {
    executionProbe.mode = mode;
    const execution = executeWork(probeWork(), {}, `base-check-${status}`);

    expect(executionProbe.calls).toBe(2);
    expect(execution.display).toBeNull();
    expect(execution.run.status).toBe('invalid');
    if (execution.run.status !== 'invalid') throw new Error('Expected invalid execution.');
    expect(execution.run.failure.message).toContain(`Injected ${mode} base-check result.`);
  });
});
