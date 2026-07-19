export type FoundationKernelId = 'lorenz-foundation' | 'fed-reaction-chain-foundation';

export interface FoundationSeries {
  id: string;
  label: string;
  unit: string;
  values: Float64Array;
}

export interface FoundationCheck {
  id: string;
  category: 'convergence' | 'equilibrium' | 'boundedness' | 'statistic' | 'constraint';
  status: 'passed' | 'failed' | 'observed';
  value: number;
  unit: string;
  comparison: 'less-than-or-equal' | 'greater-than-or-equal' | 'informational';
  tolerance?: number;
  scope: {
    startTime: number;
    endTime: number;
    description: string;
  };
  description: string;
}

export interface FoundationProvenance {
  kernelId: FoundationKernelId;
  version: 1;
  reviewedProfileId: string;
  equation: string;
  parameters: Readonly<Record<string, number>>;
  initialCondition: Readonly<Record<string, number>>;
  solver: {
    id: 'classical-rk4-fixed-v1';
    precision: 'float64';
    stepSize: number;
    duration: number;
    steps: number;
    comparisonStepSize: number;
    comparisonDuration: number;
  };
  forcing?: {
    id: 'sinusoidal-feed-v1';
    formula: string;
    meanMultiplier: number;
    oscillationMultiplier: number;
    period: number;
    angularFrequency: number;
    phase: number;
    minimumRate: number;
    maximumRate: number;
  };
}

export interface FoundationKernelResult {
  times: Float64Array;
  state: {
    components: FoundationSeries[];
  };
  observables: FoundationSeries[];
  provenance: FoundationProvenance;
  checks: FoundationCheck[];
}

export type FoundationKernelErrorKind =
  'invalid-input' | 'browser-budget' | 'dimension-mismatch' | 'non-finite' | 'constraint-violation';

export class FoundationKernelError extends Error {
  readonly kind: FoundationKernelErrorKind;
  readonly kernelId: FoundationKernelId;
  readonly step: number | undefined;
  readonly time: number | undefined;

  constructor(
    kind: FoundationKernelErrorKind,
    kernelId: FoundationKernelId,
    message: string,
    step?: number,
    time?: number,
  ) {
    super(message);
    this.name = 'FoundationKernelError';
    this.kind = kind;
    this.kernelId = kernelId;
    this.step = step;
    this.time = time;
  }
}

export const LORENZ_REVIEWED_PROFILE = Object.freeze({
  id: 'lorenz-standard-rk4-v1',
  duration: 38,
  stepSize: 0.005,
  comparisonDuration: 1,
  comparisonStepSize: 0.0025,
  burnIn: 5,
  boundedNormLimit: 65,
  recurrenceSampleStride: 10,
  recurrenceMinimumLag: 2,
  recurrenceDistanceThreshold: 0.08,
  recurrenceScales: Object.freeze({ x: 20, y: 30, z: 50 }),
  stepHalvingTolerance: 1e-4,
} as const);

export const FED_REACTION_CHAIN_REVIEWED_PROFILE = Object.freeze({
  id: 'fed-reaction-chain-rk4-v1',
  duration: 60,
  stepSize: 0.05,
  comparisonStepSize: 0.025,
  feedMeanMultiplier: 0.78,
  feedOscillationMultiplier: 0.22,
  feedPeriod: 18,
  secondTransferMultiplier: 0.72,
  collectionMultiplier: 0.48,
  stepHalvingTolerance: 1e-6,
} as const);

const MAX_BROWSER_STEPS = 20_000;
const HARD_STATE_MAGNITUDE_LIMIT = 1e6;

type Derivative = (time: number, state: Float64Array, output: Float64Array) => void;
type StateConstraint = (
  next: Float64Array,
  previous: Float64Array,
  step: number,
  time: number,
) => void;

interface IntegratedTrajectory {
  times: Float64Array;
  components: Float64Array[];
}

function finiteInput(kernelId: FoundationKernelId, name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new FoundationKernelError('invalid-input', kernelId, `${name} must be finite`);
  }
  return value;
}

function positiveInput(kernelId: FoundationKernelId, name: string, value: number): number {
  finiteInput(kernelId, name, value);
  if (value <= 0) {
    throw new FoundationKernelError('invalid-input', kernelId, `${name} must be greater than zero`);
  }
  return value;
}

function nonnegativeInput(kernelId: FoundationKernelId, name: string, value: number): number {
  finiteInput(kernelId, name, value);
  if (value < 0) {
    throw new FoundationKernelError('invalid-input', kernelId, `${name} must be nonnegative`);
  }
  return value;
}

function stepsFor(kernelId: FoundationKernelId, duration: number, stepSize: number): number {
  const steps = Math.round(duration / stepSize);
  if (Math.abs(steps * stepSize - duration) > 1e-12) {
    throw new FoundationKernelError(
      'invalid-input',
      kernelId,
      'reviewed duration must be an integer multiple of the solver step',
    );
  }
  return steps;
}

