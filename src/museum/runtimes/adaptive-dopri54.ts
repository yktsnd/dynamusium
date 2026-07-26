export type AdaptiveDerivative = (time: number, state: readonly number[]) => number[];

export interface AdaptiveEventSpec {
  id: string;
  surface: (time: number, state: readonly number[]) => number;
  rootTolerance: number;
  /**
   * Conservative guard for an entry and exit that both occur between sampled
   * event-surface values. Returning true makes the solver retry a shorter
   * accepted step instead of silently stepping across the event region.
   */
  mayCrossBetween?: (
    startTime: number,
    startState: readonly number[],
    endTime: number,
    endState: readonly number[],
  ) => boolean;
}

export interface AdaptiveIntegrationOptions {
  initial: number[];
  duration: number;
  outputSteps: number;
  derivative: AdaptiveDerivative;
  relativeTolerance: number;
  absoluteTolerance: number;
  initialStep: number;
  minimumStep: number;
  maximumStep: number;
  maximumAttempts: number;
  event?: AdaptiveEventSpec;
}

export interface AdaptiveTerminalEvent {
  id: string;
  time: number;
  state: number[];
  surfaceResidual: number;
  bracketWidth: number;
}

export interface AdaptiveIntegrationResult {
  times: number[];
  states: number[][];
  acceptedSteps: number;
  rejectedSteps: number;
  maximumAcceptedErrorNorm: number;
  terminalEvent?: AdaptiveTerminalEvent;
}

interface EmbeddedStep {
  state: number[];
  errorNorm: number;
}

interface EventSample {
  time: number;
  state: number[];
  value: number;
}

type EventStepInspection =
  | { kind: 'clear' }
  | { kind: 'refine' }
  | { kind: 'bracketed'; start: EventSample; end: EventSample };

