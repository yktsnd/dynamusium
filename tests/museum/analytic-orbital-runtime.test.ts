import { describe, expect, it } from 'vitest';
import { workBySlug } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';
import { simulateWork } from '../../src/museum/simulation.ts';

function work(slug: string) {
  const manifest = workBySlug.get(slug);
  if (!manifest) throw new Error(`missing work ${slug}`);
  return manifest;
}

function series(result: ReturnType<typeof simulateWork>, id: string) {
  const found = result.series.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing series ${id}`);
  return found.values;
}

function attainedMaturity(manifest: ReturnType<typeof work>, requestId: string) {
  const execution = executeWork(manifest, {}, requestId);
  if (execution.run.status !== 'valid') throw new Error(execution.run.failure.message);
  return execution.run.portrait.maturityAssessment.attained;
}

describe('reviewed analytic orbital runtimes', () => {
  it('samples the Kepler ellipse uniformly in mean anomaly and preserves energy', () => {
    const manifest = work('kepler-orbit');
    const result = simulateWork(manifest, {});
    const sweptArea = series(result, 'swept-area');
    const increments = sweptArea.slice(1).map((value, index) => value - sweptArea[index]!);
    const firstIncrement = increments[0];
    if (firstIncrement === undefined) throw new Error('missing swept-area increments');

    expect(Math.max(...increments.map((value) => Math.abs(value - firstIncrement)))).toBeLessThan(
      1e-12,
    );
    expect(result.numerical?.checks.find((check) => check.id === 'energy-residual')?.status).toBe(
      'passed',
    );
    expect(attainedMaturity(manifest, 'kepler-test')).toBe('M2');
  });

  it('joins both Hohmann radii with one continuous tangent half-ellipse', () => {
    const manifest = work('hohmann-transfer');
    const target = manifest.parameters.find((parameter) => parameter.id === 'target')?.default;
    if (target === undefined) throw new Error('missing Hohmann target');
    const result = simulateWork(manifest, {});
    const radii = series(result, 'radius');
    const deltaV = series(result, 'delta-v');

    expect(radii[0]).toBeCloseTo(1, 12);
    expect(radii.at(-1)).toBeCloseTo(target, 12);
    expect(
      Math.max(...radii.slice(1).map((value, index) => Math.abs(value - radii[index]!))),
    ).toBeLessThan(0.02);
    expect(deltaV.at(-1)).toBeGreaterThan(deltaV[0]!);
    expect(attainedMaturity(manifest, 'hohmann-test')).toBe('M2');
  });

  it('uses exact disk-overlap geometry for a symmetric uniform-disk transit', () => {
    const manifest = work('exoplanet-transit');
    const radius = manifest.parameters.find((parameter) => parameter.id === 'radius')?.default;
    if (radius === undefined) throw new Error('missing planet radius');
    const result = simulateWork(manifest, {});
    const flux = series(result, 'flux');
    let maximumSymmetryResidual = 0;
    for (let index = 0; index < flux.length; index += 1) {
      maximumSymmetryResidual = Math.max(
        maximumSymmetryResidual,
        Math.abs(flux[index]! - flux[flux.length - 1 - index]!),
      );
    }

    expect(maximumSymmetryResidual).toBeLessThan(1e-14);
    expect(Math.min(...flux)).toBeCloseTo(1 - radius ** 2, 12);
    expect(attainedMaturity(manifest, 'transit-test')).toBe('M2');
  });
});