function enforceBrowserBudget(kernelId: FoundationKernelId, totalSteps: number) {
  if (!Number.isSafeInteger(totalSteps) || totalSteps > MAX_BROWSER_STEPS) {
    throw new FoundationKernelError(
      'browser-budget',
      kernelId,
      `reviewed solver requests ${totalSteps} steps; budget is ${MAX_BROWSER_STEPS}`,
    );
  }
}

function ensureFiniteVector(
  kernelId: FoundationKernelId,
  values: Float64Array,
  label: string,
  step: number,
  time: number,
) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      throw new FoundationKernelError(
        'non-finite',
        kernelId,
        `${label}[${index}] became non-finite at t=${time}`,
        step,
        time,
      );
    }
    if (Math.abs(value) > HARD_STATE_MAGNITUDE_LIMIT) {
      throw new FoundationKernelError(
        'constraint-violation',
        kernelId,
        `${label}[${index}] exceeded the reviewed magnitude limit at t=${time}`,
        step,
        time,
      );
    }
  }
}

function requireComponent(
  kernelId: FoundationKernelId,
  components: Float64Array[],
  index: number,
  expectedLength: number,
  label: string,
): Float64Array {
  const component = components[index];
  if (component === undefined || component.length !== expectedLength) {
    throw new FoundationKernelError(
      'dimension-mismatch',
      kernelId,
      `${label} must have length ${expectedLength}`,
    );
  }
  return component;
}

function requireNumber(values: number[], index: number, label: string): number {
  const value = values[index];
  if (value === undefined) {
    throw new FoundationKernelError(
      'dimension-mismatch',
      'lorenz-foundation',
      `${label}[${index}] is missing`,
    );
  }
  return value;
}

function requireLastValue(
  kernelId: FoundationKernelId,
  values: Float64Array,
  label: string,
): number {
  if (values.length === 0) {
    throw new FoundationKernelError('dimension-mismatch', kernelId, `${label} is empty`);
  }
  return values[values.length - 1];
}

function integrateRk4(
  kernelId: FoundationKernelId,
  initial: Float64Array,
  stepSize: number,
  steps: number,
  derivative: Derivative,
  constraint?: StateConstraint,
): IntegratedTrajectory {
  const dimension = initial.length;
  let state = initial.slice();
  let next = new Float64Array(dimension);
  const stage = new Float64Array(dimension);
  const k1 = new Float64Array(dimension);
  const k2 = new Float64Array(dimension);
  const k3 = new Float64Array(dimension);
  const k4 = new Float64Array(dimension);
  const times = new Float64Array(steps + 1);
  const components = Array.from({ length: dimension }, () => new Float64Array(steps + 1));
  for (let component = 0; component < dimension; component += 1) {
    requireComponent(kernelId, components, component, steps + 1, 'integration component')[0] =
      state[component];
  }

  for (let step = 1; step <= steps; step += 1) {
    const time = (step - 1) * stepSize;
    derivative(time, state, k1);
    ensureFiniteVector(kernelId, k1, 'k1', step, time);
    for (let index = 0; index < dimension; index += 1) {
      stage[index] = state[index] + (stepSize / 2) * k1[index];
    }
    derivative(time + stepSize / 2, stage, k2);
    ensureFiniteVector(kernelId, k2, 'k2', step, time + stepSize / 2);
    for (let index = 0; index < dimension; index += 1) {
      stage[index] = state[index] + (stepSize / 2) * k2[index];
    }
    derivative(time + stepSize / 2, stage, k3);
    ensureFiniteVector(kernelId, k3, 'k3', step, time + stepSize / 2);
    for (let index = 0; index < dimension; index += 1) {
      stage[index] = state[index] + stepSize * k3[index];
    }
    derivative(time + stepSize, stage, k4);
    ensureFiniteVector(kernelId, k4, 'k4', step, time + stepSize);
    for (let index = 0; index < dimension; index += 1) {
      next[index] =
        state[index] + (stepSize / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]);
    }
    const nextTime = step * stepSize;
    ensureFiniteVector(kernelId, next, 'state', step, nextTime);
    constraint?.(next, state, step, nextTime);
    [state, next] = [next, state];
    times[step] = nextTime;
    for (let component = 0; component < dimension; component += 1) {
      requireComponent(kernelId, components, component, steps + 1, 'integration component')[step] =
        state[component];
    }
  }

  return { times, components };
}

function series(id: string, label: string, unit: string, values: Float64Array): FoundationSeries {
  return { id, label, unit, values };
}

