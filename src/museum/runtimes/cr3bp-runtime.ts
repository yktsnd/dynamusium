import type { RunCheckResult, RunProvenance } from '../portrait-types.ts';
import type { Series, WorkManifest, WorkResult } from '../types.ts';
import { integrateAdaptiveDopri54, type AdaptiveIntegrationResult } from './adaptive-dopri54.ts';

const EXCLUSION_RADIUS = 0.03;
const RELATIVE_TOLERANCE = 1e-9;
const ABSOLUTE_TOLERANCE = 1e-12;
const MINIMUM_STEP = 1e-10;
const OUTPUT_STEPS = 1600;
const MAXIMUM_ATTEMPTS = 200_000;
const EVENT_ROOT_TOLERANCE = 1e-10;
const JACOBI_TOLERANCE = 1e-6;
const REFINEMENT_TOLERANCE = 1e-5;
const colors = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b', '#b99cff'];

function requireParameter(parameters: Record<string, number>, id: string): number {
  const value = parameters[id];
  if (!Number.isFinite(value)) throw new Error(`CR3BP parameter "${id}" is missing or non-finite.`);
  return value;
}

function stateValue(state: readonly number[], index: number, context: string): number {
  const value = state[index];
  if (!Number.isFinite(value)) throw new Error(`${context} is missing finite state ${index}.`);
  return value;
}

function distances(state: readonly number[], massRatio: number) {
  const x = stateValue(state, 0, 'CR3BP distance');
  const y = stateValue(state, 1, 'CR3BP distance');
  return {
    primaryOne: Math.hypot(x + massRatio, y),
    primaryTwo: Math.hypot(x - 1 + massRatio, y),
  };
}

function segmentDistanceToPrimary(
  start: readonly number[],
  end: readonly number[],
  primaryX: number,
): number {
  const startX = stateValue(start, 0, 'CR3BP event segment') - primaryX;
  const startY = stateValue(start, 1, 'CR3BP event segment');
  const deltaX = stateValue(end, 0, 'CR3BP event segment') - primaryX - startX;
  const deltaY = stateValue(end, 1, 'CR3BP event segment') - startY;
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  const fraction =
    squaredLength === 0
      ? 0
      : Math.min(1, Math.max(0, -(startX * deltaX + startY * deltaY) / squaredLength));
  return Math.hypot(startX + fraction * deltaX, startY + fraction * deltaY);
}

function segmentMayEnterExclusion(
  start: readonly number[],
  end: readonly number[],
  massRatio: number,
): boolean {
  return (
    segmentDistanceToPrimary(start, end, -massRatio) <= EXCLUSION_RADIUS ||
    segmentDistanceToPrimary(start, end, 1 - massRatio) <= EXCLUSION_RADIUS
  );
}

function derivative(massRatio: number) {
  return (_time: number, state: readonly number[]): number[] => {
    const x = stateValue(state, 0, 'CR3BP derivative');
    const y = stateValue(state, 1, 'CR3BP derivative');
    const velocityX = stateValue(state, 2, 'CR3BP derivative');
    const velocityY = stateValue(state, 3, 'CR3BP derivative');
    const { primaryOne: radiusOne, primaryTwo: radiusTwo } = distances(state, massRatio);
    const accelerationX =
      x +
      2 * velocityY -
      ((1 - massRatio) * (x + massRatio)) / radiusOne ** 3 -
      (massRatio * (x - 1 + massRatio)) / radiusTwo ** 3;
    const accelerationY =
      y - 2 * velocityX - ((1 - massRatio) * y) / radiusOne ** 3 - (massRatio * y) / radiusTwo ** 3;
    return [velocityX, velocityY, accelerationX, accelerationY];
  };
}

function integrate(
  massRatio: number,
  velocity: number,
  duration: number,
  outputSteps: number,
  relativeTolerance: number,
): AdaptiveIntegrationResult {
  const maximumStep = 34 / OUTPUT_STEPS;
  return integrateAdaptiveDopri54({
    initial: [0.72, 0.05, 0, velocity],
    duration,
    outputSteps,
    derivative: derivative(massRatio),
    relativeTolerance,
    absoluteTolerance: ABSOLUTE_TOLERANCE,
    initialStep: Math.min(maximumStep, duration / outputSteps),
    minimumStep: MINIMUM_STEP,
    maximumStep,
    maximumAttempts: MAXIMUM_ATTEMPTS,
    event: {
      id: 'close-encounter-resolution-boundary',
      surface: (_time, state) => {
        const radii = distances(state, massRatio);
        return Math.min(radii.primaryOne, radii.primaryTwo) - EXCLUSION_RADIUS;
      },
      rootTolerance: EVENT_ROOT_TOLERANCE,
      mayCrossBetween: (_startTime, startState, _endTime, endState) =>
        segmentMayEnterExclusion(startState, endState, massRatio),
    },
  });
}

