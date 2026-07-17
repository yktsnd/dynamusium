import { describe, expect, it } from 'vitest';
import { createRk4Scratch, rk4Step } from '../../src/solver/rk4.ts';
import type { Derivatives } from '../../src/solver/rk4.ts';

function integrateScalar(f: Derivatives, y0: number, t0: number, t1: number, dt: number): number {
  const y = new Float64Array([y0]);
  const scratch = createRk4Scratch(1);
  const steps = Math.round((t1 - t0) / dt);
  let t = t0;
  for (let i = 0; i < steps; i++) {
    rk4Step(f, t, y, dt, scratch);
    t += dt;
  }
  return y[0];
}

describe('rk4Step', () => {
  it('integrates dy/dt = -y to match the exact exponential decay', () => {
    const decay: Derivatives = (_t, y, out) => {
      out[0] = -y[0];
    };
    const result = integrateScalar(decay, 1, 0, 1, 0.01);
    expect(result).toBeCloseTo(Math.exp(-1), 8);
  });

  it('integrates dy/dt = cos(t) to match sin(t)', () => {
    const cosine: Derivatives = (t, _y, out) => {
      out[0] = Math.cos(t);
    };
    const result = integrateScalar(cosine, 0, 0, 1, 0.01);
    expect(result).toBeCloseTo(Math.sin(1), 8);
  });
});
