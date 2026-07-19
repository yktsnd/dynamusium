export type CollectiveKernelId = 'kuramoto' | 'fput';

export interface CollectiveObservable {
  id: string;
  label: string;
  unit: string;
  axis: 'time' | 'oscillator' | 'scalar';
  values: Float64Array;
}

export interface CollectiveCheckMetric {
  id: string;
  value: number;
  unit: string;
  norm?: 'absolute' | 'relative' | 'linf';
  tolerance?: number;
}

export interface CollectiveKernelCheck {
  id: string;
  status: 'passed' | 'failed';
  severity: 'hard' | 'claim';
  metrics: CollectiveCheckMetric[];
  message: string;
  /** A scientific claim is present only when the associated evidence passed. */
  claim?: string;
}

export interface CollectiveStateComponent {
  id: string;
  label: string;
  unit: string;
}

export interface CollectiveKernelProvenance {
  kernel: {
    id: CollectiveKernelId;
    version: 1;
    equation: string;
  };
  execution: {
    method: 'classical-rk4-fixed-step' | 'velocity-verlet';
    precision: 'float64';
    stepSize: number;
    steps: number;
  };
  dynamics: 'deterministic';
  reproducibility: 'bitwise-deterministic';
  state: {
    layout: 'sample-major';
    dimension: number;
    components: CollectiveStateComponent[];
  };
  boundary: string;
  parameters: Readonly<Record<string, number | string>>;
  initialCondition: string;
  analysisWindow?: readonly [number, number];
}

/**
 * A kernel result contains numerical state and scientific observables only.
 * Screen coordinates, camera choices, and renderer geometry belong downstream.
 */
export interface CollectiveKernelResult {
  times: Float64Array;
  /** Flattened sample-major state with shape declared by `stateShape`. */
  rawState: Float64Array;
  stateShape: readonly [samples: number, stateDimension: number];
  observables: CollectiveObservable[];
  provenance: CollectiveKernelProvenance;
  checks: CollectiveKernelCheck[];
}

export type CollectiveKernelErrorKind = 'invalid-input' | 'budget-exceeded' | 'non-finite';

export class CollectiveKernelError extends Error {
  readonly kind: CollectiveKernelErrorKind;
  readonly kernelId: CollectiveKernelId;
  readonly step: number | undefined;
  readonly stateIndex: number | undefined;

  constructor(
    kind: CollectiveKernelErrorKind,
    kernelId: CollectiveKernelId,
    message: string,
    step?: number,
    stateIndex?: number,
  ) {
    super(message);
    this.name = 'CollectiveKernelError';
    this.kind = kind;
    this.kernelId = kernelId;
    this.step = step;
    this.stateIndex = stateIndex;
  }
}

export interface KuramotoOptions {
  coupling?: number;
  /** Scale in the repository's deterministic, equally spaced frequency construction; not sigma. */
  spread?: number;
  duration?: number;
  dt?: number;
  lockingTolerance?: number;
  initialPhases?: readonly number[];
}

export interface FputOptions {
  alpha?: number;
  amplitude?: number;
  duration?: number;
  dt?: number;
  energyTolerance?: number;
  recurrenceDepartureThreshold?: number;
  recurrenceTolerance?: number;
}

const KURAMOTO_COUNT = 12;
const FPUT_COUNT = 8;
// The reviewed FPUT profile needs 40,000 velocity-Verlet steps to cover the
// declared 400-unit recurrence window at dt=0.01 across the public domain.
const MAX_INTEGRATION_STEPS = 50_000;
const COHERENCE_ROUNDOFF_TOLERANCE = 1e-12;

interface TemporalPlan {
  duration: number;
  stepSize: number;
  steps: number;
  samples: number;
  times: Float64Array;
}

function finiteInput(kernelId: CollectiveKernelId, name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new CollectiveKernelError('invalid-input', kernelId, `${name} must be finite`);
  }
  return value;
}

function positiveInput(kernelId: CollectiveKernelId, name: string, value: number): number {
  finiteInput(kernelId, name, value);
  if (value <= 0) {
    throw new CollectiveKernelError('invalid-input', kernelId, `${name} must be greater than zero`);
  }
  return value;
}

