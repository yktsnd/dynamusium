import type {
  PortraitManifestExtension,
  RunCheckResult,
  RunPayload,
  ScientificObject,
} from './portrait-types.ts';
import { analyzeFiniteEdmd, EDMD_BROWSER_LIMITS } from './analyzers/koopman-edmd.ts';
import { analyzeZeroDimensionalPersistence } from './analyzers/topology-conley.ts';

export interface AnalyzerOutput {
  objects: ScientificObject[];
  checks: RunCheckResult[];
}

function emptyOutput(): AnalyzerOutput {
  return { objects: [], checks: [] };
}

function merge(outputs: AnalyzerOutput[]): AnalyzerOutput {
  return {
    objects: outputs.flatMap((output) => output.objects),
    checks: outputs.flatMap((output) => output.checks),
  };
}

function trajectoryPayload(payload: RunPayload) {
  return payload.kind === 'trajectory' ? payload : null;
}

function requiredValue(values: readonly number[], index: number, context: string): number {
  const value = values[index];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`${context}[${index}] is missing or non-finite.`);
  }
  return value;
}

function recurrenceAndMeasure(
  payload: RunPayload,
  extension: PortraitManifestExtension,
): AnalyzerOutput {
  const trajectory = trajectoryPayload(payload);
  if (!trajectory || trajectory.times.length < 64) return emptyOutput();
  const selected = trajectory.observables.slice(0, Math.min(3, trajectory.observables.length));
  if (selected.length === 0) return emptyOutput();
  const start = Math.floor(trajectory.times.length * 0.2);
  const available = trajectory.times.length - start;
  const stride = Math.max(1, Math.floor(available / 400));
  const samples: number[][] = [];
  const ranges = selected.map((observable) => {
    const values = observable.values.slice(start);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return { minimum, span: Math.max(Number.EPSILON, maximum - minimum) };
  });
  for (let index = start; index < trajectory.times.length; index += stride) {
    samples.push(
      selected.map((observable, coordinate) => {
        const range = ranges[coordinate];
        if (!range) throw new Error(`Recurrence range ${coordinate} is missing.`);
        return (
          (requiredValue(observable.values, index, observable.id) - range.minimum) / range.span
        );
      }),
    );
  }
  if (samples.length < 32) return emptyOutput();
  const epsilon = 0.08;
  let recurrentPairs = 0;
  let comparedPairs = 0;
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 3; right < samples.length; right += 1) {
      const distance = Math.sqrt(
        (() => {
          const leftSample = samples[left];
          const rightSample = samples[right];
          if (!leftSample || !rightSample || leftSample.length !== rightSample.length) {
            throw new Error('Recurrence samples have inconsistent dimensions.');
          }
          return leftSample.reduce((sum, value, coordinate) => {
            const comparison = rightSample[coordinate];
            if (comparison === undefined) throw new Error('Recurrence coordinate is missing.');
            const difference = value - comparison;
            return sum + difference * difference;
          }, 0);
        })(),
      );
      if (distance <= epsilon) recurrentPairs += 1;
      comparedPairs += 1;
    }
  }
  const recurrenceRate = comparedPairs === 0 ? 0 : recurrentPairs / comparedPairs;
  const check: RunCheckResult = {
    id: 'recurrence-rate',
    status: Number.isFinite(recurrenceRate) ? 'passed' : 'failed',
    severity: 'claim',
    metrics: [{ id: 'epsilon-recurrence-rate', value: recurrenceRate, unit: 'fraction' }],
    message: `Finite-sample recurrence rate at normalized radius ${epsilon}; no infinite-time recurrence is inferred.`,
  };
  const objects: ScientificObject[] = [];
  if (extension.science.capabilities.includes('empirical-measure')) {
    objects.push({
      id: 'empirical-occupancy-measure',
      kind: 'empirical-measure',
      dataRefs: selected.map((observable) => observable.id),
      evidenceCheckIds: [check.id],
      limitations: [
        'Finite post-transient occupancy sample; invariance and ergodicity are not assumed.',
      ],
    });
  }
  if (
    extension.science.capabilities.includes('recurrence') &&
    recurrenceRate > 0 &&
    recurrenceRate < 0.5
  ) {
    objects.push({
      id: 'finite-recurrence-statistic',
      kind: 'recurrence',
      dataRefs: selected.map((observable) => observable.id),
      evidenceCheckIds: [check.id],
      limitations: [
        'Thresholded finite-sample statistic, not chain recurrence or a proof of periodicity.',
      ],
    });
  }
  return { objects, checks: [check] };
}

