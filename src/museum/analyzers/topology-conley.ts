/**
 * Finite computational-topology helpers for optional portrait evidence.
 *
 * These routines make exact statements about the supplied finite data. They do
 * not promote samples to continuum topology, or a transition graph to a
 * rigorous Conley index, without separately supplied enclosure evidence.
 */

export const MAX_TOPOLOGY_CELLS = 65_536;
export const MAX_TRANSITION_EDGES = 262_144;

export type TopologyFailureCode =
  | 'invalid-shape'
  | 'invalid-value'
  | 'invalid-option'
  | 'size-limit'
  | 'duplicate-cell'
  | 'unknown-cell'
  | 'invalid-enclosure'
  | 'invalid-certificate';

export interface TopologyFailure {
  status: 'failed';
  code: TopologyFailureCode;
  message: string;
}

export interface ScalarGridFiltrationInput {
  values: readonly number[];
  shape: readonly [rows: number, columns: number];
  filtration: 'sublevel' | 'superlevel';
  connectivity: 4 | 8;
  boundary: 'open' | 'periodic';
  minPersistence?: number;
}

export interface PersistencePair0 {
  birthCell: number;
  deathCell: number | null;
  birthLevel: number;
  deathLevel: number | null;
  /** Null denotes the essential component of the finite filtration. */
  persistence: number | null;
}

export interface Persistence0Result {
  status: 'computed';
  dimension: 0;
  pairs: PersistencePair0[];
  provenance: {
    method: 'lower-star-union-find';
    filtration: 'sublevel' | 'superlevel';
    shape: readonly [number, number];
    connectivity: 4 | 8;
    boundary: 'open' | 'periodic';
    cellCount: number;
    minPersistence: number;
    evidenceLevel: 'exact-for-supplied-finite-grid';
  };
  limitations: string[];
}

export type Persistence0Analysis = Persistence0Result | TopologyFailure;

export interface ArtifactDigest {
  algorithm: 'sha256';
  value: string;
}