function nonnegativeInput(kernelId: CollectiveKernelId, name: string, value: number): number {
  finiteInput(kernelId, name, value);
  if (value < 0) {
    throw new CollectiveKernelError('invalid-input', kernelId, `${name} must be nonnegative`);
  }
  return value;
}

function temporalPlan(
  kernelId: CollectiveKernelId,
  requestedDuration: number,
  requestedStepSize: number,
): TemporalPlan {
  const duration = positiveInput(kernelId, 'duration', requestedDuration);
  const stepSize = positiveInput(kernelId, 'dt', requestedStepSize);
  const quotient = duration / stepSize;
  const steps = Math.round(quotient);
  const integerTolerance = 1e-10 * Math.max(1, Math.abs(quotient));
  if (!Number.isSafeInteger(steps) || steps < 2 || Math.abs(quotient - steps) > integerTolerance) {
    throw new CollectiveKernelError(
      'invalid-input',
      kernelId,
      'duration must contain an integer number of fixed integration steps (at least two)',
    );
  }
  if (steps > MAX_INTEGRATION_STEPS) {
    throw new CollectiveKernelError(
      'budget-exceeded',
      kernelId,
      `requested ${steps} steps exceeds the browser budget of ${MAX_INTEGRATION_STEPS}`,
    );
  }
  const times = new Float64Array(steps + 1);
  for (let step = 0; step <= steps; step += 1) times[step] = step * stepSize;
  return { duration, stepSize, steps, samples: steps + 1, times };
}

function ensureFiniteArray(
  kernelId: CollectiveKernelId,
  values: Float64Array,
  label: string,
  step: number,
) {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new CollectiveKernelError(
        'non-finite',
        kernelId,
        `${label} became non-finite at step ${step}, index ${index}`,
        step,
        index,
      );
    }
  }
}

function ensureFiniteValue(
  kernelId: CollectiveKernelId,
  value: number,
  label: string,
  step: number,
): number {
  if (!Number.isFinite(value)) {
    throw new CollectiveKernelError(
      'non-finite',
      kernelId,
      `${label} became non-finite at step ${step}`,
      step,
    );
  }
  return value;
}

function timeObservable(
  id: string,
  label: string,
  unit: string,
  values: Float64Array,
): CollectiveObservable {
  return { id, label, unit, axis: 'time', values };
}

function indexedObservable(
  id: string,
  label: string,
  unit: string,
  values: Float64Array,
): CollectiveObservable {
  return { id, label, unit, axis: 'oscillator', values };
}

function scalarObservable(
  id: string,
  label: string,
  unit: string,
  value: number,
): CollectiveObservable {
  return { id, label, unit, axis: 'scalar', values: Float64Array.of(value) };
}

function recordRawState(
  rawState: Float64Array,
  sample: number,
  first: Float64Array,
  second?: Float64Array,
) {
  const dimension = first.length + (second?.length ?? 0);
  const offset = sample * dimension;
  rawState.set(first, offset);
  if (second !== undefined) rawState.set(second, offset + first.length);
}

function kuramotoFrequencies(spread: number): Float64Array {
  return Float64Array.from(
    { length: KURAMOTO_COUNT },
    (_, index) => spread * ((index - (KURAMOTO_COUNT - 1) / 2) / KURAMOTO_COUNT),
  );
}

function defaultKuramotoPhases(): Float64Array {
  return Float64Array.from(
    { length: KURAMOTO_COUNT },
    (_, index) => (index * 2 * Math.PI) / KURAMOTO_COUNT + 0.17 * Math.sin(index),
  );
}

function validatedKuramotoPhases(phases: readonly number[] | undefined): Float64Array {
  if (phases === undefined) return defaultKuramotoPhases();
  if (phases.length !== KURAMOTO_COUNT) {
    throw new CollectiveKernelError(
      'invalid-input',
      'kuramoto',
      `initialPhases must contain exactly ${KURAMOTO_COUNT} values`,
    );
  }
  const copy = new Float64Array(KURAMOTO_COUNT);
  for (let index = 0; index < KURAMOTO_COUNT; index += 1) {
    copy[index] = finiteInput('kuramoto', `initialPhases[${index}]`, phases[index]);
  }
  return copy;
}