const SAFETY = 0.9;
const MINIMUM_FACTOR = 0.2;
const MAXIMUM_FACTOR = 5;

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite; received ${String(value)}.`);
  }
}

function finiteVector(values: readonly number[], dimension: number): values is number[] {
  return values.length === dimension && values.every(Number.isFinite);
}

function addScaled(
  state: readonly number[],
  step: number,
  terms: Array<readonly [readonly number[], number]>,
): number[] {
  return state.map(
    (value, coordinate) =>
      value +
      step *
        terms.reduce((sum, [slope, coefficient]) => {
          const component = slope[coordinate];
          return component === undefined ? Number.NaN : sum + coefficient * component;
        }, 0),
  );
}

function slopeAt(
  derivative: AdaptiveDerivative,
  time: number,
  state: readonly number[],
  dimension: number,
): number[] | null {
  const slope = derivative(time, state);
  return finiteVector(slope, dimension) ? slope : null;
}

function embeddedStep(
  derivative: AdaptiveDerivative,
  time: number,
  state: readonly number[],
  step: number,
  relativeTolerance: number,
  absoluteTolerance: number,
): EmbeddedStep | null {
  const dimension = state.length;
  const k1 = slopeAt(derivative, time, state, dimension);
  if (!k1) return null;
  const y2 = addScaled(state, step, [[k1, 1 / 5]]);
  const k2 = slopeAt(derivative, time + step / 5, y2, dimension);
  if (!k2) return null;
  const y3 = addScaled(state, step, [
    [k1, 3 / 40],
    [k2, 9 / 40],
  ]);
  const k3 = slopeAt(derivative, time + (3 * step) / 10, y3, dimension);
  if (!k3) return null;
  const y4Stage = addScaled(state, step, [
    [k1, 44 / 45],
    [k2, -56 / 15],
    [k3, 32 / 9],
  ]);
  const k4 = slopeAt(derivative, time + (4 * step) / 5, y4Stage, dimension);
  if (!k4) return null;
  const y5Stage = addScaled(state, step, [
    [k1, 19372 / 6561],
    [k2, -25360 / 2187],
    [k3, 64448 / 6561],
    [k4, -212 / 729],
  ]);
  const k5 = slopeAt(derivative, time + (8 * step) / 9, y5Stage, dimension);
  if (!k5) return null;
  const y6 = addScaled(state, step, [
    [k1, 9017 / 3168],
    [k2, -355 / 33],
    [k3, 46732 / 5247],
    [k4, 49 / 176],
    [k5, -5103 / 18656],
  ]);
  const k6 = slopeAt(derivative, time + step, y6, dimension);
  if (!k6) return null;
  const fifthOrder = addScaled(state, step, [
    [k1, 35 / 384],
    [k3, 500 / 1113],
    [k4, 125 / 192],
    [k5, -2187 / 6784],
    [k6, 11 / 84],
  ]);
  if (!finiteVector(fifthOrder, dimension)) return null;
  const k7 = slopeAt(derivative, time + step, fifthOrder, dimension);
  if (!k7) return null;
  const fourthOrder = addScaled(state, step, [
    [k1, 5179 / 57600],
    [k3, 7571 / 16695],
    [k4, 393 / 640],
    [k5, -92097 / 339200],
    [k6, 187 / 2100],
    [k7, 1 / 40],
  ]);
  if (!finiteVector(fourthOrder, dimension)) return null;
  const errorNorm = fifthOrder.reduce((maximum, value, coordinate) => {
    const previous = state[coordinate];
    const comparison = fourthOrder[coordinate];
    if (previous === undefined || comparison === undefined) return Number.POSITIVE_INFINITY;
    const scale =
      absoluteTolerance + relativeTolerance * Math.max(Math.abs(previous), Math.abs(value));
    return Math.max(maximum, Math.abs(value - comparison) / scale);
  }, 0);
  return Number.isFinite(errorNorm) ? { state: fifthOrder, errorNorm } : null;
}

function nextStepSize(step: number, errorNorm: number, minimum: number, maximum: number): number {
  const factor =
    errorNorm === 0
      ? MAXIMUM_FACTOR
      : Math.min(MAXIMUM_FACTOR, Math.max(MINIMUM_FACTOR, SAFETY * errorNorm ** -0.2));
  return Math.min(maximum, Math.max(minimum, step * factor));
}

const EVENT_PROBE_FRACTIONS = [0.25, 0.5, 0.75] as const;

function inspectAcceptedEventStep(
  options: AdaptiveIntegrationOptions,
  startTime: number,
  startState: readonly number[],
  startValue: number,
  endTime: number,
  endState: readonly number[],
  endValue: number,
): EventStepInspection {
  const event = options.event;
  if (!event) return { kind: 'clear' };
  const duration = endTime - startTime;
  const samples: EventSample[] = [{ time: startTime, state: [...startState], value: startValue }];
  for (const fraction of EVENT_PROBE_FRACTIONS) {
    const probeTime = startTime + duration * fraction;
    const probe = embeddedStep(
      options.derivative,
      startTime,
      startState,
      duration * fraction,
      options.relativeTolerance,
      options.absoluteTolerance,
    );
    if (!probe || probe.errorNorm > 1) return { kind: 'refine' };
    const value = event.surface(probeTime, probe.state);
    if (!Number.isFinite(value)) {
      throw new Error(`Adaptive event ${event.id} produced a non-finite probe value.`);
    }
    samples.push({ time: probeTime, state: probe.state, value });
  }
  samples.push({ time: endTime, state: [...endState], value: endValue });

  for (let index = 1; index < samples.length; index += 1) {
    const left = samples[index - 1];
    const right = samples[index];
    if (!left || !right) throw new Error('Adaptive event probes are incomplete.');
    if (left.value > 0 && right.value <= 0) {
      return { kind: 'bracketed', start: left, end: right };
    }
  }

  if (
    event.mayCrossBetween &&
    samples.some((sample, index) => {
      const next = samples[index + 1];
      return (
        next !== undefined &&
        sample.value > 0 &&
        next.value > 0 &&
        event.mayCrossBetween?.(sample.time, sample.state, next.time, next.state) === true
      );
    })
  ) {
    return { kind: 'refine' };
  }
  return { kind: 'clear' };
}

function localizedEvent(
  options: AdaptiveIntegrationOptions,
  startTime: number,
  startState: readonly number[],
  endTime: number,
  endState: readonly number[],
): AdaptiveTerminalEvent {
  const event = options.event;
  if (!event) throw new Error('Cannot localize an undeclared adaptive event.');
  let leftTime = startTime;
  let leftValue = event.surface(leftTime, startState);
  let rightTime = endTime;
  let rightState = [...endState];
  let rightValue = event.surface(rightTime, rightState);
  if (!(leftValue > 0) || !(rightValue <= 0)) {
    throw new Error(`Adaptive event ${event.id} was not bracketed.`);
  }
  let iterations = 0;
  while (rightTime - leftTime > event.rootTolerance && iterations < 80) {
    const middleTime = (leftTime + rightTime) / 2;
    const middleStep = embeddedStep(
      options.derivative,
      startTime,
      startState,
      middleTime - startTime,
      options.relativeTolerance,
      options.absoluteTolerance,
    );
    if (!middleStep || middleStep.errorNorm > 1) {
      throw new Error(`Adaptive event ${event.id} could not be localized within tolerance.`);
    }
    const middleValue = event.surface(middleTime, middleStep.state);
    if (!Number.isFinite(middleValue)) {
      throw new Error(`Adaptive event ${event.id} produced a non-finite surface value.`);
    }
    if (middleValue > 0) {
      leftTime = middleTime;
      leftValue = middleValue;
    } else {
      rightTime = middleTime;
      rightState = middleStep.state;
      rightValue = middleValue;
    }
    iterations += 1;
  }
  const fraction = leftValue / (leftValue - rightValue);
  const eventTime = leftTime + fraction * (rightTime - leftTime);
  const eventStep = embeddedStep(
    options.derivative,
    startTime,
    startState,
    eventTime - startTime,
    options.relativeTolerance,
    options.absoluteTolerance,
  );
  const state = eventStep && eventStep.errorNorm <= 1 ? eventStep.state : rightState;
  const time = eventStep && eventStep.errorNorm <= 1 ? eventTime : rightTime;
  return {
    id: event.id,
    time,
    state,
    surfaceResidual: Math.abs(event.surface(time, state)),
    bracketWidth: rightTime - leftTime,
  };
}

export function integrateAdaptiveDopri54(
  options: AdaptiveIntegrationOptions,
): AdaptiveIntegrationResult {
  assertPositiveFinite(options.duration, 'Adaptive duration');
  assertPositiveFinite(options.relativeTolerance, 'Adaptive relative tolerance');
  assertPositiveFinite(options.absoluteTolerance, 'Adaptive absolute tolerance');
  assertPositiveFinite(options.initialStep, 'Adaptive initial step');
  assertPositiveFinite(options.minimumStep, 'Adaptive minimum step');
  assertPositiveFinite(options.maximumStep, 'Adaptive maximum step');
  if (!Number.isInteger(options.outputSteps) || options.outputSteps <= 0) {
    throw new Error(
      `Adaptive outputSteps must be a positive integer; received ${options.outputSteps}.`,
    );
  }
  if (!Number.isInteger(options.maximumAttempts) || options.maximumAttempts <= 0) {
    throw new Error('Adaptive maximumAttempts must be a positive integer.');
  }
  if (!finiteVector(options.initial, options.initial.length) || options.initial.length === 0) {
    throw new Error('Adaptive initial state must be a non-empty finite vector.');
  }
  if (options.minimumStep > options.maximumStep) {
    throw new Error('Adaptive minimum step must not exceed maximum step.');
  }
  if (options.event) {
    assertPositiveFinite(options.event.rootTolerance, 'Adaptive event root tolerance');
    const initialSurface = options.event.surface(0, options.initial);
    if (!Number.isFinite(initialSurface) || initialSurface <= 0) {
      throw new Error(`Adaptive event ${options.event.id} is active at the initial state.`);
    }
  }

  const times = [0];
  const states = [options.initial.slice()];
  const outputStep = options.duration / options.outputSteps;
  let time = 0;
  let state = options.initial.slice();
  let step = Math.min(options.maximumStep, Math.max(options.minimumStep, options.initialStep));
  let acceptedSteps = 0;
  let rejectedSteps = 0;
  let maximumAcceptedErrorNorm = 0;
  let attempts = 0;
  let previousSurface = options.event?.surface(time, state);

  for (let outputIndex = 1; outputIndex <= options.outputSteps; outputIndex += 1) {
    const targetTime = outputIndex * outputStep;
    while (time < targetTime) {
      if (attempts >= options.maximumAttempts) {
        throw new Error(`Adaptive solver exceeded ${options.maximumAttempts} attempted steps.`);
      }
      const remaining = targetTime - time;
      if (remaining <= 8 * Number.EPSILON * Math.max(1, targetTime)) {
        break;
      }
      const attemptedStep = Math.min(step, remaining);
      if (attemptedStep < options.minimumStep && remaining > options.minimumStep) {
        throw new Error('Adaptive solver reached its minimum step before the target time.');
      }
      const embedded = embeddedStep(
        options.derivative,
        time,
        state,
        attemptedStep,
        options.relativeTolerance,
        options.absoluteTolerance,
      );
      attempts += 1;
      if (!embedded || embedded.errorNorm > 1) {
        rejectedSteps += 1;
        const rejectedError = embedded?.errorNorm ?? Number.POSITIVE_INFINITY;
        step = nextStepSize(attemptedStep, rejectedError, options.minimumStep, options.maximumStep);
        if (step <= options.minimumStep && !embedded) {
          throw new Error('Adaptive derivative remained unresolved at the minimum step.');
        }
        continue;
      }

      const nextTime = time + attemptedStep;
      const nextState = embedded.state;
      const nextSurface = options.event?.surface(nextTime, nextState);
      if (nextSurface !== undefined && !Number.isFinite(nextSurface)) {
        throw new Error(`Adaptive event ${options.event?.id ?? 'unknown'} became non-finite.`);
      }
      const eventInspection =
        options.event && previousSurface !== undefined && nextSurface !== undefined
          ? inspectAcceptedEventStep(
              options,
              time,
              state,
              previousSurface,
              nextTime,
              nextState,
              nextSurface,
            )
          : ({ kind: 'clear' } as const);
      if (eventInspection.kind === 'refine') {
        rejectedSteps += 1;
        if (attemptedStep <= options.minimumStep * (1 + 8 * Number.EPSILON)) {
          throw new Error(
            `Adaptive event ${options.event?.id ?? 'unknown'} could not be resolved at the minimum step.`,
          );
        }
        step = Math.max(options.minimumStep, attemptedStep * 0.5);
        continue;
      }
      acceptedSteps += 1;
      maximumAcceptedErrorNorm = Math.max(maximumAcceptedErrorNorm, embedded.errorNorm);
      if (eventInspection.kind === 'bracketed') {
        const terminalEvent = localizedEvent(
          options,
          eventInspection.start.time,
          eventInspection.start.state,
          eventInspection.end.time,
          eventInspection.end.state,
        );
        times.push(terminalEvent.time);
        states.push(terminalEvent.state);
        return {
          times,
          states,
          acceptedSteps,
          rejectedSteps,
          maximumAcceptedErrorNorm,
          terminalEvent,
        };
      }
      time = nextTime;
      state = nextState;
      previousSurface = nextSurface;
      step = nextStepSize(
        attemptedStep,
        embedded.errorNorm,
        options.minimumStep,
        options.maximumStep,
      );
    }
    time = targetTime;
    times.push(time);
    states.push(state.slice());
  }

  return { times, states, acceptedSteps, rejectedSteps, maximumAcceptedErrorNorm };
}
