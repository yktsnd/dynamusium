import { describe, expect, it } from 'vitest';
import { works } from '../../src/museum/catalog.ts';
import { simulateWork } from '../../src/museum/simulation.ts';

/**
 * Conservative systems must stay conservative on screen.
 *
 * RK4 is not symplectic, so a Hamiltonian work integrated at one step per
 * displayed frame accumulates truncation error that a visitor reads as
 * physics: a double pendulum that gains energy, a three-body system whose
 * orbits are an artifact of the step size. Both works below shipped that
 * way. These tests measure the invariant from the real kernel output, so
 * the step size can never be loosened back without failing here.
 */

const seriesValues = (slug: string, id: string, overrides: Record<string, number> = {}) => {
  const work = works.find((candidate) => candidate.slug === slug);
  if (!work) throw new Error(`No work ${slug}`);
  const result = simulateWork(work, overrides);
  const series = result.series.find((candidate) => candidate.id === id);
  if (!series)
    throw new Error(`No series ${id} on ${slug}; have ${result.series.map((s) => s.id)}`);
  return series.values;
};

const relativeDrift = (values: number[]) => {
  const first = values[0];
  if (first === undefined || first === 0) throw new Error('Invariant starts at zero');
  return Math.max(...values.map((value) => Math.abs((value - first) / first)));
};

describe('double pendulum energy', () => {
  // Equal unit masses and lengths, matching the equations of motion the
  // kernel integrates: H = ω₁² + ½ω₂² + ω₁ω₂cos(θ₁−θ₂) − g(2cosθ₁ + cosθ₂).
  const energy = (gravity: number, overrides: Record<string, number> = {}) => {
    const t1 = seriesValues('double-pendulum', 'theta1', overrides);
    const t2 = seriesValues('double-pendulum', 'theta2', overrides);
    const w1 = seriesValues('double-pendulum', 'omega1', overrides);
    const w2 = seriesValues('double-pendulum', 'omega2', overrides);
    return t1.map((theta1, index) => {
      const theta2 = t2[index] ?? 0;
      const omega1 = w1[index] ?? 0;
      const omega2 = w2[index] ?? 0;
      return (
        omega1 * omega1 +
        0.5 * omega2 * omega2 +
        omega1 * omega2 * Math.cos(theta1 - theta2) -
        gravity * (2 * Math.cos(theta1) + Math.cos(theta2))
      );
    });
  };

  it.each<[string, Record<string, number>]>([
    ['canonical release', {}],
    // The preset that drifted 53% before substepping was introduced.
    ['threshold preset', { offset: 0.42 }],
    ['quiet preset', { offset: 0.04 }],
    ['maximum gravity', { gravity: 18 }],
    ['minimum gravity', { gravity: 2 }],
  ])('holds total energy across the parameter range (%s)', (_name, overrides) => {
    const gravity = overrides.gravity ?? 9.81;
    expect(relativeDrift(energy(gravity, overrides))).toBeLessThan(1e-4);
  });
});

describe('three-body energy', () => {
  // Softened Newtonian pair potential, matching the kernel's acceleration:
  // U = −Σ mᵢmⱼ/√(r² + ε²) with ε = 0.12.
  const energy = (thirdMass: number, overrides: Record<string, number> = {}) => {
    const softening = 0.12;
    const masses = [1, 0.85, thirdMass];
    const axes = ['x', 'y'] as const;
    const position = (body: string) =>
      axes.map((axis) => seriesValues('n-body-system', `body-${body}-${axis}`, overrides));
    const velocity = (body: string) =>
      axes.map((axis) => seriesValues('n-body-system', `body-${body}-v${axis}`, overrides));
    const bodies = ['a', 'b', 'c'];
    const positions = bodies.map(position);
    const velocities = bodies.map(velocity);
    const frames = positions[0]?.[0]?.length ?? 0;

    return Array.from({ length: frames }, (_unused, frame) => {
      let total = 0;
      for (let i = 0; i < 3; i += 1) {
        const vx = velocities[i]?.[0]?.[frame] ?? 0;
        const vy = velocities[i]?.[1]?.[frame] ?? 0;
        total += 0.5 * (masses[i] ?? 0) * (vx * vx + vy * vy);
        for (let j = i + 1; j < 3; j += 1) {
          const dx = (positions[j]?.[0]?.[frame] ?? 0) - (positions[i]?.[0]?.[frame] ?? 0);
          const dy = (positions[j]?.[1]?.[frame] ?? 0) - (positions[i]?.[1]?.[frame] ?? 0);
          total -=
            ((masses[i] ?? 0) * (masses[j] ?? 0)) /
            Math.sqrt(dx * dx + dy * dy + softening * softening);
        }
      }
      return total;
    });
  };

  it.each<[string, Record<string, number>]>([
    ['canonical release', {}],
    // The preset that grew 165% in energy before substepping was introduced.
    ['threshold preset', { mass: 1.5, velocity: 1.2 }],
    ['quiet preset', { mass: 0.35 }],
  ])('holds total energy across the parameter range (%s)', (_name, overrides) => {
    const thirdMass = overrides.mass ?? 0.6;
    expect(relativeDrift(energy(thirdMass, overrides))).toBeLessThan(1e-4);
  });
});