function kuramotoDerivative(
  phases: Float64Array,
  frequencies: Float64Array,
  coupling: number,
  output: Float64Array,
) {
  for (let oscillator = 0; oscillator < KURAMOTO_COUNT; oscillator += 1) {
    const phase = phases[oscillator];
    let pull = 0;
    for (let other = 0; other < KURAMOTO_COUNT; other += 1) {
      pull += Math.sin(phases[other] - phase);
    }
    output[oscillator] = frequencies[oscillator] + (coupling * pull) / KURAMOTO_COUNT;
  }
}

function combineStage(
  base: Float64Array,
  derivative: Float64Array,
  factor: number,
  output: Float64Array,
) {
  for (let index = 0; index < base.length; index += 1) {
    output[index] = base[index] + factor * derivative[index];
  }
}

function recordKuramotoOrder(
  phases: Float64Array,
  sample: number,
  orderReal: Float64Array,
  orderImaginary: Float64Array,
  coherence: Float64Array,
) {
  let real = 0;
  let imaginary = 0;
  for (const phase of phases) {
    real += Math.cos(phase);
    imaginary += Math.sin(phase);
  }
  real /= KURAMOTO_COUNT;
  imaginary /= KURAMOTO_COUNT;
  orderReal[sample] = ensureFiniteValue('kuramoto', real, 'order-vector real part', sample);
  orderImaginary[sample] = ensureFiniteValue(
    'kuramoto',
    imaginary,
    'order-vector imaginary part',
    sample,
  );
  coherence[sample] = ensureFiniteValue(
    'kuramoto',
    Math.hypot(real, imaginary),
    'coherence',
    sample,
  );
}

