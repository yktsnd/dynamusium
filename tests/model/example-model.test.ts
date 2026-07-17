import { describe, expect, it } from 'vitest';
import { dampedCascade } from '../../examples/damped-cascade.ts';
import { validateModel, defaultParameterValues } from '../../src/model/validation.ts';
import { integrate } from '../../src/solver/integrate.ts';

/** The examples/ model proves the contract is model-agnostic. */
describe('example model: damped cascade', () => {
  it('validates and integrates through the same pipeline as the demo model', () => {
    expect(validateModel(dampedCascade)).toEqual([]);
    const result = integrate({
      model: dampedCascade,
      params: defaultParameterValues(dampedCascade),
      profile: { kind: 'constant', rate: 0.4 },
    });
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error('expected valid: ' + result.error.message);
    const traj = result.trajectory;
    expect(result.diagnostics.smallClampCount).toBe(0);
    const last = traj.reservoir[traj.reservoir.length - 1];
    expect(last).toBeGreaterThan(0);
    // Open-system mass balance: initial 2 + 0.4 * 90 fed in.
    const end = last + traj.quantities.reduce((sum, q) => sum + q[q.length - 1], 0);
    expect(end).toBeCloseTo(2 + 0.4 * 90, 6);
  });
});