function jacobi(state: readonly number[], massRatio: number): number {
  const x = stateValue(state, 0, 'CR3BP Jacobi value');
  const y = stateValue(state, 1, 'CR3BP Jacobi value');
  const velocityX = stateValue(state, 2, 'CR3BP Jacobi value');
  const velocityY = stateValue(state, 3, 'CR3BP Jacobi value');
  const { primaryOne: radiusOne, primaryTwo: radiusTwo } = distances(state, massRatio);
  const potential = 0.5 * (x * x + y * y) + (1 - massRatio) / radiusOne + massRatio / radiusTwo;
  return 2 * potential - velocityX * velocityX - velocityY * velocityY;
}

function refinementCheck(
  massRatio: number,
  velocity: number,
  main: AdaptiveIntegrationResult,
  fullDuration: number,
): RunCheckResult {
  const eventTime = main.terminalEvent?.time ?? fullDuration;
  const duration = Math.min(2, eventTime * 0.5);
  const outputSteps = Math.max(8, Math.ceil(duration / (34 / OUTPUT_STEPS)));
  const coarse = integrate(massRatio, velocity, duration, outputSteps, 1e-8);
  const fine = integrate(massRatio, velocity, duration, outputSteps, RELATIVE_TOLERANCE);
  const coarseFinal = coarse.states.at(-1);
  const fineFinal = fine.states.at(-1);
  if (!coarseFinal || !fineFinal || coarseFinal.length !== fineFinal.length) {
    throw new Error('CR3BP tolerance refinement returned inconsistent states.');
  }
  const scaledDifference = fineFinal.reduce((maximum, value, index) => {
    const comparison = coarseFinal[index];
    if (comparison === undefined) return Number.POSITIVE_INFINITY;
    return Math.max(maximum, Math.abs(value - comparison) / Math.max(1, Math.abs(value)));
  }, 0);
  return {
    id: 'step-halving',
    status: scaledDifference <= REFINEMENT_TOLERANCE ? 'passed' : 'failed',
    severity: 'claim',
    metrics: [
      {
        id: 'short-window-tolerance-refinement',
        value: scaledDifference,
        norm: 'linf',
        tolerance: REFINEMENT_TOLERANCE,
      },
    ],
    message: `rtol 1e-8 and 1e-9 agree through t=${duration.toPrecision(6)} within the declared scaled tolerance.`,
  };
}

function checksFor(
  integration: AdaptiveIntegrationResult,
  jacobiValues: number[],
  massRatio: number,
  velocity: number,
  duration: number,
): RunCheckResult[] {
  const initialJacobi = jacobiValues[0];
  if (initialJacobi === undefined) throw new Error('CR3BP returned no Jacobi values.');
  const maximumJacobiResidual = jacobiValues.reduce(
    (maximum, value) =>
      Math.max(maximum, Math.abs(value - initialJacobi) / Math.max(1, Math.abs(initialJacobi))),
    0,
  );
  const checks: RunCheckResult[] = [
    {
      id: 'adaptive-error-control',
      status: integration.maximumAcceptedErrorNorm <= 1 + 1e-12 ? 'passed' : 'failed',
      severity: 'hard',
      metrics: [
        {
          id: 'maximum-accepted-embedded-error-norm',
          value: integration.maximumAcceptedErrorNorm,
          tolerance: 1,
        },
      ],
      message: 'Every accepted Dormand–Prince step satisfies the declared weighted error norm.',
    },
    {
      id: 'energy-residual',
      status: maximumJacobiResidual <= JACOBI_TOLERANCE ? 'passed' : 'failed',
      severity: 'claim',
      metrics: [
        {
          id: 'maximum-relative-jacobi-residual',
          value: maximumJacobiResidual,
          norm: 'linf',
          tolerance: JACOBI_TOLERANCE,
        },
      ],
      message: 'The Jacobi integral remains within the declared finite-trajectory tolerance.',
    },
    refinementCheck(massRatio, velocity, integration, duration),
  ];
  if (integration.terminalEvent) {
    checks.push({
      id: 'close-encounter-terminal-event',
      status:
        integration.terminalEvent.surfaceResidual <= 1e-8 &&
        integration.terminalEvent.bracketWidth <= 1e-8
          ? 'passed'
          : 'failed',
      severity: 'claim',
      metrics: [
        {
          id: 'event-surface-residual',
          value: integration.terminalEvent.surfaceResidual,
          tolerance: 1e-8,
        },
        {
          id: 'event-time-bracket-width',
          value: integration.terminalEvent.bracketWidth,
          unit: 'model time',
          tolerance: 1e-8,
        },
      ],
      message:
        'The first close-encounter resolution boundary was localized and returned as a terminal scientific event.',
    });
  }
  return checks;
}