function maxAlignedDifference(
  kernelId: FoundationKernelId,
  coarse: IntegratedTrajectory,
  fine: IntegratedTrajectory,
  fineStepsPerCoarseStep: number,
  coarseStepsToCompare: number,
): number {
  if (coarse.components.length !== fine.components.length) {
    throw new FoundationKernelError(
      'dimension-mismatch',
      kernelId,
      'coarse and fine trajectories have different component counts',
    );
  }
  let maximum = 0;
  for (let component = 0; component < coarse.components.length; component += 1) {
    const coarseValues = requireComponent(
      kernelId,
      coarse.components,
      component,
      coarse.times.length,
      'coarse component',
    );
    const fineValues = requireComponent(
      kernelId,
      fine.components,
      component,
      fine.times.length,
      'fine component',
    );
    if (
      coarseStepsToCompare >= coarseValues.length ||
      coarseStepsToCompare * fineStepsPerCoarseStep >= fineValues.length
    ) {
      throw new FoundationKernelError(
        'dimension-mismatch',
        kernelId,
        'aligned comparison exceeds a trajectory buffer',
      );
    }
    for (let step = 0; step <= coarseStepsToCompare; step += 1) {
      maximum = Math.max(
        maximum,
        Math.abs(coarseValues[step] - fineValues[step * fineStepsPerCoarseStep]),
      );
    }
  }
  return maximum;
}

function checkStatus(value: number, tolerance: number): 'passed' | 'failed' {
  return value <= tolerance ? 'passed' : 'failed';
}

export interface LorenzKernelOptions {
  sigma?: number;
  rho?: number;
  beta?: number;
  initialCondition?: { x: number; y: number; z: number };
}

function lorenzDerivative(sigma: number, rho: number, beta: number): Derivative {
  return (_time, state, output) => {
    if (state.length !== 3 || output.length !== 3) {
      throw new FoundationKernelError(
        'dimension-mismatch',
        'lorenz-foundation',
        'Lorenz derivative requires exactly three state components',
      );
    }
    const x = state[0];
    const y = state[1];
    const z = state[2];
    output[0] = sigma * (y - x);
    output[1] = x * (rho - z) - y;
    output[2] = x * y - beta * z;
  };
}

function lorenzEquilibriumResidual(
  sigma: number,
  rho: number,
  beta: number,
  derivative: Derivative,
): number {
  const equilibria: Float64Array[] = [new Float64Array([0, 0, 0])];
  if (rho > 1) {
    const coordinate = Math.sqrt(beta * (rho - 1));
    equilibria.push(
      new Float64Array([coordinate, coordinate, rho - 1]),
      new Float64Array([-coordinate, -coordinate, rho - 1]),
    );
  }
  const residual = new Float64Array(3);
  let maximum = 0;
  for (const equilibrium of equilibria) {
    derivative(0, equilibrium, residual);
    for (const value of residual) maximum = Math.max(maximum, Math.abs(value));
  }
  finiteInput('lorenz-foundation', 'equilibrium residual', maximum);
  finiteInput('lorenz-foundation', 'sigma', sigma);
  return maximum;
}