export function simulateKuramoto(options: KuramotoOptions = {}): CollectiveKernelResult {
  const coupling = nonnegativeInput('kuramoto', 'coupling', options.coupling ?? 1.8);
  const spread = nonnegativeInput('kuramoto', 'spread', options.spread ?? 0.8);
  const lockingTolerance = positiveInput(
    'kuramoto',
    'lockingTolerance',
    options.lockingTolerance ?? 1e-3,
  );
  const plan = temporalPlan('kuramoto', options.duration ?? 24, options.dt ?? 1 / 30);
  const frequencies = kuramotoFrequencies(spread);
  let phases = new Float64Array(validatedKuramotoPhases(options.initialPhases));
  const initialPhases = phases.slice();
  const rawState = new Float64Array(plan.samples * KURAMOTO_COUNT);
  const orderReal = new Float64Array(plan.samples);
  const orderImaginary = new Float64Array(plan.samples);
  const coherence = new Float64Array(plan.samples);
  recordRawState(rawState, 0, phases);
  recordKuramotoOrder(phases, 0, orderReal, orderImaginary, coherence);

  const k1 = new Float64Array(KURAMOTO_COUNT);
  const k2 = new Float64Array(KURAMOTO_COUNT);
  const k3 = new Float64Array(KURAMOTO_COUNT);
  const k4 = new Float64Array(KURAMOTO_COUNT);
  const stage = new Float64Array(KURAMOTO_COUNT);
  let next = new Float64Array(KURAMOTO_COUNT);

  for (let step = 1; step <= plan.steps; step += 1) {
    kuramotoDerivative(phases, frequencies, coupling, k1);
    ensureFiniteArray('kuramoto', k1, 'RK4 k1', step);
    combineStage(phases, k1, plan.stepSize / 2, stage);
    ensureFiniteArray('kuramoto', stage, 'RK4 stage 2', step);
    kuramotoDerivative(stage, frequencies, coupling, k2);
    ensureFiniteArray('kuramoto', k2, 'RK4 k2', step);
    combineStage(phases, k2, plan.stepSize / 2, stage);
    ensureFiniteArray('kuramoto', stage, 'RK4 stage 3', step);
    kuramotoDerivative(stage, frequencies, coupling, k3);
    ensureFiniteArray('kuramoto', k3, 'RK4 k3', step);
    combineStage(phases, k3, plan.stepSize, stage);
    ensureFiniteArray('kuramoto', stage, 'RK4 stage 4', step);
    kuramotoDerivative(stage, frequencies, coupling, k4);
    ensureFiniteArray('kuramoto', k4, 'RK4 k4', step);
    for (let oscillator = 0; oscillator < KURAMOTO_COUNT; oscillator += 1) {
      next[oscillator] =
        phases[oscillator] +
        (plan.stepSize / 6) *
          (k1[oscillator] + 2 * k2[oscillator] + 2 * k3[oscillator] + k4[oscillator]);
    }
    ensureFiniteArray('kuramoto', next, 'phase state', step);
    const previous = phases;
    phases = next;
    next = previous;
    recordRawState(rawState, step, phases);
    recordKuramotoOrder(phases, step, orderReal, orderImaginary, coherence);
  }

  const windowStartIndex = Math.ceil(plan.steps / 2);
  const windowStart = plan.times[windowStartIndex];
  const windowDuration = plan.duration - windowStart;
  const meanFrequencies = new Float64Array(KURAMOTO_COUNT);
  let collectiveMeanFrequency = 0;
  for (let oscillator = 0; oscillator < KURAMOTO_COUNT; oscillator += 1) {
    const startPhase = rawState[windowStartIndex * KURAMOTO_COUNT + oscillator];
    const endPhase = rawState[plan.steps * KURAMOTO_COUNT + oscillator];
    const meanFrequency = ensureFiniteValue(
      'kuramoto',
      (endPhase - startPhase) / windowDuration,
      'mean frequency',
      plan.steps,
    );
    meanFrequencies[oscillator] = meanFrequency;
    collectiveMeanFrequency += meanFrequency / KURAMOTO_COUNT;
  }
  const lockingResiduals = new Float64Array(KURAMOTO_COUNT);
  let minimumMeanFrequency = Number.POSITIVE_INFINITY;
  let maximumMeanFrequency = Number.NEGATIVE_INFINITY;
  for (let oscillator = 0; oscillator < KURAMOTO_COUNT; oscillator += 1) {
    const meanFrequency = meanFrequencies[oscillator];
    lockingResiduals[oscillator] = Math.abs(meanFrequency - collectiveMeanFrequency);
    minimumMeanFrequency = Math.min(minimumMeanFrequency, meanFrequency);
    maximumMeanFrequency = Math.max(maximumMeanFrequency, meanFrequency);
  }
  const lockingSpread = ensureFiniteValue(
    'kuramoto',
    maximumMeanFrequency - minimumMeanFrequency,
    'locking spread',
    plan.steps,
  );
  let maximumCoherenceViolation = 0;
  for (const value of coherence) {
    maximumCoherenceViolation = Math.max(maximumCoherenceViolation, Math.max(0, value - 1));
  }
  const coherencePassed = maximumCoherenceViolation <= COHERENCE_ROUNDOFF_TOLERANCE;
  const lockingPassed = lockingSpread <= lockingTolerance;
  const lockingMessage = lockingPassed
    ? `Mean-frequency spread ${lockingSpread} is within ${lockingTolerance} over the latter-half window.`
    : `Frequency locking is not demonstrated: mean-frequency spread ${lockingSpread} exceeds ${lockingTolerance}.`;

  return {
    times: plan.times,
    rawState,
    stateShape: [plan.samples, KURAMOTO_COUNT],
    observables: [
      timeObservable('order-real', 'Order vector, real part', '1', orderReal),
      timeObservable('order-imaginary', 'Order vector, imaginary part', '1', orderImaginary),
      timeObservable('coherence', 'Instantaneous coherence', '1', coherence),
      indexedObservable(
        'natural-frequencies',
        'Deterministic natural frequencies',
        'radian / time',
        frequencies,
      ),
      indexedObservable(
        'mean-frequencies',
        'Latter-half mean frequencies',
        'radian / time',
        meanFrequencies,
      ),
      indexedObservable(
        'locking-residuals',
        'Mean-frequency residuals from population mean',
        'radian / time',
        lockingResiduals,
      ),
      scalarObservable(
        'locking-spread',
        'Maximum minus minimum mean frequency',
        'radian / time',
        lockingSpread,
      ),
    ],
    provenance: {
      kernel: {
        id: 'kuramoto',
        version: 1,
        equation: 'dtheta_i/dt = omega_i + (K/N) sum_j sin(theta_j - theta_i), N=12',
      },
      execution: {
        method: 'classical-rk4-fixed-step',
        precision: 'float64',
        stepSize: plan.stepSize,
        steps: plan.steps,
      },
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      state: {
        layout: 'sample-major',
        dimension: KURAMOTO_COUNT,
        components: Array.from({ length: KURAMOTO_COUNT }, (_, index) => ({
          id: `theta-${index + 1}`,
          label: `Unwrapped phase ${index + 1}`,
          unit: 'radian',
        })),
      },
      boundary: 'phase state on the 12-torus; all-to-all mean-field coupling',
      parameters: {
        coupling,
        frequencyRangeScale: spread,
        oscillatorCount: KURAMOTO_COUNT,
        lockingTolerance,
      },
      initialCondition:
        options.initialPhases === undefined
          ? 'equally-spaced phases with deterministic sinusoidal offsets'
          : `explicit phases: ${Array.from(initialPhases).join(',')}`,
      analysisWindow: [windowStart, plan.duration],
    },
    checks: [
      {
        id: 'finite-state',
        status: 'passed',
        severity: 'hard',
        metrics: [{ id: 'samples', value: plan.samples, unit: 'sample' }],
        message: 'Every accepted phase state and derived observable is finite.',
      },
      {
        id: 'coherence-bound',
        status: coherencePassed ? 'passed' : 'failed',
        severity: 'hard',
        metrics: [
          {
            id: 'maximum-upper-bound-violation',
            value: maximumCoherenceViolation,
            unit: '1',
            norm: 'absolute',
            tolerance: COHERENCE_ROUNDOFF_TOLERANCE,
          },
        ],
        message: coherencePassed
          ? 'The computed order-vector magnitude stays within its mathematical [0, 1] bound.'
          : 'The computed order-vector magnitude exceeds its mathematical upper bound.',
      },
      {
        id: 'frequency-locking',
        status: lockingPassed ? 'passed' : 'failed',
        severity: 'claim',
        metrics: [
          {
            id: 'mean-frequency-spread',
            value: lockingSpread,
            unit: 'radian / time',
            norm: 'linf',
            tolerance: lockingTolerance,
          },
        ],
        message: lockingMessage,
        ...(lockingPassed
          ? {
              claim:
                'All 12 oscillators are frequency-locked within the declared latter-half-window tolerance.',
            }
          : {}),
      },
    ],
  };
}

