import type { RunCheckResult, RunProvenance, ValidationRequirementId } from '../portrait-types.ts';
import type { Series, WorkManifest, WorkResult } from '../types.ts';
import {
  simulateFedReactionChainFoundation,
  simulateLorenzFoundation,
  type FoundationCheck,
  type FoundationKernelResult,
} from './foundation-kernels.ts';

const colors = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b', '#b99cff', '#ff8d68'];

function requirementFor(check: FoundationCheck): ValidationRequirementId | string {
  switch (check.id) {
    case 'short-time-step-halving':
    case 'full-window-step-halving':
      return 'step-halving';
    case 'analytic-equilibrium-residual':
      return 'equilibrium-residual';
    case 'state-positivity':
      return 'positivity';
    case 'mass-balance-residual':
      return 'mass-balance';
    case 'two-lobe-minimum-occupancy':
    case 'analytic-feed-integral-residual':
      return 'reference-statistic';
    default:
      return check.id;
  }
}

function checksFor(result: FoundationKernelResult): RunCheckResult[] {
  return result.checks.map((check) => ({
    id: requirementFor(check),
    status: check.status === 'observed' ? 'not-run' : check.status,
    severity: check.category === 'constraint' ? 'hard' : 'claim',
    metrics: [
      {
        id: check.id,
        value: check.value,
        unit: check.unit,
        ...(check.tolerance === undefined ? {} : { tolerance: check.tolerance }),
      },
    ],
    message: `${check.description} Scope: ${check.scope.description}`,
  }));
}

function provenanceFor(work: WorkManifest, result: FoundationKernelResult): RunProvenance {
  if (work.schemaVersion !== 2) throw new Error(`${work.kernel} requires a v2 portrait.`);
  return {
    kernel: {
      id: work.kernel,
      version: String(result.provenance.version),
      definitionHash: work.portrait.runtime.definitionHash,
    },
    execution: {
      kind: 'numerical-solver',
      id: result.provenance.reviewedProfileId,
      version: String(result.provenance.version),
      precision: result.provenance.solver.precision,
      fixedStep: result.provenance.solver.stepSize,
      iterations: result.provenance.solver.steps,
    },
    interval: [0, result.provenance.solver.duration],
    initialCondition: { ...result.provenance.initialCondition },
  };
}

function toSeries(result: FoundationKernelResult): Series[] {
  return [...result.state.components, ...result.observables].map((series, index) => {
    const color = colors[index % colors.length];
    if (color === undefined) throw new Error('Foundation series palette is empty.');
    return {
      id: series.id,
      label: series.label,
      color,
      values: Array.from(series.values),
    };
  });
}

function rawState(result: FoundationKernelResult) {
  const frameCount = result.times.length;
  const stateDimension = result.state.components.length;
  const values = new Array<number>(frameCount * stateDimension);
  for (let timeIndex = 0; timeIndex < frameCount; timeIndex += 1) {
    for (let coordinate = 0; coordinate < stateDimension; coordinate += 1) {
      const value = result.state.components[coordinate]?.values[timeIndex];
      if (value === undefined)
        throw new Error('Foundation state dimension changed during adaptation.');
      values[timeIndex * stateDimension + coordinate] = value;
    }
  }
  return {
    coordinateIds: result.state.components.map((component) => component.id),
    shape: [frameCount, stateDimension] as const,
    values,
  };
}

function adaptFoundation(
  work: WorkManifest,
  result: FoundationKernelResult,
  projection: readonly [string, string],
): WorkResult {
  const times = Array.from(result.times);
  const finalTime = times.at(-1);
  if (finalTime === undefined) throw new Error(`${work.kernel} returned no scientific times.`);
  const series = toSeries(result);
  const byId = new Map(series.map((item) => [item.id, item]));
  const x = byId.get(projection[0]);
  const y = byId.get(projection[1]);
  if (!x || !y) throw new Error(`${work.kernel} projection references a missing observable.`);
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
    diagnostics: `${result.provenance.reviewedProfileId}; ${result.provenance.solver.id}; dt=${result.provenance.solver.stepSize}; comparison dt=${result.provenance.solver.comparisonStepSize}.`,
    numerical: {
      provenance: provenanceFor(work, result),
      checks: checksFor(result),
      state: rawState(result),
    },
  };
}

export function simulateReviewedFoundation(
  work: WorkManifest,
  parameters: Record<string, number>,
): WorkResult | null {
  switch (work.kernel) {
    case 'lorenz':
      return adaptFoundation(
        work,
        simulateLorenzFoundation({ rho: parameters.rho, sigma: parameters.sigma }),
        ['x', 'z'],
      );
    case 'reaction-chain':
      return adaptFoundation(
        work,
        simulateFedReactionChainFoundation({ feed: parameters.feed, rate: parameters.rate }),
        ['a', 'b'],
      );
    default:
      return null;
  }
}