function twoDimensionalDmd(
  payload: RunPayload,
  extension: PortraitManifestExtension,
): AnalyzerOutput {
  if (!extension.science.capabilities.includes('spectral-mode')) return emptyOutput();
  const trajectory = trajectoryPayload(payload);
  if (!trajectory || trajectory.times.length < 80 || trajectory.observables.length < 2) {
    return emptyOutput();
  }
  const selected = trajectory.observables.slice(0, 2);
  if (selected.some((observable) => observable.values.length !== trajectory.times.length)) {
    return emptyOutput();
  }
  const transientStart = Math.floor(trajectory.times.length * 0.2);
  const available = trajectory.times.length - transientStart;
  const stride = Math.max(1, Math.ceil(available / EDMD_BROWSER_LIMITS.maximumSnapshots));
  const indices: number[] = [];
  for (let index = transientStart; index < trajectory.times.length; index += stride) {
    indices.push(index);
  }
  if (indices.length < 80) return emptyOutput();
  const observations = selected.map((observable) => ({
    id: observable.id,
    label: observable.label,
    unit: 'model unit',
    values: indices.map((index) => requiredValue(observable.values, index, observable.id)),
  }));
  const dictionary = observations.map((observable) => ({
    id: `identity-${observable.id}`,
    definition: observable.id,
    source: `${extension.runtime.definitionRef}#observable:${observable.id}`,
    evaluate: (snapshot: Readonly<Record<string, number>>) => snapshot[observable.id] ?? Number.NaN,
  }));
  const result = analyzeFiniteEdmd({
    times: indices.map((index) => requiredValue(trajectory.times, index, 'EDMD time')),
    observables: observations,
    dictionary,
    options: {
      holdoutPairs: Math.max(
        EDMD_BROWSER_LIMITS.minimumHoldoutPairs,
        Math.floor(indices.length * 0.3),
      ),
      ridge: 1e-10,
    },
  });
  if (!result.ok) {
    return {
      objects: [],
      checks: [
        {
          id: 'dmd-holdout-residual',
          status: 'failed',
          severity: 'claim',
          metrics: [],
          message: `Finite identity-dictionary EDMD was not reported: ${result.code}: ${result.message}`,
        },
      ],
    };
  }
  const residual = result.holdoutResidual;
  const passed = Number.isFinite(residual) && residual <= 0.35;
  const representativeMode = [...result.modes].sort(
    (left, right) => Math.abs(right.angularFrequency ?? 0) - Math.abs(left.angularFrequency ?? 0),
  )[0];
  const check: RunCheckResult = {
    id: 'dmd-holdout-residual',
    status: passed ? 'passed' : 'failed',
    severity: 'claim',
    metrics: [
      { id: 'relative-holdout-residual', value: residual, norm: 'relative', tolerance: 0.35 },
      { id: 'relative-training-residual', value: result.trainingResidual, norm: 'relative' },
      {
        id: 'dictionary-condition-number',
        value: result.conditioning.snapshotConditionNumber,
      },
      ...(representativeMode?.angularFrequency === null ||
      representativeMode?.angularFrequency === undefined
        ? []
        : [
            {
              id: 'principal-branch-angular-frequency',
              value: representativeMode.angularFrequency,
              unit: 'rad / model time',
            },
          ]),
      ...(representativeMode?.decayRate === null || representativeMode?.decayRate === undefined
        ? []
        : [
            {
              id: 'principal-branch-decay-rate',
              value: representativeMode.decayRate,
              unit: '1 / model time',
            },
          ]),
    ],
    message:
      'Finite identity-dictionary EDMD is reported with a chronological 30% holdout; it is not a complete or continuous Koopman decomposition.',
  };
  if (!passed) return { objects: [], checks: [check] };
  return {
    objects: [
      {
        id: 'rank-two-dmd-mode',
        kind: 'dmd-mode',
        dataRefs: [trajectory.observables[0]!.id, trajectory.observables[1]!.id],
        evidenceCheckIds: [check.id],
        limitations: [
          'Observable- and dictionary-dependent finite EDMD approximation with chronological holdout only.',
          'Continuous rates use the principal complex-log branch and do not establish the complete Koopman spectrum.',
        ],
        artifact: {
          kind: 'spectrum',
          data: {
            method: result.method,
            modes: result.modes,
            conditioning: result.conditioning,
            sampleInterval: result.sampleInterval,
            trainingPairs: result.trainingPairs,
            holdoutPairs: result.holdoutPairs,
            provenance: result.provenance,
          },
        },
      },
    ],
    checks: [check],
  };
}