function fputAcceleration(q: Float64Array, alpha: number, output: Float64Array) {
  for (let mass = 0; mass < FPUT_COUNT; mass += 1) {
    const position = q[mass];
    const left = mass === 0 ? 0 : q[mass - 1];
    const right = mass === FPUT_COUNT - 1 ? 0 : q[mass + 1];
    const leftStretch = position - left;
    const rightStretch = right - position;
    output[mass] = rightStretch - leftStretch + alpha * (rightStretch ** 2 - leftStretch ** 2);
  }
}

function fputHamiltonian(q: Float64Array, p: Float64Array, alpha: number): number {
  let hamiltonian = 0;
  for (const momentum of p) hamiltonian += 0.5 * momentum * momentum;
  for (let bond = 0; bond <= FPUT_COUNT; bond += 1) {
    const left = bond === 0 ? 0 : q[bond - 1];
    const right = bond === FPUT_COUNT ? 0 : q[bond];
    const stretch = right - left;
    hamiltonian += 0.5 * stretch * stretch + (alpha / 3) * stretch ** 3;
  }
  return hamiltonian;
}

interface ModalWorkspace {
  sines: Float64Array;
  angularFrequencies: Float64Array;
  coordinates: Float64Array[];
  momenta: Float64Array[];
  harmonicEnergies: Float64Array[];
}

function createModalWorkspace(samples: number): ModalWorkspace {
  const normalization = Math.sqrt(2 / (FPUT_COUNT + 1));
  const sines = new Float64Array(FPUT_COUNT * FPUT_COUNT);
  const angularFrequencies = new Float64Array(FPUT_COUNT);
  for (let mode = 1; mode <= FPUT_COUNT; mode += 1) {
    angularFrequencies[mode - 1] = 2 * Math.sin((mode * Math.PI) / (2 * (FPUT_COUNT + 1)));
    for (let mass = 1; mass <= FPUT_COUNT; mass += 1) {
      sines[(mode - 1) * FPUT_COUNT + mass - 1] =
        normalization * Math.sin((mass * mode * Math.PI) / (FPUT_COUNT + 1));
    }
  }
  return {
    sines,
    angularFrequencies,
    coordinates: Array.from({ length: FPUT_COUNT }, () => new Float64Array(samples)),
    momenta: Array.from({ length: FPUT_COUNT }, () => new Float64Array(samples)),
    harmonicEnergies: Array.from({ length: FPUT_COUNT }, () => new Float64Array(samples)),
  };
}

