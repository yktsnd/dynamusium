import { describe, expect, it } from 'vitest';
import {
  analyzeFiniteTransitionEnclosure,
  analyzeZeroDimensionalPersistence,
} from '../../src/museum/analyzers/topology-conley.ts';

const enclosureHash = { algorithm: 'sha256', value: '0'.repeat(64) } as const;
const certificateHash = { algorithm: 'sha256', value: '1'.repeat(64) } as const;

describe('finite computational-topology analyzers', () => {
  it('computes deterministic H0 persistence for a supplied scalar grid', () => {
    const result = analyzeZeroDimensionalPersistence({
      values: [0, 2, 1, 2, 0],
      shape: [1, 5],
      filtration: 'sublevel',
      connectivity: 4,
      boundary: 'open',
    });

    expect(result.status).toBe('computed');
    if (result.status !== 'computed') return;
    expect(result.provenance.evidenceLevel).toBe('exact-for-supplied-finite-grid');
    expect(result.pairs.filter((pair) => pair.persistence === null)).toHaveLength(1);
    expect(Math.max(...result.pairs.flatMap((pair) => pair.persistence ?? []))).toBe(2);
    expect(result.limitations.join(' ')).toContain('zero-dimensional');
  });

  it('supports superlevel filtration and an explicit persistence threshold', () => {
    const result = analyzeZeroDimensionalPersistence({
      values: [3, 0, 2, 0, 3],
      shape: [1, 5],
      filtration: 'superlevel',
      connectivity: 4,
      boundary: 'open',
      minPersistence: 1,
    });

    expect(result.status).toBe('computed');
    if (result.status !== 'computed') return;
    expect(result.pairs.every((pair) => pair.persistence === null || pair.persistence >= 1)).toBe(
      true,
    );
    expect(result.provenance.filtration).toBe('superlevel');
  });

  it('returns a typed failure for non-finite or mismatched field data', () => {
    expect(
      analyzeZeroDimensionalPersistence({
        values: [0, Number.NaN],
        shape: [1, 2],
        filtration: 'sublevel',
        connectivity: 4,
        boundary: 'open',
      }),
    ).toMatchObject({ status: 'failed', code: 'invalid-value' });
    expect(
      analyzeZeroDimensionalPersistence({
        values: [0],
        shape: [2, 2],
        filtration: 'sublevel',
        connectivity: 4,
        boundary: 'open',
      }),
    ).toMatchObject({ status: 'failed', code: 'invalid-shape' });
  });
});

describe('finite transition enclosure and Conley evidence boundary', () => {
  it('finds invariant cells, exit cells, and isolation in a verified outer enclosure', () => {
    const result = analyzeFiniteTransitionEnclosure({
      cells: ['left', 'core', 'right', 'outside'],
      neighborhood: ['left', 'core', 'right'],
      boundaryCells: ['left', 'right'],
      edges: [
        ['left', 'outside'],
        ['core', 'core'],
        ['right', 'outside'],
      ],
      evidence: {
        kind: 'interval-outer-approximation',
        sourceRef: 'sha256:finite-enclosure',
        contentHash: enclosureHash,
        intervalMethod: 'directed interval image bounds',
        coverageVerified: true,
      },
    });

    expect(result.status).toBe('computed');
    if (result.status !== 'computed') return;
    expect(result.invariantCells).toEqual(['core']);
    expect(result.exitCells).toEqual(['left', 'right']);
    expect(result.isolation.status).toBe('established-for-finite-enclosure');
    expect(result.conleyIndex.status).toBe('not-established');
  });

  it('builds a finite Morse graph but refuses a Conley claim from sampled transitions', () => {
    const result = analyzeFiniteTransitionEnclosure({
      cells: ['a', 'bridge', 'b'],
      neighborhood: ['a', 'bridge', 'b'],
      boundaryCells: [],
      edges: [
        ['a', 'a'],
        ['a', 'bridge'],
        ['bridge', 'b'],
        ['b', 'b'],
      ],
      evidence: {
        kind: 'sampled-transitions',
        sourceRef: 'trajectory:example',
        contentHash: enclosureHash,
        samplingInterval: 0.1,
      },
    });

    expect(result.status).toBe('computed');
    if (result.status !== 'computed') return;
    expect(result.morse.sets).toHaveLength(2);
    expect(result.morse.orderEdges).toEqual([['M1', 'M2']]);
    expect(result.conleyIndex).toMatchObject({ status: 'not-established' });
    expect(result.isolation.status).toBe('not-established');
  });

  it('accepts an external index only behind verified enclosure and index-pair evidence', () => {
    const result = analyzeFiniteTransitionEnclosure({
      cells: ['boundary', 'core'],
      neighborhood: ['boundary', 'core'],
      boundaryCells: ['boundary'],
      edges: [['core', 'core']],
      evidence: {
        kind: 'interval-outer-approximation',
        sourceRef: 'artifact:enclosure',
        contentHash: enclosureHash,
        intervalMethod: 'interval Taylor model',
        coverageVerified: true,
      },
      externalIndexCertificate: {
        sourceRef: 'artifact:index-pair',
        contentHash: certificateHash,
        method: 'cubical-homology',
        coefficientField: 'F2',
        homologyRanks: [1, 0],
        indexPairVerified: true,
      },
    });

    expect(result.status).toBe('computed');
    if (result.status !== 'computed') return;
    expect(result.conleyIndex).toEqual({
      status: 'externally-certified',
      sourceRef: 'artifact:index-pair',
      contentHash: certificateHash,
      method: 'cubical-homology',
      coefficientField: 'F2',
      homologyRanks: [1, 0],
    });
  });

  it('rejects a certificate attached to sampled transitions', () => {
    const result = analyzeFiniteTransitionEnclosure({
      cells: ['core'],
      neighborhood: ['core'],
      boundaryCells: [],
      edges: [['core', 'core']],
      evidence: {
        kind: 'sampled-transitions',
        sourceRef: 'trajectory:example',
        contentHash: enclosureHash,
        samplingInterval: 1,
      },
      externalIndexCertificate: {
        sourceRef: 'artifact:index-pair',
        contentHash: certificateHash,
        method: 'cubical-homology',
        coefficientField: 'F2',
        homologyRanks: [1],
        indexPairVerified: true,
      },
    });

    expect(result).toMatchObject({ status: 'failed', code: 'invalid-certificate' });
  });

  it('rejects non-content-addressed enclosure evidence', () => {
    const result = analyzeFiniteTransitionEnclosure({
      cells: ['core'],
      neighborhood: ['core'],
      boundaryCells: [],
      edges: [['core', 'core']],
      evidence: {
        kind: 'sampled-transitions',
        sourceRef: 'trajectory:example',
        contentHash: { algorithm: 'sha256', value: 'not-a-digest' },
        samplingInterval: 1,
      },
    });

    expect(result).toMatchObject({ status: 'failed', code: 'invalid-enclosure' });
  });
});