function lorenzPostBurnInChecks(
  trajectory: IntegratedTrajectory,
  burnInStep: number,
): { checks: FoundationCheck[]; lobeIndicator: Float64Array; radius: Float64Array } {
  if (trajectory.components.length !== 3 || burnInStep >= trajectory.times.length) {
    throw new FoundationKernelError(
      'dimension-mismatch',
      'lorenz-foundation',
      'Lorenz portrait requires three full components and an in-range burn-in step',
    );
  }
  const x = requireComponent(
    'lorenz-foundation',
    trajectory.components,
    0,
    trajectory.times.length,
    'Lorenz x',
  );
  const y = requireComponent(
    'lorenz-foundation',
    trajectory.components,
    1,
    trajectory.times.length,
    'Lorenz y',
  );
  const z = requireComponent(
    'lorenz-foundation',
    trajectory.components,
    2,
    trajectory.times.length,
    'Lorenz z',
  );
  const lobeIndicator = new Float64Array(trajectory.times.length);
  const radius = new Float64Array(trajectory.times.length);
  let maximumNorm = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let transitions = 0;
  let previousLobe = 0;
  for (let index = 0; index < trajectory.times.length; index += 1) {
    const xValue = x[index];
    const norm = Math.hypot(xValue, y[index], z[index]);
    radius[index] = norm;
    const lobe = xValue >= 0 ? 1 : -1;
    lobeIndicator[index] = lobe;
    if (index < burnInStep) continue;
    maximumNorm = Math.max(maximumNorm, norm);
    if (lobe > 0) positiveCount += 1;
    else negativeCount += 1;
    if (previousLobe !== 0 && lobe !== previousLobe) transitions += 1;
    previousLobe = lobe;
  }
  const postBurnInCount = positiveCount + negativeCount;
  const smallerLobeFraction =
    postBurnInCount === 0 ? 0 : Math.min(positiveCount, negativeCount) / postBurnInCount;

  const sampleIndices: number[] = [];
  for (
    let step = burnInStep;
    step < trajectory.times.length;
    step += LORENZ_REVIEWED_PROFILE.recurrenceSampleStride
  ) {
    sampleIndices.push(step);
  }
  const minimumLagSamples = Math.ceil(
    LORENZ_REVIEWED_PROFILE.recurrenceMinimumLag /
      (LORENZ_REVIEWED_PROFILE.stepSize * LORENZ_REVIEWED_PROFILE.recurrenceSampleStride),
  );
  let eligible = 0;
  let recurrent = 0;
  for (let current = minimumLagSamples; current < sampleIndices.length; current += 1) {
    const currentIndex = requireNumber(sampleIndices, current, 'current recurrence sample');
    eligible += 1;
    let returned = false;
    for (let previous = 0; previous <= current - minimumLagSamples; previous += 1) {
      const previousIndex = requireNumber(sampleIndices, previous, 'previous recurrence sample');
      const distance = Math.hypot(
        (x[currentIndex] - x[previousIndex]) / LORENZ_REVIEWED_PROFILE.recurrenceScales.x,
        (y[currentIndex] - y[previousIndex]) / LORENZ_REVIEWED_PROFILE.recurrenceScales.y,
        (z[currentIndex] - z[previousIndex]) / LORENZ_REVIEWED_PROFILE.recurrenceScales.z,
      );
      if (distance <= LORENZ_REVIEWED_PROFILE.recurrenceDistanceThreshold) {
        returned = true;
        break;
      }
    }
    if (returned) recurrent += 1;
  }
  const recurrenceFraction = eligible === 0 ? 0 : recurrent / eligible;
  const startTime = LORENZ_REVIEWED_PROFILE.burnIn;
  const endTime = LORENZ_REVIEWED_PROFILE.duration;
  return {
    lobeIndicator,
    radius,
    checks: [
      {
        id: 'post-burn-in-bounded-norm',
        category: 'boundedness',
        status: checkStatus(maximumNorm, LORENZ_REVIEWED_PROFILE.boundedNormLimit),
        value: maximumNorm,
        unit: 'state norm',
        comparison: 'less-than-or-equal',
        tolerance: LORENZ_REVIEWED_PROFILE.boundedNormLimit,
        scope: { startTime, endTime, description: 'Euclidean norm after the declared burn-in.' },
        description: 'Finite-window boundedness check; it is not a proof of a global attractor.',
      },
      {
        id: 'two-lobe-minimum-occupancy',
        category: 'statistic',
        status: smallerLobeFraction >= 0.1 && transitions >= 2 ? 'passed' : 'failed',
        value: smallerLobeFraction,
        unit: 'fraction',
        comparison: 'greater-than-or-equal',
        tolerance: 0.1,
        scope: {
          startTime,
          endTime,
          description: 'Lobes are defined only by the sign of x; both must be revisited.',
        },
        description: `Smaller sign-lobe occupancy; ${transitions} sign transitions were observed.`,
      },
      {
        id: 'normalized-near-return-fraction',
        category: 'statistic',
        status: 'observed',
        value: recurrenceFraction,
        unit: 'fraction',
        comparison: 'informational',
        scope: {
          startTime,
          endTime,
          description:
            'Samples every 0.05 time units; minimum lag 2; normalized distance threshold 0.08.',
        },
        description:
          'Fraction of eligible post-burn-in samples with an earlier near return; finite-time and metric-dependent.',
      },
    ],
  };
}

