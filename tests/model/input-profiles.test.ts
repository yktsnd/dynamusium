import { describe, expect, it } from 'vitest';
import { evaluateProfile } from '../../src/model/input-profiles.ts';

describe('evaluateProfile', () => {
  it('returns 0 for the "none" profile at any time', () => {
    expect(evaluateProfile({ kind: 'none' }, 0)).toBe(0);
    expect(evaluateProfile({ kind: 'none' }, 42)).toBe(0);
  });

  it('returns the constant rate, unaffected by time', () => {
    const profile = { kind: 'constant' as const, rate: 0.8 };
    expect(evaluateProfile(profile, 0)).toBe(0.8);
    expect(evaluateProfile(profile, 100)).toBe(0.8);
  });

  it('clamps a negative constant rate to 0', () => {
    expect(evaluateProfile({ kind: 'constant', rate: -3 }, 5)).toBe(0);
  });

  it('peaks at the pulse center with a value equal to the amplitude', () => {
    const profile = { kind: 'pulse' as const, amplitude: 2.6, center: 8, width: 2.2 };
    expect(evaluateProfile(profile, profile.center)).toBeCloseTo(profile.amplitude, 10);
  });

  it('is symmetric about the pulse center', () => {
    const profile = { kind: 'pulse' as const, amplitude: 2.6, center: 8, width: 2.2 };
    const before = evaluateProfile(profile, profile.center - 3);
    const after = evaluateProfile(profile, profile.center + 3);
    expect(before).toBeCloseTo(after, 12);
    // And strictly below the peak.
    expect(before).toBeLessThan(evaluateProfile(profile, profile.center));
  });

  it('respects the sine period', () => {
    const profile = { kind: 'sine' as const, base: 0.7, amplitude: 0.6, period: 18 };
    const t0 = evaluateProfile(profile, 3);
    const t1 = evaluateProfile(profile, 3 + profile.period);
    expect(t1).toBeCloseTo(t0, 10);
  });

  it('clamps negative sine excursions to 0', () => {
    // base < amplitude means the underlying sine dips below zero.
    const profile = { kind: 'sine' as const, base: 0.2, amplitude: 1, period: 10 };
    // At a quarter into the negative half-cycle the raw sine is at its most negative.
    const t = profile.period * 0.75;
    const raw = profile.base + profile.amplitude * Math.sin((2 * Math.PI * t) / profile.period);
    expect(raw).toBeLessThan(0);
    expect(evaluateProfile(profile, t)).toBe(0);
  });
});
