import { describe, expect, it } from 'vitest';
import { works } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';
import { simulateWork } from '../../src/museum/simulation.ts';
import type { WorkManifest, WorkResult } from '../../src/museum/types.ts';

function work(slug: string): WorkManifest {
  const found = works.find((candidate) => candidate.slug === slug);
  if (!found) throw new Error(`Missing test work ${slug}.`);
  return found;
}

function check(result: WorkResult, id: string) {
  const found = result.numerical?.checks.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing numerical check ${id}.`);
  return found;
}

function differs(left: number[], right: number[]): boolean {
  return left.some((value, index) => value !== right[index]);
}

const fieldWorks = [
  'gray-scott',
  'cahn-hilliard',
  'ising-model',
  'shallow-water',
  'wave-equation',
  'heat-diffusion',
  'schrodinger-wave-packet',
  'budyko-sellers',
] as const;

describe('scientific field runtime adapters', () => {
  it.each(fieldWorks)(
    '%s exposes time snapshots of the spatial state rather than treating rows as time',
    (slug) => {
      const result = simulateWork(work(slug), {});
      const field = result.field;
      const frames = result.numerical?.fieldFrames;
      const provenance = result.numerical?.provenance;
      if (!field || !frames || !provenance) throw new Error(`${slug} has no scientific field.`);

      expect(frames).toHaveLength(result.times.length);
      expect(frames.length).toBeGreaterThan(1);
      expect(frames.length).not.toBe(field.rows);
      expect(provenance.interval).toEqual([result.times[0], result.times.at(-1)]);
      expect(provenance.grid?.shape).toEqual([field.rows, field.columns]);
      expect(provenance.boundaryConditions?.length).toBeGreaterThan(0);

      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        if (!frame) throw new Error(`${slug} is missing frame ${index}.`);
        expect(frame.time).toBe(result.times[index]);
        expect(frame.shape).toEqual([field.rows, field.columns]);
        for (const values of Object.values(frame.components)) {
          expect(values).toHaveLength(field.rows * field.columns);
          expect(values.every(Number.isFinite)).toBe(true);
        }
      }

      const componentId = field.componentId;
      if (!componentId) throw new Error(`${slug} has no displayed scientific component id.`);
      const firstValues = frames[0]?.components[componentId];
      const finalValues = frames.at(-1)?.components[componentId];
      if (!firstValues || !finalValues) {
        throw new Error(`${slug} does not expose component ${componentId} in every field frame.`);
      }
      expect(field.values).toEqual(finalValues);
      expect(
        frames.some((frame) => differs(frame.components[componentId] ?? [], firstValues)),
      ).toBe(true);
    },
    20_000,
  );

  it('reports the governing numerical constraints without promoting observations to passes', () => {
    const grayScott = simulateWork(work('gray-scott'), {});
    expect(check(grayScott, 'cfl-condition').status).toBe('passed');
    expect(check(grayScott, 'positivity').status).toBe('passed');
    expect(check(grayScott, 'boundary-residual').status).toBe('passed');

    const cahnHilliard = simulateWork(work('cahn-hilliard'), {});
    expect(check(cahnHilliard, 'mass-balance').status).toBe('passed');
    expect(check(cahnHilliard, 'energy-residual').status).toBe('passed');
    expect(check(cahnHilliard, 'boundary-residual').status).toBe('passed');

    const shallowWater = simulateWork(work('shallow-water'), {});
    expect(check(shallowWater, 'cfl-condition').status).toBe('passed');
    expect(check(shallowWater, 'mass-balance').status).toBe('passed');
    expect(check(shallowWater, 'energy-residual').status).toBe('not-run');
    expect(check(shallowWater, 'boundary-residual').status).toBe('passed');
  }, 20_000);

  it('replays the complete Ising field trajectory from the recorded seed', () => {
    const first = simulateWork(work('ising-model'), {});
    const second = simulateWork(work('ising-model'), {});

    expect(first.numerical?.provenance.random).toMatchObject({
      algorithm: 'mulberry32-v1',
      seed: '1597463007',
      sampleSchedule: 'checkerboard Metropolis sweeps',
    });
    expect(first.times).toEqual(second.times);
    expect(first.series).toEqual(second.series);
    expect(first.numerical?.fieldFrames).toEqual(second.numerical?.fieldFrames);
    expect(first.numerical?.checks.some((candidate) => candidate.id === 'seeded-replay')).toBe(
      false,
    );
    expect(check(first, 'boundary-residual').status).toBe('passed');
    expect(check(first, 'spin-domain').status).toBe('passed');

    const execution = executeWork(work('ising-model'), {}, 'seeded-replay-audit');
    expect(execution.run.status).toBe('valid');
    if (execution.run.status === 'valid') {
      const replay = execution.run.claimAssessments.find(
        (candidate) => candidate.id === 'seeded-replay',
      );
      expect(replay?.status).toBe('passed');
      expect(replay?.message).toMatch(/second sampler execution.*reproduced/i);
    }
  }, 15_000);

  it('distinguishes closed-form field evaluation from numerical relaxation in provenance', () => {
    for (const slug of ['wave-equation', 'heat-diffusion', 'schrodinger-wave-packet']) {
      const result = simulateWork(work(slug), {});
      expect(result.numerical?.provenance.execution.kind).toBe('analytic-evaluator');
      expect(check(result, 'grid-refinement').status).toBe('passed');
    }

    const budykoSellers = simulateWork(work('budyko-sellers'), {});
    expect(budykoSellers.numerical?.provenance.execution.kind).toBe('numerical-solver');
    expect(check(budykoSellers, 'grid-refinement').status).toBe('passed');
    expect(check(budykoSellers, 'equilibrium-residual').status).toBe('passed');
    expect(check(budykoSellers, 'boundary-residual').status).toBe('passed');
  }, 20_000);
});