export function simulateLorenzFoundation(
  options: LorenzKernelOptions = {},
): FoundationKernelResult {
  const kernelId = 'lorenz-foundation';
  const sigma = positiveInput(kernelId, 'sigma', options.sigma ?? 10);
  const rho = nonnegativeInput(kernelId, 'rho', options.rho ?? 28);
  const beta = positiveInput(kernelId, 'beta', options.beta ?? 8 / 3);
  const suppliedInitial = options.initialCondition ?? { x: 0.1, y: 0, z: 0 };
  const initialCondition = {
    x: finiteInput(kernelId, 'initialCondition.x', suppliedInitial.x),
    y: finiteInput(kernelId, 'initialCondition.y', suppliedInitial.y),
    z: finiteInput(kernelId, 'initialCondition.z', suppliedInitial.z),
  };
  const mainSteps = stepsFor(
    kernelId,
    LORENZ_REVIEWED_PROFILE.duration,
    LORENZ_REVIEWED_PROFILE.stepSize,
  );
  const comparisonSteps = stepsFor(
    kernelId,
    LORENZ_REVIEWED_PROFILE.comparisonDuration,
    LORENZ_REVIEWED_PROFILE.comparisonStepSize,
  );
  enforceBrowserBudget(kernelId, mainSteps + comparisonSteps);
  const derivative = lorenzDerivative(sigma, rho, beta);
  const initial = new Float64Array([initialCondition.x, initialCondition.y, initialCondition.z]);
  const main = integrateRk4(
    kernelId,
    initial,
    LORENZ_REVIEWED_PROFILE.stepSize,
    mainSteps,
    derivative,
  );
  const comparison = integrateRk4(
    kernelId,
    initial,
    LORENZ_REVIEWED_PROFILE.comparisonStepSize,
    comparisonSteps,
    derivative,
  );
  const coarseComparisonSteps = stepsFor(
    kernelId,
    LORENZ_REVIEWED_PROFILE.comparisonDuration,
    LORENZ_REVIEWED_PROFILE.stepSize,
  );
  const stepHalvingDifference = maxAlignedDifference(
    kernelId,
    main,
    comparison,
    2,
    coarseComparisonSteps,
  );
  const equilibriumResidual = lorenzEquilibriumResidual(sigma, rho, beta, derivative);
  const burnInStep = stepsFor(
    kernelId,
    LORENZ_REVIEWED_PROFILE.burnIn,
    LORENZ_REVIEWED_PROFILE.stepSize,
  );
  const portrait = lorenzPostBurnInChecks(main, burnInStep);
  const checks: FoundationCheck[] = [
    {
      id: 'short-time-step-halving',
      category: 'convergence',
      status: checkStatus(stepHalvingDifference, LORENZ_REVIEWED_PROFILE.stepHalvingTolerance),
      value: stepHalvingDifference,
      unit: 'state max norm',
      comparison: 'less-than-or-equal',
      tolerance: LORENZ_REVIEWED_PROFILE.stepHalvingTolerance,
      scope: {
        startTime: 0,
        endTime: LORENZ_REVIEWED_PROFILE.comparisonDuration,
        description: 'Maximum aligned component difference between dt=0.005 and dt=0.0025.',
      },
      description:
        'Short-time numerical convergence only; chaotic endpoints are not expected to converge over the full exhibit.',
    },
    {
      id: 'analytic-equilibrium-residual',
      category: 'equilibrium',
      status: checkStatus(equilibriumResidual, 1e-12),
      value: equilibriumResidual,
      unit: 'derivative max norm',
      comparison: 'less-than-or-equal',
      tolerance: 1e-12,
      scope: {
        startTime: 0,
        endTime: 0,
        description: 'Origin and, when rho>1, the two analytic nonzero equilibria.',
      },
      description: 'Maximum right-hand-side residual at the analytic Lorenz equilibria.',
    },
    ...portrait.checks,
  ];
  const x = requireComponent(kernelId, main.components, 0, main.times.length, 'Lorenz x');
  const y = requireComponent(kernelId, main.components, 1, main.times.length, 'Lorenz y');
  const z = requireComponent(kernelId, main.components, 2, main.times.length, 'Lorenz z');

  return {
    times: main.times,
    state: {
      components: [
        series('x', 'Convection amplitude x', '1', x),
        series('y', 'Temperature contrast y', '1', y),
        series('z', 'Vertical gradient z', '1', z),
      ],
    },
    observables: [
      series('state-radius', 'State-space radius', 'state norm', portrait.radius),
      series('sign-lobe', 'Sign-lobe indicator', 'sign', portrait.lobeIndicator),
    ],
    provenance: {
      kernelId,
      version: 1,
      reviewedProfileId: LORENZ_REVIEWED_PROFILE.id,
      equation: 'dx/dt=sigma(y-x); dy/dt=x(rho-z)-y; dz/dt=xy-beta z',
      parameters: { sigma, rho, beta },
      initialCondition,
      solver: {
        id: 'classical-rk4-fixed-v1',
        precision: 'float64',
        stepSize: LORENZ_REVIEWED_PROFILE.stepSize,
        duration: LORENZ_REVIEWED_PROFILE.duration,
        steps: mainSteps,
        comparisonStepSize: LORENZ_REVIEWED_PROFILE.comparisonStepSize,
        comparisonDuration: LORENZ_REVIEWED_PROFILE.comparisonDuration,
      },
    },
    checks,
  };
}

export interface FedReactionChainKernelOptions {
  feed?: number;
  rate?: number;
  initialCondition?: { a: number; b: number; c: number; collected: number };
}

function feedRate(time: number, feed: number): number {
  return (
    feed *
    (FED_REACTION_CHAIN_REVIEWED_PROFILE.feedMeanMultiplier +
      FED_REACTION_CHAIN_REVIEWED_PROFILE.feedOscillationMultiplier *
        Math.sin((2 * Math.PI * time) / FED_REACTION_CHAIN_REVIEWED_PROFILE.feedPeriod))
  );
}