function recordFputObservables(
  q: Float64Array,
  p: Float64Array,
  alpha: number,
  sample: number,
  modal: ModalWorkspace,
  hamiltonian: Float64Array,
  harmonicEnergySum: Float64Array,
  interactionEnergy: Float64Array,
) {
  let harmonicSum = 0;
  for (let mode = 0; mode < FPUT_COUNT; mode += 1) {
    let coordinate = 0;
    let momentum = 0;
    for (let mass = 0; mass < FPUT_COUNT; mass += 1) {
      const basis = modal.sines[mode * FPUT_COUNT + mass];
      coordinate += basis * q[mass];
      momentum += basis * p[mass];
    }
    const angularFrequency = modal.angularFrequencies[mode];
    const energy = 0.5 * (momentum * momentum + angularFrequency ** 2 * coordinate ** 2);
    modal.coordinates[mode][sample] = ensureFiniteValue(
      'fput',
      coordinate,
      `mode ${mode + 1} coordinate`,
      sample,
    );
    modal.momenta[mode][sample] = ensureFiniteValue(
      'fput',
      momentum,
      `mode ${mode + 1} momentum`,
      sample,
    );
    modal.harmonicEnergies[mode][sample] = ensureFiniteValue(
      'fput',
      energy,
      `mode ${mode + 1} harmonic energy`,
      sample,
    );
    harmonicSum += energy;
  }
  const exactHamiltonian = ensureFiniteValue(
    'fput',
    fputHamiltonian(q, p, alpha),
    'nonlinear Hamiltonian',
    sample,
  );
  hamiltonian[sample] = exactHamiltonian;
  harmonicEnergySum[sample] = ensureFiniteValue('fput', harmonicSum, 'harmonic energy sum', sample);
  interactionEnergy[sample] = ensureFiniteValue(
    'fput',
    exactHamiltonian - harmonicSum,
    'nonlinear interaction energy',
    sample,
  );
}

