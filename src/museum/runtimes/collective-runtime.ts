import type { RunCheckResult, RunProvenance, ValidationRequirementId } from '../portrait-types.ts';
import type { Series, WorkManifest, WorkResult } from '../types.ts';
import {
  simulateFput,
  simulateKuramoto,
  type CollectiveKernelCheck,
  type CollectiveKernelResult,
} from './collective-kernels.ts';

const colors = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b', '#b99cff', '#ff8d68'];

function requireParameter(parameters: Record<string, number>, id: string): number {
  const value = parameters[id];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Collective parameter "${id}" is missing or non-finite.`);
  }
  return value;
}

function requirementFor(check: CollectiveKernelCheck): ValidationRequirementId | string {
  switch (check.id) {
    case 'finite-state':
      return 'finite-output';
    case 'coherence-bound':
      return 'order-parameter-bounds';
    case 'frequency-locking':
    case 'first-mode-recurrence':
      return 'reference-statistic';
    case 'energy-residual':
      return 'energy-residual';
    default:
      return check.id;
  }
}

function checksFor(result: CollectiveKernelResult): RunCheckResult[] {
  return result.checks.map((check) => ({
    id: requirementFor(check),
    status: check.status,
    severity: check.severity,
    metrics: check.metrics.map((metric) => ({
      id: metric.id,
      value: metric.value,
      unit: metric.unit,
      ...(metric.norm === undefined ? {} : { norm: metric.norm }),
      ...(metric.tolerance === undefined ? {} : { tolerance: metric.tolerance }),
    })),
    message: check.message,
  }));
}

function stepHalvingCheck(
  coarse: CollectiveKernelResult,
  fine: CollectiveKernelResult,
  comparedSamples: number,
  tolerance: number,
): RunCheckResult {
  const dimension = coarse.stateShape[1];
  if (
    fine.stateShape[1] !== dimension ||
    comparedSamples > coarse.stateShape[0] ||
    fine.stateShape[0] !== 2 * (comparedSamples - 1) + 1
  ) {
    throw new Error('Collective step-halving comparison has inconsistent dimensions.');
  }
  let maximumAbsolute = 0;
  let scale = 1;
  for (let sample = 0; sample < comparedSamples; sample += 1) {
    for (let coordinate = 0; coordinate < dimension; coordinate += 1) {
      const coarseValue = coarse.rawState[sample * dimension + coordinate];
      const fineValue = fine.rawState[2 * sample * dimension + coordinate];
      if (coarseValue === undefined || fineValue === undefined) {
        throw new Error('Collective step-halving comparison is missing a state value.');
      }
      maximumAbsolute = Math.max(maximumAbsolute, Math.abs(coarseValue - fineValue));
      scale = Math.max(scale, Math.abs(coarseValue), Math.abs(fineValue));
    }
  }
  const relative = maximumAbsolute / scale;
  const passed = relative <= tolerance;
  return {
    id: 'step-halving',
    status: passed ? 'passed' : 'failed',
    severity: 'hard',
    metrics: [
      {
        id: 'maximum-aligned-state-difference',
        value: relative,
        unit: 'relative',
        norm: 'linf',
        tolerance,
      },
    ],
    message: passed
      ? 'A half-step rerun agrees on the declared aligned comparison window.'
      : 'The half-step rerun exceeds the declared aligned-state tolerance.',
  };
}

function provenance(work: WorkManifest, result: CollectiveKernelResult): RunProvenance {
  if (work.schemaVersion !== 2) throw new Error(`${work.kernel} requires a v2 portrait.`);
  const firstTime = result.times[0];
  const finalTime = result.times.at(-1);
  if (firstTime === undefined || finalTime === undefined) {
    throw new Error(`${result.provenance.kernel.id} returned no scientific times.`);
  }
  return {
    kernel: {
      id: work.kernel,
      version: String(result.provenance.kernel.version),
      definitionHash: work.portrait.runtime.definitionHash,
    },
    execution: {
      kind: 'numerical-solver',
      id: result.provenance.execution.method,
      version: String(result.provenance.kernel.version),
      precision: result.provenance.execution.precision,
      fixedStep: result.provenance.execution.stepSize,
      iterations: result.provenance.execution.steps,
    },
    interval: [firstTime, finalTime],
    initialCondition: { ref: result.provenance.initialCondition },
    boundaryConditions: [{ axis: 'state', kind: result.provenance.boundary }],
  };
}

function timeSeries(result: CollectiveKernelResult): Series[] {
  return result.observables
    .filter((observable) => observable.axis === 'time')
    .map((observable, index) => {
      const color = colors[index % colors.length];
      if (color === undefined) throw new Error('Collective palette is empty.');
      return {
        id: observable.id,
        label: observable.label,
        color,
        values: Array.from(observable.values),
      };
    });
}

function adapt(
  work: WorkManifest,
  result: CollectiveKernelResult,
  projection: readonly [string, string],
  additionalChecks: RunCheckResult[],
): WorkResult {
  const times = Array.from(result.times);
  const finalTime = times.at(-1);
  if (finalTime === undefined) throw new Error(`${work.kernel} returned no scientific times.`);
  const series = timeSeries(result);
  if (series.length === 0 || series.some((item) => item.values.length !== times.length)) {
    throw new Error(`${work.kernel} returned invalid time-observable dimensions.`);
  }
  const byId = new Map(series.map((item) => [item.id, item]));
  const x = byId.get(projection[0]);
  const y = byId.get(projection[1]);
  if (!x || !y) throw new Error(`${work.kernel} projection references missing observables.`);
  return {
    duration: finalTime,
    presentationDuration: work.duration,
    times,
    series,
    points: times.map((_time, index) => {
      const xValue = x.values[index];
      const yValue = y.values[index];
      if (xValue === undefined || yValue === undefined) {
        throw new Error(`${work.kernel} projection length changed during adaptation.`);
      }
      return { x: xValue, y: yValue };
    }),
    diagnostics: `${result.provenance.execution.method}; dt=${result.provenance.execution.stepSize}; ${result.provenance.boundary}.`,
    numerical: {
      provenance: provenance(work, result),
      checks: [...checksFor(result), ...additionalChecks],
      state: {
        coordinateIds: result.provenance.state.components.map((component) => component.id),
        shape: result.stateShape,
        values: Array.from(result.rawState),
      },
    },
  };
}

export function simulateReviewedCollective(
  work: WorkManifest,
  parameters: Record<string, number>,
): WorkResult | null {
  switch (work.kernel) {
    case 'kuramoto': {
      const coupling = requireParameter(parameters, 'coupling');
      const spread = requireParameter(parameters, 'spread');
      const result = simulateKuramoto({ coupling, spread });
      const fine = simulateKuramoto({ coupling, spread, dt: 1 / 60 });
      return adapt(
        work,
        result,
        ['order-real', 'order-imaginary'],
        [stepHalvingCheck(result, fine, result.stateShape[0], 1e-5)],
      );
    }
    case 'fput': {
      const alpha = requireParameter(parameters, 'alpha');
      const amplitude = requireParameter(parameters, 'amplitude');
      // The public parameter domain includes the strongly nonlinear corner
      // alpha=1, amplitude=1.5.  Use the reviewed step for that whole domain;
      // a larger presentation-oriented step fails the aligned half-step check
      // there and must not be silently accepted.
      const result = simulateFput({ alpha, amplitude, duration: 400, dt: 0.01 });
      const comparisonDuration = 40;
      const fine = simulateFput({ alpha, amplitude, duration: comparisonDuration, dt: 0.005 });
      const comparedSamples =
        Math.round(comparisonDuration / result.provenance.execution.stepSize) + 1;
      return adapt(
        work,
        result,
        ['mode-1-harmonic-energy', 'mode-2-harmonic-energy'],
        [stepHalvingCheck(result, fine, comparedSamples, 1e-4)],
      );
    }
    default:
      return null;
  }
}