function failure(code: TopologyFailureCode, message: string): TopologyFailure {
  return { status: 'failed', code, message };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function gridNeighbors(
  index: number,
  rows: number,
  columns: number,
  connectivity: 4 | 8,
  boundary: 'open' | 'periodic',
): number[] {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const offsets =
    connectivity === 4
      ? [
          [-1, 0],
          [0, -1],
          [0, 1],
          [1, 0],
        ]
      : [
          [-1, -1],
          [-1, 0],
          [-1, 1],
          [0, -1],
          [0, 1],
          [1, -1],
          [1, 0],
          [1, 1],
        ];
  const result = new Set<number>();
  for (const [rowOffset, columnOffset] of offsets) {
    if (rowOffset === undefined || columnOffset === undefined) continue;
    let candidateRow = row + rowOffset;
    let candidateColumn = column + columnOffset;
    if (boundary === 'periodic') {
      candidateRow = (candidateRow + rows) % rows;
      candidateColumn = (candidateColumn + columns) % columns;
    } else if (
      candidateRow < 0 ||
      candidateRow >= rows ||
      candidateColumn < 0 ||
      candidateColumn >= columns
    ) {
      continue;
    }
    const candidate = candidateRow * columns + candidateColumn;
    if (candidate !== index) result.add(candidate);
  }
  return [...result].sort((left, right) => left - right);
}

/** Compute H0 persistence of a vertex-valued rectangular grid filtration. */
export function analyzeZeroDimensionalPersistence(
  input: ScalarGridFiltrationInput,
): Persistence0Analysis {
  const [rows, columns] = input.shape;
  if (!isPositiveInteger(rows) || !isPositiveInteger(columns)) {
    return failure('invalid-shape', 'Grid rows and columns must be positive integers.');
  }
  const cellCount = rows * columns;
  if (!Number.isSafeInteger(cellCount) || cellCount > MAX_TOPOLOGY_CELLS) {
    return failure(
      'size-limit',
      `Grid contains ${cellCount} cells; the browser limit is ${MAX_TOPOLOGY_CELLS}.`,
    );
  }
  if (input.values.length !== cellCount) {
    return failure(
      'invalid-shape',
      `Grid shape requires ${cellCount} values, received ${input.values.length}.`,
    );
  }
  const invalidIndex = input.values.findIndex((value) => !Number.isFinite(value));
  if (invalidIndex >= 0) {
    return failure('invalid-value', `Grid value ${invalidIndex} is non-finite.`);
  }
  const minPersistence = input.minPersistence ?? 0;
  if (!Number.isFinite(minPersistence) || minPersistence < 0) {
    return failure('invalid-option', 'minPersistence must be finite and nonnegative.');
  }

  const score = (index: number): number => {
    const value = input.values[index];
    if (value === undefined) throw new Error(`Validated grid value ${index} is missing.`);
    return input.filtration === 'sublevel' ? value : -value;
  };
  const order = Array.from({ length: cellCount }, (_, index) => index).sort(
    (left, right) => score(left) - score(right) || left - right,
  );
  const parent = Array.from({ length: cellCount }, (_, index) => index);
  const birthCell = Array.from({ length: cellCount }, (_, index) => index);
  const active = new Uint8Array(cellCount);
  const pairs: PersistencePair0[] = [];

  const find = (start: number): number => {
    let root = start;
    while (parent[root] !== root) {
      const next = parent[root];
      if (next === undefined) throw new Error('Union-find parent is missing.');
      root = next;
    }
    let cursor = start;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor];
      if (next === undefined) throw new Error('Union-find compression parent is missing.');
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  const olderRoot = (left: number, right: number): readonly [number, number] => {
    const leftBirth = birthCell[left];
    const rightBirth = birthCell[right];
    if (leftBirth === undefined || rightBirth === undefined) {
      throw new Error('Union-find birth cell is missing.');
    }
    const difference = score(leftBirth) - score(rightBirth);
    return difference < 0 || (difference === 0 && leftBirth < rightBirth)
      ? [left, right]
      : [right, left];
  };

  for (const cell of order) {
    active[cell] = 1;
    for (const neighbor of gridNeighbors(cell, rows, columns, input.connectivity, input.boundary)) {
      if (active[neighbor] === 0) continue;
      const cellRoot = find(cell);
      const neighborRoot = find(neighbor);
      if (cellRoot === neighborRoot) continue;
      const [survivor, dying] = olderRoot(cellRoot, neighborRoot);
      const dyingBirthCell = birthCell[dying];
      if (dyingBirthCell === undefined) throw new Error('Dying component has no birth cell.');
      const persistence = Math.max(0, score(cell) - score(dyingBirthCell));
      if (persistence >= minPersistence) {
        pairs.push({
          birthCell: dyingBirthCell,
          deathCell: cell,
          birthLevel: input.values[dyingBirthCell]!,
          deathLevel: input.values[cell]!,
          persistence,
        });
      }
      parent[dying] = survivor;
    }
  }

  const roots = new Set<number>();
  for (let index = 0; index < cellCount; index += 1) roots.add(find(index));
  for (const root of [...roots].sort((left, right) => left - right)) {
    const essentialBirth = birthCell[root];
    if (essentialBirth === undefined) throw new Error('Essential component has no birth cell.');
    pairs.push({
      birthCell: essentialBirth,
      deathCell: null,
      birthLevel: input.values[essentialBirth]!,
      deathLevel: null,
      persistence: null,
    });
  }
  pairs.sort((left, right) => {
    const leftPersistence = left.persistence ?? Number.POSITIVE_INFINITY;
    const rightPersistence = right.persistence ?? Number.POSITIVE_INFINITY;
    return rightPersistence - leftPersistence || left.birthCell - right.birthCell;
  });

  return {
    status: 'computed',
    dimension: 0,
    pairs,
    provenance: {
      method: 'lower-star-union-find',
      filtration: input.filtration,
      shape: [rows, columns],
      connectivity: input.connectivity,
      boundary: input.boundary,
      cellCount,
      minPersistence,
      evidenceLevel: 'exact-for-supplied-finite-grid',
    },
    limitations: [
      'The pairs are exact for the supplied finite vertex filtration, not for an unknown continuum field.',
      'Only zero-dimensional persistence is computed; loops, voids, and a Morse–Smale complex are not inferred.',
      'Results depend on grid resolution, connectivity, boundary convention, and scalar filtration.',
    ],
  };
}

export interface FiniteTransitionEnclosure {
  cells: readonly string[];
  edges: ReadonlyArray<readonly [source: string, target: string]>;
  neighborhood: readonly string[];
  boundaryCells: readonly string[];
  evidence:
    | {
        kind: 'sampled-transitions';
        sourceRef: string;
        contentHash: ArtifactDigest;
        samplingInterval: number;
      }
    | {
        kind: 'interval-outer-approximation';
        sourceRef: string;
        contentHash: ArtifactDigest;
        intervalMethod: string;
        coverageVerified: boolean;
      };
  externalIndexCertificate?: {
    sourceRef: string;
    contentHash: ArtifactDigest;
    method: 'cubical-homology' | 'simplicial-homology';
    coefficientField: string;
    homologyRanks: readonly number[];
    indexPairVerified: boolean;
  };
}

export interface FiniteMorseSet {
  id: string;
  cells: string[];
}

export interface FiniteConleyResult {
  status: 'computed';
  invariantCells: string[];
  recurrentCells: string[];
  exitCells: string[];
  isolation: {
    status: 'established-for-finite-enclosure' | 'not-established';
    boundaryIntersections: string[];
  };
  morse: {
    sets: FiniteMorseSet[];
    orderEdges: Array<readonly [source: string, target: string]>;
  };
  conleyIndex:
    | {
        status: 'not-established';
        reason: string;
      }
    | {
        status: 'externally-certified';
        sourceRef: string;
        contentHash: ArtifactDigest;
        method: 'cubical-homology' | 'simplicial-homology';
        coefficientField: string;
        homologyRanks: number[];
      };
  provenance: {
    evidenceKind: FiniteTransitionEnclosure['evidence']['kind'];
    sourceRef: string;
    contentHash: ArtifactDigest;
    cellCount: number;
    edgeCount: number;
    neighborhoodSize: number;
    evidenceLevel:
      'observed-finite-transition-graph' | 'caller-attested-interval-outer-approximation';
  };
  limitations: string[];
}

export type FiniteConleyAnalysis = FiniteConleyResult | TopologyFailure;

function stronglyConnectedComponents(graph: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string) => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of graph.get(node) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(target)!));
      }
    }
    if (lowLinks.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    component.sort();
    components.push(component);
  };
  for (const node of [...graph.keys()].sort()) if (!indices.has(node)) visit(node);
  return components.sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
}