export function simulateFput(options: FputOptions = {}): CollectiveKernelResult {
  const alpha = finiteInput('fput', 'alpha', options.alpha ?? 0.25);
  const amplitude = positiveInput('fput', 'amplitude', options.amplitude ?? 0.8);
  const energyTolerance = positiveInput('fput', 'energyTolerance', options.energyTolerance ?? 5e-4);
  const recurrenceDepartureThreshold = positiveInput(
    'fput',
    'recurrenceDepartureThreshold',
    options.recurrenceDepartureThreshold ?? 0.1,
  );
  const recurrenceTolerance = positiveInput(
    'fput',
    'recurrenceTolerance',
    options.recurrenceTolerance ?? 0.05,
  );
  if (recurrenceTolerance >= recurrenceDepartureThreshold) {
    throw new CollectiveKernelError(
      'invalid-input',
      'fput',
      'recurrenceTolerance must be smaller than recurrenceDepartureThreshold',
    );
  }
  const plan = temporalPlan('fput', options.duration ?? 40, options.dt ?? 0.02);
  let q = Float64Array.from(
    { length: FPUT_COUNT },
    (_, index) => amplitude * Math.sin((Math.PI * (index + 1)) / (FPUT_COUNT + 1)),
  );
  let p = new Float64Array(FPUT_COUNT);
  const rawState = new Float64Array(plan.samples * FPUT_COUNT * 2);
  const modal = createModalWorkspace(plan.samples);
  const hamiltonian = new Float64Array(plan.samples);
  const harmonicEnergySum = new Float64Array(plan.samples);
  const interactionEnergy = new Float64Array(plan.samples);
  const relativeHamiltonianResidual = new Float64Array(plan.samples);
  const firstModeRecurrenceDistance = new Float64Array(plan.samples);
  recordRawState(rawState, 0, q, p);
  recordFputObservables(q, p, alpha, 0, modal, hamiltonian, harmonicEnergySum, interactionEnergy);
  const initialHamiltonian = hamiltonian[0];
  const hamiltonianScale = Math.max(Math.abs(initialHamiltonian), Number.EPSILON);

  let acceleration = new Float64Array(FPUT_COUNT);
  let nextAcceleration = new Float64Array(FPUT_COUNT);
  const halfStepMomentum = new Float64Array(FPUT_COUNT);
  let nextQ = new Float64Array(FPUT_COUNT);
  let nextP = new Float64Array(FPUT_COUNT);
  fputAcceleration(q, alpha, acceleration);
  ensureFiniteArray('fput', acceleration, 'initial acceleration', 0);
  let maximumRelativeEnergyResidual = 0;

  for (let step = 1; step <= plan.steps; step += 1) {
    for (let mass = 0; mass < FPUT_COUNT; mass += 1) {
      halfStepMomentum[mass] = p[mass] + (plan.stepSize / 2) * acceleration[mass];
      nextQ[mass] = q[mass] + plan.stepSize * halfStepMomentum[mass];
    }
    ensureFiniteArray('fput', halfStepMomentum, 'half-step momentum', step);
    ensureFiniteArray('fput', nextQ, 'position state', step);
    fputAcceleration(nextQ, alpha, nextAcceleration);
    ensureFiniteArray('fput', nextAcceleration, 'acceleration', step);
    for (let mass = 0; mass < FPUT_COUNT; mass += 1) {
      nextP[mass] = halfStepMomentum[mass] + (plan.stepSize / 2) * nextAcceleration[mass];
    }
    ensureFiniteArray('fput', nextP, 'momentum state', step);
    const previousQ = q;
    q = nextQ;
    nextQ = previousQ;
    const previousP = p;
    p = nextP;
    nextP = previousP;
    const previousAcceleration = acceleration;
    acceleration = nextAcceleration;
    nextAcceleration = previousAcceleration;
    recordRawState(rawState, step, q, p);
    recordFputObservables(
      q,
      p,
      alpha,
      step,
      modal,
      hamiltonian,
      harmonicEnergySum,
      interactionEnergy,
    );
    const residual = (hamiltonian[step] - initialHamiltonian) / hamiltonianScale;
    relativeHamiltonianResidual[step] = ensureFiniteValue(
      'fput',
      residual,
      'relative Hamiltonian residual',
      step,
    );
    maximumRelativeEnergyResidual = Math.max(maximumRelativeEnergyResidual, Math.abs(residual));
  }

  const initialFirstModeEnergy = modal.harmonicEnergies[0][0];
  const firstModeEnergyScale = Math.max(Math.abs(initialFirstModeEnergy), Number.EPSILON);
  let maximumDeparture = 0;
  let departureIndex = -1;
  for (let sample = 0; sample < plan.samples; sample += 1) {
    const distance = Math.abs(
      (modal.harmonicEnergies[0][sample] - initialFirstModeEnergy) / firstModeEnergyScale,
    );
    firstModeRecurrenceDistance[sample] = ensureFiniteValue(
      'fput',
      distance,
      'first-mode recurrence distance',
      sample,
    );
    maximumDeparture = Math.max(maximumDeparture, distance);
    if (departureIndex < 0 && distance >= recurrenceDepartureThreshold) departureIndex = sample;
  }
  let bestReturnAfterDeparture = maximumDeparture;
  if (departureIndex >= 0 && departureIndex < plan.steps) {
    bestReturnAfterDeparture = Number.POSITIVE_INFINITY;
    for (let sample = departureIndex + 1; sample < plan.samples; sample += 1) {
      bestReturnAfterDeparture = Math.min(
        bestReturnAfterDeparture,
        firstModeRecurrenceDistance[sample],
      );
    }
  }
  const energyPassed = maximumRelativeEnergyResidual <= energyTolerance;
  const recurrencePassed = departureIndex >= 0 && bestReturnAfterDeparture <= recurrenceTolerance;
  const modalObservables: CollectiveObservable[] = [];
  for (let mode = 0; mode < FPUT_COUNT; mode += 1) {
    modalObservables.push(
      timeObservable(
        `mode-${mode + 1}-coordinate`,
        `Normal-mode coordinate Q${mode + 1}`,
        'position',
        modal.coordinates[mode],
      ),
      timeObservable(
        `mode-${mode + 1}-momentum`,
        `Normal-mode momentum P${mode + 1}`,
        'momentum',
        modal.momenta[mode],
      ),
      timeObservable(
        `mode-${mode + 1}-harmonic-energy`,
        `Harmonic modal energy E${mode + 1}`,
        'energy',
        modal.harmonicEnergies[mode],
      ),
    );
  }

  return {
    times: plan.times,
    rawState,
    stateShape: [plan.samples, FPUT_COUNT * 2],
    observables: [
      ...modalObservables,
      timeObservable('hamiltonian', 'Exact nonlinear Hamiltonian', 'energy', hamiltonian),
      timeObservable(
        'harmonic-energy-sum',
        'Sum of harmonic modal energies',
        'energy',
        harmonicEnergySum,
      ),
      timeObservable(
        'nonlinear-interaction-energy',
        'Hamiltonian minus harmonic energy sum',
        'energy',
        interactionEnergy,
      ),
      timeObservable(
        'relative-hamiltonian-residual',
        'Relative exact-H residual',
        '1',
        relativeHamiltonianResidual,
      ),
      timeObservable(
        'first-mode-recurrence-distance',
        'First-mode harmonic-energy distance from its initial value',
        '1',
        firstModeRecurrenceDistance,
      ),
    ],
    provenance: {
      kernel: {
        id: 'fput',
        version: 1,
        equation: 'qddot_i = q_(i+1)-2q_i+q_(i-1) + alpha[(q_(i+1)-q_i)^2-(q_i-q_(i-1))^2], N=8',
      },
      execution: {
        method: 'velocity-verlet',
        precision: 'float64',
        stepSize: plan.stepSize,
        steps: plan.steps,
      },
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      state: {
        layout: 'sample-major',
        dimension: FPUT_COUNT * 2,
        components: [
          ...Array.from({ length: FPUT_COUNT }, (_, index) => ({
            id: `q-${index + 1}`,
            label: `Displacement ${index + 1}`,
            unit: 'position',
          })),
          ...Array.from({ length: FPUT_COUNT }, (_, index) => ({
            id: `p-${index + 1}`,
            label: `Momentum ${index + 1}`,
            unit: 'momentum',
          })),
        ],
      },
      boundary: 'fixed endpoints q_0=q_9=0',
      parameters: {
        alpha,
        amplitude,
        particleCount: FPUT_COUNT,
        energyTolerance,
        recurrenceDepartureThreshold,
        recurrenceTolerance,
      },
      initialCondition: 'first fixed-end harmonic normal mode in displacement; all momenta zero',
    },
    checks: [
      {
        id: 'finite-state',
        status: 'passed',
        severity: 'hard',
        metrics: [{ id: 'samples', value: plan.samples, unit: 'sample' }],
        message: 'Every accepted displacement, momentum, and derived observable is finite.',
      },
      {
        id: 'energy-residual',
        status: energyPassed ? 'passed' : 'failed',
        severity: 'hard',
        metrics: [
          {
            id: 'maximum-relative-hamiltonian-residual',
            value: maximumRelativeEnergyResidual,
            unit: '1',
            norm: 'relative',
            tolerance: energyTolerance,
          },
        ],
        message: energyPassed
          ? 'The exact nonlinear Hamiltonian stays within the declared relative tolerance.'
          : 'The exact nonlinear Hamiltonian exceeds the declared relative tolerance.',
      },
      {
        id: 'first-mode-recurrence',
        status: recurrencePassed ? 'passed' : 'failed',
        severity: 'claim',
        metrics: [
          {
            id: 'maximum-first-mode-departure',
            value: maximumDeparture,
            unit: '1',
            norm: 'relative',
          },
          {
            id: 'required-departure-threshold',
            value: recurrenceDepartureThreshold,
            unit: '1',
            norm: 'relative',
          },
          {
            id: 'best-return-after-departure',
            value: bestReturnAfterDeparture,
            unit: '1',
            norm: 'relative',
            tolerance: recurrenceTolerance,
          },
        ],
        message: recurrencePassed
          ? 'First-mode harmonic energy departed and returned within the declared recurrence tolerance.'
          : 'The computed window does not demonstrate a departure followed by first-mode recurrence.',
        ...(recurrencePassed
          ? {
              claim:
                'First-mode harmonic energy returns after a resolved departure from its initial value.',
            }
          : {}),
      },
    ],
  };
}
