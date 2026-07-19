import { describe, expect, it } from 'vitest';
import { runOptionalAnalyzers } from '../../src/museum/analyzers.ts';
import { works } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';
import type { RunPayload } from '../../src/museum/portrait-types.ts';

function portrait(kernel: string) {
  const work = works.find((candidate) => candidate.kernel === kernel);
  if (!work || work.schemaVersion !== 2) throw new Error(`${kernel} portrait missing.`);
  return work.portrait;
}

describe('capability-gated scientific analyzers', () => {
  it('reports finite recurrence and empirical occupancy without claiming invariance', () => {
    const times = Array.from({ length: 240 }, (_, index) => index * 0.05);
    const payload: RunPayload = {
      kind: 'trajectory',
      times,
      observables: [
        { id: 'x', label: 'x', unit: '1', values: times.map((time) => Math.sin(time)) },
        { id: 'y', label: 'y', unit: '1', values: times.map((time) => Math.cos(time)) },
      ],
    };
    const output = runOptionalAnalyzers(payload, portrait('lorenz'));
    expect(output.objects.some((object) => object.kind === 'empirical-measure')).toBe(true);
    expect(output.objects.some((object) => object.kind === 'recurrence')).toBe(true);
    expect(output.objects.flatMap((object) => object.limitations).join(' ')).toContain('Finite');
  });

  it('returns a DMD mode only with a passing held-out residual', () => {
    const times = Array.from({ length: 180 }, (_, index) => index * 0.1);
    const payload: RunPayload = {
      kind: 'trajectory',
      times,
      observables: [
        { id: 'q', label: 'q', unit: '1', values: times.map((time) => Math.cos(time)) },
        { id: 'p', label: 'p', unit: '1', values: times.map((time) => -Math.sin(time)) },
      ],
    };
    const output = runOptionalAnalyzers(payload, portrait('fput'));
    expect(output.checks.find((check) => check.id === 'dmd-holdout-residual')?.status).toBe(
      'passed',
    );
    expect(output.objects.some((object) => object.kind === 'dmd-mode')).toBe(true);
  });

  it('does not manufacture a spectral object from insufficient data', () => {
    const payload: RunPayload = {
      kind: 'trajectory',
      times: [0, 1, 2],
      observables: [{ id: 'q', label: 'q', unit: '1', values: [0, 1, 0] }],
    };
    expect(runOptionalAnalyzers(payload, portrait('fput')).objects).toEqual([]);
  });

  it('emits a finite-resolution Morse graph only when multiple recurrent box components exist', () => {
    const times = Array.from({ length: 220 }, (_, index) => index);
    const x = times.map((_, index) =>
      index < 110 ? (index % 2 === 0 ? -1 : -0.8) : index % 2 === 0 ? 0.8 : 1,
    );
    const y = times.map((_, index) =>
      index < 110 ? (index % 4 < 2 ? -1 : -0.8) : index % 4 < 2 ? 0.8 : 1,
    );
    const payload: RunPayload = {
      kind: 'trajectory',
      times,
      observables: [
        { id: 'x', label: 'x', unit: '1', values: x },
        { id: 'y', label: 'y', unit: '1', values: y },
      ],
    };
    const output = runOptionalAnalyzers(payload, portrait('lorenz'));
    const graph = output.objects.find((object) => object.kind === 'morse-graph');
    expect(graph?.artifact?.kind).toBe('morse-graph');
    expect(graph?.limitations.join(' ')).toContain('Finite-resolution');
  });

  it('estimates an interface only for an opted-in field with sign changes', () => {
    const payload: RunPayload = {
      kind: 'field-trajectory',
      times: [0],
      frames: [
        {
          time: 0,
          shape: [4, 4],
          components: { phi: [-1, -1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1, 1, 1, -1, -1] },
          coordinates: { names: ['y', 'x'], spacing: [1, 1] },
        },
      ],
      observables: [],
    };
    const output = runOptionalAnalyzers(payload, portrait('cahn-hilliard'));
    expect(output.objects).toContainEqual(
      expect.objectContaining({ kind: 'interface', id: 'grid-interface-estimate' }),
    );
    expect(output.checks).toContainEqual(
      expect.objectContaining({ id: 'finite-grid-h0-persistence', status: 'passed' }),
    );
  });

  it('integrates finite EDMD evidence into the reviewed FPUT execution', () => {
    const work = works.find((candidate) => candidate.slug === 'fput-chain');
    if (!work) throw new Error('FPUT work is missing.');
    const execution = executeWork(
      work,
      Object.fromEntries(work.parameters.map((parameter) => [parameter.id, parameter.default])),
      'fput-edmd-integration',
    );
    expect(execution.run.status).toBe('valid');
    if (execution.run.status !== 'valid') return;
    expect(execution.run.claimAssessments).toContainEqual(
      expect.objectContaining({ id: 'dmd-holdout-residual', status: 'passed' }),
    );
    expect(execution.run.portrait.objects).toContainEqual(
      expect.objectContaining({ kind: 'dmd-mode' }),
    );
  }, 30_000);

  it('runs finite-grid H0 evidence on the computed Cahn–Hilliard field', () => {
    const work = works.find((candidate) => candidate.slug === 'cahn-hilliard');
    if (!work) throw new Error('Cahn–Hilliard work is missing.');
    const execution = executeWork(
      work,
      Object.fromEntries(work.parameters.map((parameter) => [parameter.id, parameter.default])),
      'cahn-persistence-integration',
    );
    expect(execution.run.status).toBe('valid');
    if (execution.run.status !== 'valid') return;
    expect(execution.run.claimAssessments).toContainEqual(
      expect.objectContaining({ id: 'finite-grid-h0-persistence', status: 'passed' }),
    );
  });
});
