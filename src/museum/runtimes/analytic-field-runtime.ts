import type { RunCheckResult, RunProvenance, ValidationRequirementId } from '../portrait-types.ts';
import type { WorkManifest, WorkResult } from '../types.ts';
import {
  simulateBudykoSellers,
  simulateFixedBoundaryWave,
  simulateFreeGaussianSchrodinger,
  simulatePeriodicHeat,
  type AnalyticFieldEvidence,
  type AnalyticFieldSolverResult,
  type HeatFourierMode,
} from './analytic-field-solvers.ts';

const colors = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b', '#b99cff'];

interface DisplaySpec {
  component: string;
  domain: readonly [number, number];
}

function requireParameter(parameters: Record<string, number>, id: string): number {
  const value = parameters[id];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Analytic field parameter "${id}" is missing or non-finite.`);
  }
  return value;
}

function evidenceRequirement(evidence: AnalyticFieldEvidence): ValidationRequirementId | string {
  if (evidence.category === 'finite') return 'finite-output';
  if (evidence.category === 'refinement') return 'grid-refinement';
  if (evidence.category === 'equilibrium') return 'equilibrium-residual';
  if (evidence.category === 'boundary') return 'boundary-residual';
  if (evidence.id === 'energy-residual') return 'energy-residual';
  if (
    evidence.id === 'mean-temperature-residual' ||
    evidence.id === 'full-space-norm-residual' ||
    evidence.id === 'transport-integral-residual'
  ) {
    return 'mass-balance';
  }
  if (
    evidence.id === 'variance-increase' ||
    evidence.id === 'display-quadrature-residual' ||
    evidence.id === 'density-identity-residual'
  ) {
    return 'reference-statistic';
  }
  return evidence.id;
}

function checksFor(result: AnalyticFieldSolverResult): RunCheckResult[] {
  return result.evidence.map((evidence) => ({
    id: evidenceRequirement(evidence),
    status: evidence.status === 'passed' ? 'passed' : 'not-run',
    severity: evidence.category === 'finite' ? 'hard' : 'claim',
    metrics: [
      {
        id: evidence.id,
        value: evidence.value,
        unit: evidence.unit,
        ...(evidence.tolerance === undefined ? {} : { tolerance: evidence.tolerance }),
      },
    ],
    message: evidence.description,
  }));
}

function boundaryConditions(
  result: AnalyticFieldSolverResult,
): NonNullable<RunProvenance['boundaryConditions']> {
  switch (result.metadata.boundary) {
    case 'fixed-dirichlet-x-y':
      return [
        { axis: 'x', kind: 'dirichlet', value: 0 },
        { axis: 'y', kind: 'dirichlet', value: 0 },
      ];
    case 'periodic-x-y':
      return [
        { axis: 'x', kind: 'periodic' },
        { axis: 'y', kind: 'periodic' },
      ];
    case 'open-domain-truncated-for-display':
      return [
        { axis: 'x', kind: 'open-display-window' },
        { axis: 'y', kind: 'open-display-window' },
      ];
    case 'no-flux-in-sin-latitude':
      return [{ axis: 'sin-latitude', kind: 'no-flux' }];
  }
}

function provenance(work: WorkManifest, result: AnalyticFieldSolverResult): RunProvenance {
  if (work.schemaVersion !== 2) throw new Error(`${work.kernel} requires a v2 portrait.`);
  const firstTime = result.times[0];
  const finalTime = result.times.at(-1);
  if (firstTime === undefined || finalTime === undefined) {
    throw new Error(`${result.metadata.solverId} returned no scientific times.`);
  }
  return {
    kernel: {
      id: work.kernel,
      version: String(result.metadata.version),
      definitionHash: work.portrait.runtime.definitionHash,
    },
    execution: {
      kind:
        result.metadata.representation === 'closed-form-solution'
          ? 'analytic-evaluator'
          : 'numerical-solver',
      id: result.metadata.solverId,
      version: String(result.metadata.version),
      precision: 'float64',
      ...(result.metadata.temporal.stepSize === undefined
        ? {}
        : { fixedStep: result.metadata.temporal.stepSize }),
      ...(result.metadata.temporal.steps === undefined
        ? {}
        : { iterations: result.metadata.temporal.steps }),
    },
    interval: [firstTime, finalTime],
    initialCondition: { ref: `${result.metadata.provenance.lawRef}:declared-family` },
    boundaryConditions: boundaryConditions(result),
    grid: {
      shape: [result.metadata.grid.height, result.metadata.grid.width],
      spacing: [result.metadata.grid.dy, result.metadata.grid.dx],
    },
  };
}

function adapt(
  work: WorkManifest,
  result: AnalyticFieldSolverResult,
  display: DisplaySpec,
): WorkResult {
  const times = Array.from(result.times);
  const finalTime = times.at(-1);
  if (finalTime === undefined) throw new Error(`${result.metadata.solverId} returned no times.`);
  const fieldFrames = result.frames.map((frame) => ({
    time: frame.time,
    shape: [result.metadata.grid.height, result.metadata.grid.width] as const,
    components: Object.fromEntries(
      Object.entries(frame.components).map(([id, values]) => [id, Array.from(values)]),
    ),
    coordinates: {
      names: ['y', 'x'],
      spacing: [result.metadata.grid.dy, result.metadata.grid.dx],
    },
  }));
  if (fieldFrames.length !== times.length) {
    throw new Error(`${result.metadata.solverId} field frame count does not match its times.`);
  }
  const finalFrame = fieldFrames.at(-1);
  const finalValues = finalFrame?.components[display.component];
  if (!finalFrame || !finalValues) {
    throw new Error(`${result.metadata.solverId} did not return ${display.component}.`);
  }
  const series = result.summaries.map((summary, index) => {
    const color = colors[index % colors.length];
    if (color === undefined) throw new Error('Analytic field palette is empty.');
    return {
      id: summary.id,
      label: summary.label,
      color,
      values: Array.from(summary.values),
    };
  });
  if (series.length === 0 || series.some((item) => item.values.length !== times.length)) {
    throw new Error(`${result.metadata.solverId} returned invalid summary dimensions.`);
  }
  const xValues = series[0]?.values;
  const yValues = series[1]?.values;
  if (!xValues || !yValues) throw new Error(`${result.metadata.solverId} returned no summaries.`);
  return {
    duration: finalTime,
    presentationDuration: work.duration,
    times,
    series,
    points: times.map((_time, index) => {
      const x = xValues[index];
      const y = yValues[index];
      if (x === undefined || y === undefined) {
        throw new Error(`${result.metadata.solverId} summary length changed during adaptation.`);
      }
      return { x, y };
    }),
    field: {
      columns: result.metadata.grid.width,
      rows: result.metadata.grid.height,
      values: finalValues,
      componentId: display.component,
      valueDomain: display.domain,
    },
    diagnostics: `${result.metadata.method}; ${result.metadata.boundary}; ${result.metadata.provenance.scope}`,
    numerical: {
      provenance: provenance(work, result),
      checks: checksFor(result),
      fieldFrames,
    },
  };
}

const heatModeFamily: HeatFourierMode[] = [
  { amplitude: 1, waveNumberX: 1, waveNumberY: 0, phase: 0 },
  { amplitude: 0.5, waveNumberX: 0, waveNumberY: 1, phase: 0.4 },
  { amplitude: 0.34, waveNumberX: 1, waveNumberY: 1, phase: 0.8 },
  { amplitude: 0.25, waveNumberX: 2, waveNumberY: 1, phase: 1.2 },
  { amplitude: 0.2, waveNumberX: 1, waveNumberY: 2, phase: 1.6 },
];

export function simulateReviewedAnalyticField(
  work: WorkManifest,
  parameters: Record<string, number>,
): WorkResult | null {
  switch (work.kernel) {
    case 'wave':
      return adapt(
        work,
        simulateFixedBoundaryWave({
          speed: requireParameter(parameters, 'speed'),
          modeX: Math.round(requireParameter(parameters, 'mode')),
          modeY: 1,
          snapshotCount: 13,
        }),
        { component: 'displacement', domain: [-1, 1] },
      );
    case 'heat': {
      const modeCount = Math.round(requireParameter(parameters, 'sources'));
      return adapt(
        work,
        simulatePeriodicHeat({
          diffusivity: requireParameter(parameters, 'diffusivity'),
          modes: heatModeFamily.slice(0, modeCount),
          snapshotCount: 13,
        }),
        { component: 'temperature', domain: [-1.5, 2] },
      );
    }
    case 'schrodinger': {
      const momentum = requireParameter(parameters, 'momentum');
      return adapt(
        work,
        simulateFreeGaussianSchrodinger({
          width: 129,
          height: 97,
          xMin: -6,
          xMax: 6,
          yMin: -4,
          yMax: 4,
          packetWidth: requireParameter(parameters, 'width'),
          momentumX: momentum,
          duration: Math.min(3, 6 / Math.abs(momentum)),
          snapshotCount: 13,
        }),
        { component: 'probabilityDensity', domain: [0, 8] },
      );
    }
    case 'budyko-sellers':
      return adapt(
        work,
        simulateBudykoSellers({
          solarScale: requireParameter(parameters, 'solar'),
          transport: requireParameter(parameters, 'transport'),
          snapshotCount: 13,
        }),
        { component: 'temperature', domain: [-80, 40] },
      );
    default:
      return null;
  }
}