function stronglyConnectedComponents(graph: Map<string, Set<string>>) {
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
    const targets = graph.get(node);
    if (!targets) throw new Error(`Transition graph node ${node} has no adjacency set.`);
    for (const target of targets) {
      if (!indices.has(target)) {
        visit(target);
        const nodeLink = lowLinks.get(node);
        const targetLink = lowLinks.get(target);
        if (nodeLink === undefined || targetLink === undefined) {
          throw new Error('Tarjan low-link state is incomplete after recursion.');
        }
        lowLinks.set(node, Math.min(nodeLink, targetLink));
      } else if (onStack.has(target)) {
        const nodeLink = lowLinks.get(node);
        const targetIndex = indices.get(target);
        if (nodeLink === undefined || targetIndex === undefined) {
          throw new Error('Tarjan index state is incomplete for an on-stack node.');
        }
        lowLinks.set(node, Math.min(nodeLink, targetIndex));
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
    components.push(component);
  };

  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return components;
}

function setOrientedMorseGraph(
  payload: RunPayload,
  extension: PortraitManifestExtension,
): AnalyzerOutput {
  if (!extension.science.capabilities.includes('recurrence')) return emptyOutput();
  const trajectory = trajectoryPayload(payload);
  if (!trajectory || trajectory.times.length < 150 || trajectory.observables.length < 2) {
    return emptyOutput();
  }
  const x = trajectory.observables[0]?.values;
  const y = trajectory.observables[1]?.values;
  if (!x || !y || x.length !== y.length) return emptyOutput();
  const start = Math.floor(x.length * 0.2);
  const xTail = x.slice(start);
  const yTail = y.slice(start);
  const xMin = Math.min(...xTail);
  const xSpan = Math.max(Number.EPSILON, Math.max(...xTail) - xMin);
  const yMin = Math.min(...yTail);
  const ySpan = Math.max(Number.EPSILON, Math.max(...yTail) - yMin);
  const bins = 12;
  const cell = (index: number) => {
    const column = Math.min(
      bins - 1,
      Math.floor(((requiredValue(x, index, 'Morse x') - xMin) / xSpan) * bins),
    );
    const row = Math.min(
      bins - 1,
      Math.floor(((requiredValue(y, index, 'Morse y') - yMin) / ySpan) * bins),
    );
    return `${column}:${row}`;
  };
  const graph = new Map<string, Set<string>>();
  for (let index = start; index < x.length - 1; index += 1) {
    const source = cell(index);
    const target = cell(index + 1);
    if (!graph.has(source)) graph.set(source, new Set());
    if (!graph.has(target)) graph.set(target, new Set());
    const outgoing = graph.get(source);
    if (!outgoing) throw new Error(`Transition graph source ${source} is missing.`);
    outgoing.add(target);
  }
  if (graph.size < 8) return emptyOutput();
  const components = stronglyConnectedComponents(graph);
  const recurrent = components.filter(
    (component) =>
      component.length > 1 ||
      (component[0] !== undefined && graph.get(component[0])?.has(component[0])),
  );
  if (recurrent.length < 2) return emptyOutput();
  const componentByNode = new Map<string, number>();
  recurrent.forEach((component, index) => {
    for (const node of component) componentByNode.set(node, index);
  });
  const edges = new Set<string>();
  for (const [source, targets] of graph) {
    const sourceComponent = componentByNode.get(source);
    if (sourceComponent === undefined) continue;
    for (const target of targets) {
      const targetComponent = componentByNode.get(target);
      if (targetComponent !== undefined && sourceComponent !== targetComponent) {
        edges.add(`${sourceComponent}->${targetComponent}`);
      }
    }
  }
  const check: RunCheckResult = {
    id: 'set-oriented-morse-graph',
    status: 'passed',
    severity: 'claim',
    metrics: [
      { id: 'occupied-boxes', value: graph.size, unit: 'boxes' },
      { id: 'recurrent-components', value: recurrent.length, unit: 'components' },
      { id: 'observed-component-edges', value: edges.size, unit: 'edges' },
    ],
    message:
      'A finite transition graph on a declared 12 x 12 box grid produced multiple recurrent strongly connected components.',
  };
  return {
    objects: [
      {
        id: 'set-oriented-morse-graph',
        kind: 'morse-graph',
        dataRefs: [trajectory.observables[0]!.id, trajectory.observables[1]!.id],
        evidenceCheckIds: [check.id],
        limitations: [
          'Finite-resolution set-oriented approximation; boxes and edges are not a rigorous Conley enclosure.',
          'Absence or presence can change with grid, sampling interval, and integration time.',
        ],
        artifact: {
          kind: 'morse-graph',
          data: {
            grid: [bins, bins],
            components: recurrent,
            edges: [...edges],
          },
        },
      },
    ],
    checks: [check],
  };
}

function fieldInterfaces(
  payload: RunPayload,
  extension: PortraitManifestExtension,
): AnalyzerOutput {
  if (
    !extension.science.capabilities.includes('interface') ||
    payload.kind !== 'field-trajectory'
  ) {
    return emptyOutput();
  }
  const frame = payload.frames.at(-1);
  if (!frame) return emptyOutput();
  const [componentId, values] = Object.entries(frame.components)[0] ?? [];
  if (!componentId || !values) return emptyOutput();
  const [rows, columns] = frame.shape;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let crossings = 0;
  let edges = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const value = requiredValue(values, index, componentId) - mean;
      if (column + 1 < columns) {
        if (value * (requiredValue(values, index + 1, componentId) - mean) < 0) crossings += 1;
        edges += 1;
      }
      if (row + 1 < rows) {
        if (value * (requiredValue(values, index + columns, componentId) - mean) < 0) {
          crossings += 1;
        }
        edges += 1;
      }
    }
  }
  const density = edges === 0 ? 0 : crossings / edges;
  if (!Number.isFinite(density) || density <= 0) return emptyOutput();
  const check: RunCheckResult = {
    id: 'interface-edge-density',
    status: 'passed',
    severity: 'claim',
    metrics: [{ id: 'sign-change-edge-density', value: density, unit: 'fraction' }],
    message:
      'Grid-edge sign changes around the current spatial mean estimate interface density; no topology class is inferred.',
  };
  return {
    objects: [
      {
        id: 'grid-interface-estimate',
        kind: 'interface',
        dataRefs: [componentId],
        evidenceCheckIds: [check.id],
        limitations: [
          'Resolution-dependent grid estimate; not a Morse-Smale complex or persistent-homology result.',
        ],
      },
    ],
    checks: [check],
  };
}