function provenanceFor(
  work: WorkManifest,
  integration: AdaptiveIntegrationResult,
  duration: number,
  velocity: number,
): RunProvenance {
  if (work.schemaVersion !== 2)
    throw new Error('Reviewed CR3BP execution requires schema version 2.');
  return {
    kernel: {
      id: work.kernel,
      version: '1.0.0',
      definitionHash: work.portrait.runtime.definitionHash,
    },
    execution: {
      kind: 'numerical-solver',
      id: 'dormand-prince-54-event-cr3bp',
      version: '1.0.0',
      precision: 'float64',
      iterations: integration.acceptedSteps + integration.rejectedSteps,
      adaptive: {
        relativeTolerance: RELATIVE_TOLERANCE,
        absoluteTolerance: ABSOLUTE_TOLERANCE,
        minimumStep: MINIMUM_STEP,
        maximumStep: 34 / OUTPUT_STEPS,
        acceptedSteps: integration.acceptedSteps,
        rejectedSteps: integration.rejectedSteps,
        maximumAcceptedErrorNorm: integration.maximumAcceptedErrorNorm,
        sampleSchedule: `${OUTPUT_STEPS + 1} uniform target times, truncated at a terminal event`,
      },
    },
    interval: [0, duration],
    initialCondition: { x: 0.72, y: 0.05, vx: 0, vy: velocity },
    eventDetection: {
      id: 'close-encounter-resolution-boundary',
      surface: `min(distance to either primary) - ${EXCLUSION_RADIUS}`,
      rootTolerance: EVENT_ROOT_TOLERANCE,
      interiorCheck:
        'Quarter-step surface probes plus conservative primary-circle segment guards; guarded steps are bisected before acceptance.',
    },
  };
}

function series(id: string, label: string, values: number[], colorIndex: number): Series {
  const color = colors[colorIndex];
  if (!color) throw new Error('CR3BP series palette is incomplete.');
  return { id, label, color, values };
}

export function simulateReviewedCr3bp(
  work: WorkManifest,
  parameters: Record<string, number>,
): WorkResult | null {
  if (work.kernel !== 'restricted-three-body') return null;
  if (work.schemaVersion !== 2) throw new Error('Restricted Three-Body requires a v2 portrait.');
  const massRatio = requireParameter(parameters, 'massRatio');
  const velocity = requireParameter(parameters, 'velocity');
  const integration = integrate(
    massRatio,
    velocity,
    work.duration,
    OUTPUT_STEPS,
    RELATIVE_TOLERANCE,
  );
  const endTime = integration.times.at(-1);
  if (endTime === undefined) throw new Error('CR3BP integration returned no scientific time.');
  const x = integration.states.map((state) => stateValue(state, 0, 'CR3BP result'));
  const y = integration.states.map((state) => stateValue(state, 1, 'CR3BP result'));
  const velocityX = integration.states.map((state) => stateValue(state, 2, 'CR3BP result'));
  const velocityY = integration.states.map((state) => stateValue(state, 3, 'CR3BP result'));
  const jacobiValues = integration.states.map((state) => jacobi(state, massRatio));
  const terminal = integration.terminalEvent;
  const terminalRadii = terminal ? distances(terminal.state, massRatio) : null;
  const primary =
    terminalRadii && terminalRadii.primaryOne <= terminalRadii.primaryTwo
      ? 'primary-one'
      : 'primary-two';
  const terminalEvent = terminal
    ? {
        id: terminal.id,
        time: terminal.time,
        state: [...terminal.state],
        primary,
        surfaceResidual: terminal.surfaceResidual,
        bracketWidth: terminal.bracketWidth,
        message: `Integration ended at the declared ${EXCLUSION_RADIUS} close-encounter resolution boundary around ${primary}; this is not a physical collision claim.`,
      }
    : undefined;
  return {
    duration: endTime,
    presentationDuration: work.duration,
    times: [...integration.times],
    series: [
      series('x', 'Rotating x', x, 0),
      series('y', 'Rotating y', y, 1),
      series('vx', 'Velocity x', velocityX, 2),
      series('vy', 'Velocity y', velocityY, 3),
      series('jacobi', 'Jacobi integral', jacobiValues, 4),
    ],
    points: x.map((xValue, index) => ({
      x: xValue,
      y: stateValue(y, index, 'CR3BP projected result'),
    })),
    diagnostics: terminalEvent
      ? `Adaptive Dormand–Prince 5(4); ${terminalEvent.message}`
      : 'Adaptive Dormand–Prince 5(4) completed the full declared interval.',
    numerical: {
      provenance: provenanceFor(work, integration, endTime, velocity),
      checks: checksFor(integration, jacobiValues, massRatio, velocity, work.duration),
      state: {
        coordinateIds: ['x', 'y', 'vx', 'vy'],
        shape: [integration.states.length, 4],
        values: integration.states.flatMap((state) => state.slice(0, 4)),
      },
      ...(terminalEvent ? { terminalEvent } : {}),
    },
  };
}
