import { describe, expect, it } from 'vitest';
import { demonstrationModel } from '../../src/model/demonstration-model.ts';
import { defaultParameterValues } from '../../src/model/validation.ts';
import { integrate } from '../../src/solver/integrate.ts';
import { frameAt } from '../../src/solver/trajectory.ts';

describe('integrate smoke', () => {
  it('produces a sane trajectory for the default scenario', () => {
    const result = integrate({
      model: demonstrationModel,
      params: defaultParameterValues(demonstrationModel),
      profile: { kind: 'constant', rate: 0.8 },
    });
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error('expected valid: ' + result.error.message);
    const traj = result.trajectory;
    expect(traj.times.length).toBe(3001);
    expect(result.diagnostics.smallClampCount).toBe(0);
    const end = frameAt(traj, 60);
    // Constant feed for 60 s adds 48 mol; most should have drained through.
    expect(end.reservoir).toBeGreaterThan(20);
    const total = end.reservoir + end.quantities.reduce((a, b) => a + b, 0);
    const initial = 1.2 + 0.4;
    expect(total).toBeCloseTo(initial + 0.8 * 60, 6);
  });
});