function finiteFieldPersistence(
  payload: RunPayload,
  extension: PortraitManifestExtension,
): AnalyzerOutput {
  if (
    !extension.science.capabilities.includes('persistent-homology') ||
    payload.kind !== 'field-trajectory'
  ) {
    return emptyOutput();
  }
  const frame = payload.frames.at(-1);
  if (!frame) return emptyOutput();
  const [componentId, values] = Object.entries(frame.components)[0] ?? [];
  if (!componentId || !values) return emptyOutput();
  const boundary =
    extension.formal.stateSpace.kind === 'field' &&
    extension.formal.stateSpace.boundary === 'periodic'
      ? 'periodic'
      : 'open';
  const result = analyzeZeroDimensionalPersistence({
    values,
    shape: frame.shape,
    filtration: 'sublevel',
    connectivity: 4,
    boundary,
  });
  if (result.status === 'failed') {
    return {
      objects: [],
      checks: [
        {
          id: 'finite-grid-h0-persistence',
          status: 'failed',
          severity: 'claim',
          metrics: [],
          message: `Finite-grid H0 persistence was not reported: ${result.code}: ${result.message}`,
        },
      ],
    };
  }
  const finitePersistences = result.pairs.flatMap((pair) =>
    pair.persistence === null ? [] : [pair.persistence],
  );
  const maximumPersistence = finitePersistences.reduce(
    (maximum, persistence) => Math.max(maximum, persistence),
    0,
  );
  return {
    objects: [],
    checks: [
      {
        id: 'finite-grid-h0-persistence',
        status: 'passed',
        severity: 'claim',
        metrics: [
          { id: 'finite-persistence-pairs', value: finitePersistences.length, unit: 'pairs' },
          {
            id: 'essential-components',
            value: result.pairs.length - finitePersistences.length,
            unit: 'components',
          },
          { id: 'maximum-finite-persistence', value: maximumPersistence, unit: 'field unit' },
        ],
        message: `H0 lower-star persistence was computed exactly for the supplied finite ${frame.shape[0]} x ${frame.shape[1]} ${componentId} grid; no continuum topology or Morse–Smale complex is inferred.`,
      },
    ],
  };
}

/** Capability-gated analyzers return no object when evidence is insufficient. */
export function runOptionalAnalyzers(
  payload: RunPayload,
  extension: PortraitManifestExtension,
): AnalyzerOutput {
  return merge([
    recurrenceAndMeasure(payload, extension),
    setOrientedMorseGraph(payload, extension),
    twoDimensionalDmd(payload, extension),
    fieldInterfaces(payload, extension),
    finiteFieldPersistence(payload, extension),
  ]);
}