function analyticCumulativeFeed(time: number, feed: number): number {
  const angularFrequency = (2 * Math.PI) / FED_REACTION_CHAIN_REVIEWED_PROFILE.feedPeriod;
  return (
    feed *
    (FED_REACTION_CHAIN_REVIEWED_PROFILE.feedMeanMultiplier * time +
      (FED_REACTION_CHAIN_REVIEWED_PROFILE.feedOscillationMultiplier / angularFrequency) *
        (1 - Math.cos(angularFrequency * time)))
  );
}

export function simulateFedReactionChainFoundation(
  options: FedReactionChainKernelOptions = {},
): FoundationKernelResult {
  const kernelId = 'fed-reaction-chain-foundation';
  const feed = nonnegativeInput(kernelId, 'feed', options.feed ?? 1.05);
  const rate = nonnegativeInput(kernelId, 'rate', options.rate ?? 0.42);
  const suppliedInitial = options.initialCondition ?? { a: 0.2, b: 0.05, c: 0, collected: 0 };
  const initialCondition = {
    a: nonnegativeInput(kernelId, 'initialCondition.a', suppliedInitial.a),
    b: nonnegativeInput(kernelId, 'initialCondition.b', suppliedInitial.b),
    c: nonnegativeInput(kernelId, 'initialCondition.c', suppliedInitial.c),
    collected: nonnegativeInput(kernelId, 'initialCondition.collected', suppliedInitial.collected),
  };
  const mainSteps = stepsFor(
    kernelId,
    FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
    FED_REACTION_CHAIN_REVIEWED_PROFILE.stepSize,
  );
  const comparisonSteps = stepsFor(
    kernelId,
    FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
    FED_REACTION_CHAIN_REVIEWED_PROFILE.comparisonStepSize,
  );
  enforceBrowserBudget(kernelId, mainSteps + comparisonSteps);
  const secondRate = FED_REACTION_CHAIN_REVIEWED_PROFILE.secondTransferMultiplier * rate;
  const collectionRate = FED_REACTION_CHAIN_REVIEWED_PROFILE.collectionMultiplier * rate;
  const derivative: Derivative = (time, state, output) => {
    if (state.length !== 8 || output.length !== 8) {
      throw new FoundationKernelError(
        'dimension-mismatch',
        kernelId,
        'Fed Reaction Chain derivative requires four material and four cumulative components',
      );
    }
    const a = state[0];
    const b = state[1];
    const c = state[2];
    const inputFlux = feedRate(time, feed);
    const aToB = rate * a;
    const bToC = secondRate * b;
    const cToCollected = collectionRate * c;
    output[0] = inputFlux - aToB;
    output[1] = aToB - bToC;
    output[2] = bToC - cToCollected;
    output[3] = cToCollected;
    output[4] = inputFlux;
    output[5] = aToB;
    output[6] = bToC;
    output[7] = cToCollected;
  };
  const positivityConstraint: StateConstraint = (next, previous, step, time) => {
    if (next.length !== 8 || previous.length !== 8) {
      throw new FoundationKernelError(
        'dimension-mismatch',
        kernelId,
        'Fed Reaction Chain constraint requires eight state and accounting components',
      );
    }
    for (let index = 0; index < next.length; index += 1) {
      if (next[index] < 0) {
        throw new FoundationKernelError(
          'constraint-violation',
          kernelId,
          `state ${index} became negative at t=${time}`,
          step,
          time,
        );
      }
    }
    for (let index = 3; index < next.length; index += 1) {
      if (next[index] < previous[index]) {
        throw new FoundationKernelError(
          'constraint-violation',
          kernelId,
          `cumulative state ${index} decreased at t=${time}`,
          step,
          time,
        );
      }
    }
  };
  const initial = new Float64Array([
    initialCondition.a,
    initialCondition.b,
    initialCondition.c,
    initialCondition.collected,
    0,
    0,
    0,
    0,
  ]);
  const main = integrateRk4(
    kernelId,
    initial,
    FED_REACTION_CHAIN_REVIEWED_PROFILE.stepSize,
    mainSteps,
    derivative,
    positivityConstraint,
  );
  const comparison = integrateRk4(
    kernelId,
    initial,
    FED_REACTION_CHAIN_REVIEWED_PROFILE.comparisonStepSize,
    comparisonSteps,
    derivative,
    positivityConstraint,
  );
  const stepHalvingDifference = maxAlignedDifference(kernelId, main, comparison, 2, mainSteps);
  if (main.components.length !== 8) {
    throw new FoundationKernelError(
      'dimension-mismatch',
      kernelId,
      'Fed Reaction Chain result requires eight material and accounting components',
    );
  }
  const a = requireComponent(kernelId, main.components, 0, main.times.length, 'Fed A');
  const b = requireComponent(kernelId, main.components, 1, main.times.length, 'Fed B');
  const c = requireComponent(kernelId, main.components, 2, main.times.length, 'Fed C');
  const collected = requireComponent(
    kernelId,
    main.components,
    3,
    main.times.length,
    'Fed collected',
  );
  const cumulativeInput = requireComponent(
    kernelId,
    main.components,
    4,
    main.times.length,
    'Fed cumulative input',
  );
  const cumulativeAToB = requireComponent(
    kernelId,
    main.components,
    5,
    main.times.length,
    'Fed cumulative A to B transfer',
  );
  const cumulativeBToC = requireComponent(
    kernelId,
    main.components,
    6,
    main.times.length,
    'Fed cumulative B to C transfer',
  );
  const cumulativeCToCollected = requireComponent(
    kernelId,
    main.components,
    7,
    main.times.length,
    'Fed cumulative C to collected transfer',
  );
  const inputFlux = new Float64Array(main.times.length);
  const aToBFlux = new Float64Array(main.times.length);
  const bToCFlux = new Float64Array(main.times.length);
  const cToCollectedFlux = new Float64Array(main.times.length);
  const massBalanceResidual = new Float64Array(main.times.length);
  const initialMass =
    initialCondition.a + initialCondition.b + initialCondition.c + initialCondition.collected;
  let minimumState = Number.POSITIVE_INFINITY;
  let maximumMassResidual = 0;
  let maximumFeedIntegralResidual = 0;
  let minimumCumulativeIncrement = Number.POSITIVE_INFINITY;
  for (let index = 0; index < main.times.length; index += 1) {
    const time = main.times[index];
    inputFlux[index] = feedRate(time, feed);
    aToBFlux[index] = rate * a[index];
    bToCFlux[index] = secondRate * b[index];
    cToCollectedFlux[index] = collectionRate * c[index];
    const residual =
      a[index] + b[index] + c[index] + collected[index] - initialMass - cumulativeInput[index];
    massBalanceResidual[index] = residual;
    maximumMassResidual = Math.max(maximumMassResidual, Math.abs(residual));
    maximumFeedIntegralResidual = Math.max(
      maximumFeedIntegralResidual,
      Math.abs(cumulativeInput[index] - analyticCumulativeFeed(time, feed)),
    );
    minimumState = Math.min(
      minimumState,
      a[index],
      b[index],
      c[index],
      collected[index],
      cumulativeInput[index],
    );
    if (index > 0) {
      minimumCumulativeIncrement = Math.min(
        minimumCumulativeIncrement,
        cumulativeInput[index] - cumulativeInput[index - 1],
        collected[index] - collected[index - 1],
        cumulativeAToB[index] - cumulativeAToB[index - 1],
        cumulativeBToC[index] - cumulativeBToC[index - 1],
        cumulativeCToCollected[index] - cumulativeCToCollected[index - 1],
      );
    }
  }
  const finalCumulativeInput = requireLastValue(kernelId, cumulativeInput, 'cumulative input');
  const finalExpectedMass = initialMass + finalCumulativeInput;
  const massTolerance = 1e-9 * Math.max(1, Math.abs(finalExpectedMass));
  if (maximumMassResidual > massTolerance) {
    throw new FoundationKernelError(
      'constraint-violation',
      kernelId,
      `mass-balance residual ${maximumMassResidual} exceeds ${massTolerance}`,
    );
  }
  const feedIntegralTolerance = 1e-8 * Math.max(1, Math.abs(finalCumulativeInput));
  const forcingFormula =
    'I(t)=feed*[0.78+0.22*sin(2*pi*t/18)]; dA/dt=I-kA; dB/dt=kA-0.72kB; dC/dt=0.72kB-0.48kC; dCollected/dt=0.48kC; cumulative flux states integrate I, kA, 0.72kB, and 0.48kC';
  const checks: FoundationCheck[] = [
    {
      id: 'state-positivity',
      category: 'constraint',
      status: minimumState >= 0 ? 'passed' : 'failed',
      value: minimumState,
      unit: 'amount',
      comparison: 'greater-than-or-equal',
      tolerance: 0,
      scope: {
        startTime: 0,
        endTime: FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
        description:
          'A, B, C, collected amount, cumulative input, and cumulative transfers over every stored step.',
      },
      description: 'Negative values abort integration; no post-hoc positivity clamp is used.',
    },
    {
      id: 'mass-balance-residual',
      category: 'constraint',
      status: checkStatus(maximumMassResidual, massTolerance),
      value: maximumMassResidual,
      unit: 'amount',
      comparison: 'less-than-or-equal',
      tolerance: massTolerance,
      scope: {
        startTime: 0,
        endTime: FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
        description: 'A+B+C+Collected minus initial mass minus cumulative input.',
      },
      description: 'Maximum absolute open-system balance residual across the trajectory.',
    },
    {
      id: 'full-window-step-halving',
      category: 'convergence',
      status: checkStatus(
        stepHalvingDifference,
        FED_REACTION_CHAIN_REVIEWED_PROFILE.stepHalvingTolerance,
      ),
      value: stepHalvingDifference,
      unit: 'state max norm',
      comparison: 'less-than-or-equal',
      tolerance: FED_REACTION_CHAIN_REVIEWED_PROFILE.stepHalvingTolerance,
      scope: {
        startTime: 0,
        endTime: FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
        description: 'Maximum aligned state difference between dt=0.05 and dt=0.025.',
      },
      description: 'Step-halving comparison includes all material and accounting states.',
    },
    {
      id: 'analytic-feed-integral-residual',
      category: 'constraint',
      status: checkStatus(maximumFeedIntegralResidual, feedIntegralTolerance),
      value: maximumFeedIntegralResidual,
      unit: 'amount',
      comparison: 'less-than-or-equal',
      tolerance: feedIntegralTolerance,
      scope: {
        startTime: 0,
        endTime: FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
        description: 'Numerical cumulative input versus the closed-form integral of I(t).',
      },
      description: 'Independent reference for the explicitly declared sinusoidal forcing.',
    },
    {
      id: 'cumulative-monotonicity',
      category: 'constraint',
      status: minimumCumulativeIncrement >= 0 ? 'passed' : 'failed',
      value: minimumCumulativeIncrement,
      unit: 'amount per stored step',
      comparison: 'greater-than-or-equal',
      tolerance: 0,
      scope: {
        startTime: 0,
        endTime: FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
        description: 'Minimum increment of every integrated cumulative quantity.',
      },
      description: 'Cumulative quantities are integrated states and are never forced monotone.',
    },
  ];

  return {
    times: main.times,
    state: {
      components: [
        series('a', 'Reactant A', 'amount', a),
        series('b', 'Intermediate B', 'amount', b),
        series('c', 'Product C', 'amount', c),
        series('collected', 'Collected output', 'amount', collected),
      ],
    },
    observables: [
      series('input-flux', 'Input flux', 'amount/time', inputFlux),
      series('a-to-b-flux', 'A to B flux', 'amount/time', aToBFlux),
      series('b-to-c-flux', 'B to C flux', 'amount/time', bToCFlux),
      series('c-to-collected-flux', 'C to collected flux', 'amount/time', cToCollectedFlux),
      series('cumulative-input', 'Cumulative input', 'amount', cumulativeInput),
      series('a-to-b-cumulative', 'Cumulative A to B transfer', 'amount', cumulativeAToB),
      series('b-to-c-cumulative', 'Cumulative B to C transfer', 'amount', cumulativeBToC),
      series(
        'c-to-collected-cumulative',
        'Cumulative C to collected transfer',
        'amount',
        cumulativeCToCollected,
      ),
      series('mass-balance-residual', 'Mass-balance residual', 'amount', massBalanceResidual),
    ],
    provenance: {
      kernelId,
      version: 1,
      reviewedProfileId: FED_REACTION_CHAIN_REVIEWED_PROFILE.id,
      equation: forcingFormula,
      parameters: {
        feed,
        rate,
        secondRate,
        collectionRate,
      },
      initialCondition,
      solver: {
        id: 'classical-rk4-fixed-v1',
        precision: 'float64',
        stepSize: FED_REACTION_CHAIN_REVIEWED_PROFILE.stepSize,
        duration: FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
        steps: mainSteps,
        comparisonStepSize: FED_REACTION_CHAIN_REVIEWED_PROFILE.comparisonStepSize,
        comparisonDuration: FED_REACTION_CHAIN_REVIEWED_PROFILE.duration,
      },
      forcing: {
        id: 'sinusoidal-feed-v1',
        formula: 'I(t)=feed*[0.78+0.22*sin(2*pi*t/18)]',
        meanMultiplier: FED_REACTION_CHAIN_REVIEWED_PROFILE.feedMeanMultiplier,
        oscillationMultiplier: FED_REACTION_CHAIN_REVIEWED_PROFILE.feedOscillationMultiplier,
        period: FED_REACTION_CHAIN_REVIEWED_PROFILE.feedPeriod,
        angularFrequency: (2 * Math.PI) / FED_REACTION_CHAIN_REVIEWED_PROFILE.feedPeriod,
        phase: 0,
        minimumRate:
          feed *
          (FED_REACTION_CHAIN_REVIEWED_PROFILE.feedMeanMultiplier -
            FED_REACTION_CHAIN_REVIEWED_PROFILE.feedOscillationMultiplier),
        maximumRate:
          feed *
          (FED_REACTION_CHAIN_REVIEWED_PROFILE.feedMeanMultiplier +
            FED_REACTION_CHAIN_REVIEWED_PROFILE.feedOscillationMultiplier),
      },
    },
    checks,
  };
}
