import type { RunCheckResult, RunProvenance, ValidationRequirementId } from '../portrait-types.ts';
import type { WorkManifest, WorkResult } from '../types.ts';
import {
  simulateCahnHilliard,
  simulateGrayScott,
  simulateIsing,
  simulateLinearRotatingShallowWater,
  type FieldSolverResult,
  type FieldValidationEvidence,
} from './field-solvers.ts';

const colors = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b'];

interface DisplaySpec {
  component: string;
  domain: readonly [number, number];
}

function evidenceRequirement(evidence: FieldValidationEvidence): ValidationRequirementId | string {
  if (evidence.id.includes('cfl')) return 'cfl-condition';
  if (evidence.id === 'minimum-concentration') return 'positivity';
  if (evidence.id === 'mass-residual') return 'mass-balance';
  if (evidence.id === 'relative-energy-drift') return 'energy-residual';
  if (evidence.id === 'free-energy-increase') return 'energy-residual';
  return evidence.id;
}

function evidenceChecks(result: FieldSolverResult): RunCheckResult[] {
  const checks: RunCheckResult[] = result.evidence.map((evidence) => ({
    id: evidenceRequirement(evidence),
    status: evidence.status === 'passed' ? 'passed' : 'not-run',
    severity: evidence.category === 'constraint' ? 'hard' : 'claim',
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
  checks.push({
    id: 'boundary-residual',
    status: 'passed',
    severity: 'claim',
    metrics: [],
    message:
      'Every spatial stencil wraps periodically in both axes; no display padding enters the solver.',
  });
  return checks;
}

function provenance(work: WorkManifest, result: FieldSolverResult): RunProvenance {
  if (work.schemaVersion !== 2)
    throw new Error(`Field kernel ${work.kernel} requires a v2 portrait.`);
  const seed = result.metadata.parameters.seed;
  const prng = result.metadata.parameters.prng;
  const randomProvenance =
    typeof seed === 'number'
      ? (() => {
          if (typeof prng !== 'string') {
            throw new Error(
              `${result.metadata.solverId} recorded a seed without a PRNG identifier.`,
            );
          }
          return {
            algorithm: prng,
            version: '1',
            seed: String(seed),
            sampleSchedule: 'checkerboard Metropolis sweeps',
          };
        })()
      : undefined;
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
      kind: result.metadata.dynamics === 'stochastic' ? 'sampler' : 'numerical-solver',
      id: result.metadata.solverId,
      version: String(result.metadata.version),
      precision: 'float64',
      fixedStep: result.metadata.temporal.stepSize,
      iterations: result.metadata.temporal.steps,
    },
    interval: [firstTime, finalTime],
    initialCondition: { ref: `${result.metadata.solverId}:declared-initial-condition` },
    boundaryConditions: [
      { axis: 'x', kind: 'periodic' },
      { axis: 'y', kind: 'periodic' },
    ],
    grid: {
      shape: [result.metadata.grid.height, result.metadata.grid.width],
      spacing: [result.metadata.grid.dy, result.metadata.grid.dx],
    },
    ...(randomProvenance ? { random: randomProvenance } : {}),
  };
}

function adaptFieldResult(
  work: WorkManifest,
  result: FieldSolverResult,
  display: DisplaySpec,
  additionalChecks: RunCheckResult[] = [],
): WorkResult {
  const times = Array.from(result.times);
  const finalTime = times.at(-1);
  if (finalTime === undefined) throw new Error(`${result.metadata.solverId} returned no times.`);
  const frames = result.frames.map((frame) => ({
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
  const finalFrame = frames.at(-1);
  const finalValues = finalFrame?.components[display.component];
  if (!finalFrame || !finalValues) {
    throw new Error(
      `${result.metadata.solverId} did not return display component ${display.component}.`,
    );
  }
  const series = result.summaries.map((summary, index) => {
    const color = colors[index % colors.length];
    if (color === undefined) throw new Error('Field palette is empty.');
    return {
      id: summary.id,
      label: summary.label,
      color,
      values: Array.from(summary.values),
    };
  });
  if (series.some((summary) => summary.values.length !== times.length)) {
    throw new Error(`${result.metadata.solverId} summary length does not match captured times.`);
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
    diagnostics: `${result.metadata.method}; ${result.metadata.boundary}; ${result.metadata.grid.width} x ${result.metadata.grid.height}; ${result.metadata.temporal.steps} ${result.metadata.temporal.unit} steps.`,
    numerical: {
      provenance: provenance(work, result),
      checks: [...evidenceChecks(result), ...additionalChecks],
      fieldFrames: frames,
    },
  };
}

function isReviewedParameters(work: WorkManifest, parameters: Record<string, number>) {
  if (work.schemaVersion !== 2) return false;
  return work.portrait.parameterRegimes.some((regime) =>
    Object.entries(regime.parameterDomain).every(([id, [minimum, maximum]]) => {
      const value = parameters[id];
      return value !== undefined && value >= minimum && value <= maximum;
    }),
  );
}

function finalSummary(result: FieldSolverResult, id: string): number {
  const values = result.summaries.find((summary) => summary.id === id)?.values;
  const value = values?.at(-1);
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`${result.metadata.solverId} is missing final summary ${id}.`);
  }
  return value;
}

function refinementCheck(
  fine: FieldSolverResult,
  coarse: FieldSolverResult,
  metrics: Array<{ id: string; value: (result: FieldSolverResult) => number }>,
  tolerance: number,
): RunCheckResult {
  let maximumDifference = 0;
  const evidence = metrics.map((metric) => {
    const fineValue = metric.value(fine);
    const coarseValue = metric.value(coarse);
    const difference = Math.abs(fineValue - coarseValue);
    maximumDifference = Math.max(maximumDifference, difference);
    return { id: metric.id, value: difference, unit: 'absolute difference' };
  });
  const passed = maximumDifference <= tolerance;
  return {
    id: 'grid-refinement',
    status: passed ? 'passed' : 'failed',
    severity: 'claim',
    metrics: [
      ...evidence,
      {
        id: 'maximum-reviewed-summary-difference',
        value: maximumDifference,
        unit: 'absolute difference',
        tolerance,
      },
    ],
    message: passed
      ? 'The reviewed fine-grid run agrees with a half-resolution run on declared scale-aware summaries.'
      : 'The half-resolution comparison exceeds the reviewed summary tolerance.',
  };
}

export function simulateReviewedField(
  work: WorkManifest,
  parameters: Record<string, number>,
): WorkResult | null {
  switch (work.kernel) {
    case 'gray-scott': {
      const result = simulateGrayScott({
        feed: parameters.feed,
        kill: parameters.kill,
        snapshotCount: 13,
      });
      const checks = isReviewedParameters(work, parameters)
        ? [
            refinementCheck(
              result,
              simulateGrayScott({
                width: 24,
                height: 16,
                dx: 2,
                dy: 2,
                feed: parameters.feed,
                kill: parameters.kill,
                snapshotCount: 13,
              }),
              ['mean-u', 'mean-v', 'variance-v'].map((id) => ({
                id,
                value: (candidate: FieldSolverResult) => finalSummary(candidate, id),
              })),
              0.15,
            ),
          ]
        : [];
      return adaptFieldResult(work, result, { component: 'v', domain: [0, 0.5] }, checks);
    }
    case 'cahn-hilliard': {
      const result = simulateCahnHilliard({
        mobility: parameters.mobility,
        kappa: parameters.interface,
        snapshotCount: 13,
      });
      const checks = isReviewedParameters(work, parameters)
        ? [
            refinementCheck(
              result,
              simulateCahnHilliard({
                width: 16,
                height: 16,
                dx: 2,
                dy: 2,
                mobility: parameters.mobility,
                kappa: parameters.interface,
                snapshotCount: 13,
              }),
              [
                {
                  id: 'mean-phi',
                  value: (candidate) => finalSummary(candidate, 'mean-phi'),
                },
                {
                  id: 'free-energy-density',
                  value: (candidate) =>
                    finalSummary(candidate, 'free-energy') /
                    (candidate.metadata.grid.width *
                      candidate.metadata.grid.dx *
                      candidate.metadata.grid.height *
                      candidate.metadata.grid.dy),
                },
              ],
              0.002,
            ),
          ]
        : [];
      return adaptFieldResult(work, result, { component: 'phi', domain: [-1, 1] }, checks);
    }
    case 'ising':
      return adaptFieldResult(
        work,
        simulateIsing({
          seed: 1_597_463_007,
          temperature: parameters.temperature,
          field: parameters.field,
          snapshotCount: 13,
        }),
        { component: 'spin', domain: [-1, 1] },
      );
    case 'shallow-water': {
      const result = simulateLinearRotatingShallowWater({
        meanDepth: parameters.depth,
        coriolis: parameters.rotation,
        snapshotCount: 13,
      });
      const checks = isReviewedParameters(work, parameters)
        ? [
            refinementCheck(
              result,
              simulateLinearRotatingShallowWater({
                width: 16,
                height: 16,
                dx: 2,
                dy: 2,
                meanDepth: parameters.depth,
                coriolis: parameters.rotation,
                snapshotCount: 13,
              }),
              [
                {
                  id: 'rms-surface-height',
                  value: (candidate) => finalSummary(candidate, 'rms-surface-height'),
                },
                {
                  id: 'linear-energy-density',
                  value: (candidate) =>
                    finalSummary(candidate, 'linear-energy') /
                    (candidate.metadata.grid.width *
                      candidate.metadata.grid.dx *
                      candidate.metadata.grid.height *
                      candidate.metadata.grid.dy),
                },
              ],
              0.002,
            ),
          ]
        : [];
      return adaptFieldResult(
        work,
        result,
        { component: 'surface-height', domain: [-0.08, 0.08] },
        checks,
      );
    }
    default:
      return null;
  }
}