function validDigest(digest: ArtifactDigest): boolean {
  return digest.algorithm === 'sha256' && /^[0-9a-f]{64}$/.test(digest.value);
}

function reachable(
  starts: Iterable<string>,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const result = new Set<string>();
  const queue = [...starts].sort();
  for (const start of queue) result.add(start);
  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    if (source === undefined) continue;
    for (const target of [...(graph.get(source) ?? [])].sort()) {
      if (result.has(target)) continue;
      result.add(target);
      queue.push(target);
    }
  }
  return result;
}

/** Analyze the maximal invariant part of a supplied finite directed enclosure. */
export function analyzeFiniteTransitionEnclosure(
  input: FiniteTransitionEnclosure,
): FiniteConleyAnalysis {
  if (input.cells.length === 0) return failure('invalid-shape', 'At least one cell is required.');
  if (input.cells.length > MAX_TOPOLOGY_CELLS || input.edges.length > MAX_TRANSITION_EDGES) {
    return failure(
      'size-limit',
      `Finite enclosure exceeds ${MAX_TOPOLOGY_CELLS} cells or ${MAX_TRANSITION_EDGES} edges.`,
    );
  }
  const universe = new Set(input.cells);
  if (universe.size !== input.cells.length || input.cells.some((cell) => cell.length === 0)) {
    return failure('duplicate-cell', 'Cell identifiers must be unique, non-empty strings.');
  }
  const neighborhood = new Set(input.neighborhood);
  if (
    neighborhood.size !== input.neighborhood.length ||
    input.neighborhood.some((cell) => !universe.has(cell))
  ) {
    return failure('unknown-cell', 'Neighborhood cells must be unique members of cells.');
  }
  const boundary = new Set(input.boundaryCells);
  if (
    boundary.size !== input.boundaryCells.length ||
    input.boundaryCells.some((cell) => !neighborhood.has(cell))
  ) {
    return failure('unknown-cell', 'Boundary cells must be unique members of the neighborhood.');
  }
  if (input.evidence.kind === 'sampled-transitions') {
    if (
      !Number.isFinite(input.evidence.samplingInterval) ||
      input.evidence.samplingInterval <= 0 ||
      input.evidence.sourceRef.length === 0 ||
      !validDigest(input.evidence.contentHash)
    ) {
      return failure(
        'invalid-enclosure',
        'Sampled evidence requires a positive interval, source, and lowercase SHA-256 digest.',
      );
    }
  } else if (
    input.evidence.sourceRef.length === 0 ||
    input.evidence.intervalMethod.length === 0 ||
    !validDigest(input.evidence.contentHash)
  ) {
    return failure(
      'invalid-enclosure',
      'Interval evidence requires method, source, and lowercase SHA-256 metadata.',
    );
  }
  for (const [source, target] of input.edges) {
    if (!universe.has(source) || !universe.has(target)) {
      return failure(
        'unknown-cell',
        `Transition ${source} -> ${target} references an unknown cell.`,
      );
    }
  }

  const graph = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  for (const cell of [...neighborhood].sort()) {
    graph.set(cell, new Set());
    reverse.set(cell, new Set());
  }
  const exitCells = new Set<string>();
  for (const [source, target] of input.edges) {
    if (!neighborhood.has(source)) continue;
    if (!neighborhood.has(target)) {
      exitCells.add(source);
      continue;
    }
    graph.get(source)!.add(target);
    reverse.get(target)!.add(source);
  }

  const components = stronglyConnectedComponents(graph);
  const recurrentComponents = components.filter(
    (component) =>
      component.length > 1 ||
      (component[0] !== undefined && graph.get(component[0])?.has(component[0])),
  );
  const recurrentCells = recurrentComponents.flat().sort();
  const forward = reachable(recurrentCells, graph);
  const backward = reachable(recurrentCells, reverse);
  const invariantCells = [...forward].filter((cell) => backward.has(cell)).sort();
  const invariantSet = new Set(invariantCells);
  const boundaryIntersections = invariantCells.filter((cell) => boundary.has(cell));
  const intervalCoverage =
    input.evidence.kind === 'interval-outer-approximation' && input.evidence.coverageVerified;
  const isolatedForFiniteEnclosure = boundaryIntersections.length === 0;

  const morseSets = recurrentComponents
    .map((cells, index) => ({ id: `M${index + 1}`, cells: [...cells].sort() }))
    .filter((morseSet) => morseSet.cells.some((cell) => invariantSet.has(cell)));
  const owner = new Map<string, string>();
  for (const morseSet of morseSets) for (const cell of morseSet.cells) owner.set(cell, morseSet.id);
  const orderEdges = new Set<string>();
  for (const sourceSet of morseSets) {
    const descendants = reachable(sourceSet.cells, graph);
    for (const cell of descendants) {
      const targetSet = owner.get(cell);
      if (targetSet && targetSet !== sourceSet.id)
        orderEdges.add(`${sourceSet.id}\u0000${targetSet}`);
    }
  }

  let conleyIndex: FiniteConleyResult['conleyIndex'];
  const certificate = input.externalIndexCertificate;
  if (certificate) {
    const validRanks =
      certificate.homologyRanks.length > 0 &&
      certificate.homologyRanks.every((rank) => Number.isInteger(rank) && rank >= 0);
    if (
      certificate.sourceRef.length === 0 ||
      certificate.coefficientField.length === 0 ||
      !validRanks ||
      !validDigest(certificate.contentHash)
    ) {
      return failure('invalid-certificate', 'External index certificate metadata is invalid.');
    }
    if (!intervalCoverage || !isolatedForFiniteEnclosure || !certificate.indexPairVerified) {
      return failure(
        'invalid-certificate',
        'An external Conley index requires verified interval coverage, isolation, and a verified index pair.',
      );
    }
    conleyIndex = {
      status: 'externally-certified',
      sourceRef: certificate.sourceRef,
      contentHash: certificate.contentHash,
      method: certificate.method,
      coefficientField: certificate.coefficientField,
      homologyRanks: [...certificate.homologyRanks],
    };
  } else {
    conleyIndex = {
      status: 'not-established',
      reason: intervalCoverage
        ? 'The finite enclosure is eligible for an index-pair computation, but no verified index certificate was supplied.'
        : 'Sampled or unverified transitions cannot establish a Conley index.',
    };
  }

  return {
    status: 'computed',
    invariantCells,
    recurrentCells,
    exitCells: [...exitCells].sort(),
    isolation: {
      status:
        intervalCoverage && isolatedForFiniteEnclosure
          ? 'established-for-finite-enclosure'
          : 'not-established',
      boundaryIntersections,
    },
    morse: {
      sets: morseSets,
      orderEdges: [...orderEdges].sort().map((edge) => edge.split('\u0000') as [string, string]),
    },
    conleyIndex,
    provenance: {
      evidenceKind: input.evidence.kind,
      sourceRef: input.evidence.sourceRef,
      contentHash: input.evidence.contentHash,
      cellCount: input.cells.length,
      edgeCount: input.edges.length,
      neighborhoodSize: neighborhood.size,
      evidenceLevel:
        input.evidence.kind === 'sampled-transitions'
          ? 'observed-finite-transition-graph'
          : 'caller-attested-interval-outer-approximation',
    },
    limitations: [
      'Finite Morse sets are strongly connected components of the supplied relation, not a Morse–Smale complex.',
      'Isolation is established only for a declared, coverage-verified finite enclosure.',
      'A Conley index is never inferred from sampled transitions or from graph cycles alone.',
    ],
  };
}
