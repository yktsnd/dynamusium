import type { RuntimeKind, Series, WorkManifest, WorkResult } from './types.ts';
import { simulateReviewedAnalyticField } from './runtimes/analytic-field-runtime.ts';
import { simulateReviewedAnalyticOrbit } from './runtimes/analytic-orbital-runtime.ts';
import { simulateReviewedCollective } from './runtimes/collective-runtime.ts';
import { simulateReviewedField } from './runtimes/field-runtime.ts';
import { simulateReviewedFoundation } from './runtimes/foundation-runtime.ts';

type Derivative = (time: number, state: number[]) => number[];
type StepConstraint = (previous: number[], next: number[], step: number, nextTime: number) => void;

const palette = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b', '#b99cff', '#ff8d68'];

function assertFiniteNumber(value: number, context: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${context} is non-finite (${String(value)}).`);
  }
}

function assertFiniteVector(values: number[], expectedLength: number, context: string): void {
  if (!Array.isArray(values) || values.length !== expectedLength) {
    const actualLength = Array.isArray(values) ? values.length : 'non-array';
    throw new Error(`${context} has dimension ${actualLength}; expected ${expectedLength}.`);
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) {
      throw new Error(`${context}[${index}] is non-finite (${String(value)}).`);
    }
  }
}

function stateValue(state: number[], index: number, context: string): number {
  if (index < 0 || index >= state.length) {
    throw new Error(`${context} is missing state index ${index}; dimension is ${state.length}.`);
  }
  const value = state[index];
  if (!Number.isFinite(value)) {
    throw new Error(`${context}[${index}] is non-finite (${String(value)}).`);
  }
  return value;
}

function parametersFor(work: WorkManifest, overrides: Record<string, number>) {
  return Object.fromEntries(
    work.parameters.map((parameter) => {
      const value = overrides[parameter.id] ?? parameter.default;
      assertFiniteNumber(value, `Parameter "${parameter.id}" for work "${work.slug}"`);
      return [parameter.id, value];
    }),
  );
}

function derivativeAt(
  derivative: Derivative,
  time: number,
  state: number[],
  expectedLength: number,
  context: string,
): number[] {
  const values = derivative(time, state);
  assertFiniteVector(values, expectedLength, `${context} derivative`);
  return values;
}

function stageState(state: number[], slope: number[], scale: number, context: string): number[] {
  const next = state.map((value, index) => value + scale * slope[index]);
  assertFiniteVector(next, state.length, context);
  return next;
}

export function rk4(
  initial: number[],
  duration: number,
  derivative: Derivative,
  steps = 720,
  stepConstraint?: StepConstraint,
) {
  assertFiniteNumber(duration, 'RK4 duration');
  if (duration <= 0) throw new Error(`RK4 duration must be positive; received ${duration}.`);
  if (!Number.isInteger(steps) || steps <= 0) {
    throw new Error(`RK4 steps must be a positive integer; received ${steps}.`);
  }
  if (initial.length === 0) throw new Error('RK4 initial state must not be empty.');
  assertFiniteVector(initial, initial.length, 'RK4 initial state');

  const dt = duration / steps;
  assertFiniteNumber(dt, 'RK4 step size');
  const states: number[][] = [initial.slice()];
  const times = [0];
  let state = initial.slice();
  for (let step = 1; step <= steps; step += 1) {
    const time = (step - 1) * dt;
    const prefix = `RK4 step ${step} at t=${time}`;
    const k1 = derivativeAt(derivative, time, state, initial.length, `${prefix} k1`);
    const k2State = stageState(state, k1, dt / 2, `${prefix} k2 stage`);
    const k2 = derivativeAt(derivative, time + dt / 2, k2State, initial.length, `${prefix} k2`);
    const k3State = stageState(state, k2, dt / 2, `${prefix} k3 stage`);
    const k3 = derivativeAt(derivative, time + dt / 2, k3State, initial.length, `${prefix} k3`);
    const k4State = stageState(state, k3, dt, `${prefix} k4 stage`);
    const k4 = derivativeAt(derivative, time + dt, k4State, initial.length, `${prefix} k4`);
    const next = state.map(
      (value, index) => value + (dt / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]),
    );
    assertFiniteVector(next, initial.length, `${prefix} final state`);
    const nextTime = step * dt;
    stepConstraint?.(state, next, step, nextTime);
    state = next;
    states.push(state);
    times.push(nextTime);
  }
  return { states, times };
}

function resultFromStates(
  duration: number,
  times: number[],
  states: number[][],
  labels: Array<string | { id: string; label: string }>,
  pointAxes: [number, number] = [0, 1],
  diagnostics = 'Deterministic numerical trajectory',
): WorkResult {
  if (times.length !== states.length) {
    throw new Error(
      `Result has ${times.length} times but ${states.length} states; the lengths must match.`,
    );
  }
  assertFiniteVector(times, times.length, 'Result times');
  const series: Series[] = labels.map((entry, index) => {
    const label = typeof entry === 'string' ? entry : entry.label;
    const id =
      typeof entry === 'string'
        ? label.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'series'
        : entry.id;
    const color = palette[index % palette.length];
    if (color === undefined) throw new Error('Simulation series palette is empty.');
    return {
      id,
      label,
      color,
      values: states.map((state, stateIndex) =>
        stateValue(state, index, `Result state ${stateIndex}`),
      ),
    };
  });
  return {
    duration,
    times,
    series,
    points: states.map((state, stateIndex) => ({
      x: stateValue(state, pointAxes[0], `Result point state ${stateIndex}`),
      y: stateValue(state, pointAxes[1], `Result point state ${stateIndex}`),
    })),
    diagnostics,
  };
}

function xOverOneMinusExpNegative(x: number, scale: number): number {
  if (x === 0) return scale;
  return -x / Math.expm1(-x / scale);
}

const CR3BP_EXCLUSION_RADIUS = 0.03;

function distanceFromPointToSegment(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pointX: number,
  pointY: number,
): number {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  if (squaredLength === 0) return Math.hypot(startX - pointX, startY - pointY);
  const projection = ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / squaredLength;
  if (projection <= 0) return Math.hypot(startX - pointX, startY - pointY);
  if (projection >= 1) return Math.hypot(endX - pointX, endY - pointY);
  return Math.hypot(startX + projection * deltaX - pointX, startY + projection * deltaY - pointY);
}

function assertCr3bpPosition(x: number, y: number, mu: number, context: string): void {
  const distanceToPrimaryOne = Math.hypot(x + mu, y);
  const distanceToPrimaryTwo = Math.hypot(x - 1 + mu, y);
  if (
    distanceToPrimaryOne <= CR3BP_EXCLUSION_RADIUS ||
    distanceToPrimaryTwo <= CR3BP_EXCLUSION_RADIUS
  ) {
    throw new Error(
      `CR3BP close-encounter event ${context} entered the declared ${CR3BP_EXCLUSION_RADIUS} exclusion radius.`,
    );
  }
}

export function hodgkinHuxleyAlphaRates(voltage: number): {
  alphaM: number;
  alphaN: number;
} {
  assertFiniteNumber(voltage, 'Hodgkin-Huxley voltage');
  return {
    alphaM: 0.1 * xOverOneMinusExpNegative(voltage + 40, 10),
    alphaN: 0.01 * xOverOneMinusExpNegative(voltage + 55, 10),
  };
}

function odeWork(work: WorkManifest, p: Record<string, number>): WorkResult | null {
  const d = work.duration;
  switch (work.kernel) {
    case 'reaction-chain': {
      const feed = p.feed ?? 1;
      const rate = p.rate ?? 0.4;
      const solved = rk4([0.2, 0.05, 0], d, (t, [a = 0, b = 0, c = 0]) => {
        const input = feed * (0.78 + 0.22 * Math.sin((2 * Math.PI * t) / 18));
        return [input - rate * a, rate * a - 0.72 * rate * b, 0.72 * rate * b - 0.48 * rate * c];
      });
      return resultFromStates(d, solved.times, solved.states, [
        'Reactant A',
        'Intermediate B',
        'Product C',
      ]);
    }
    case 'double-pendulum': {
      const gravity = p.gravity ?? 9.81;
      const offset = p.offset ?? 0.18;
      const solved = rk4(
        [1.45, 1.45 + offset, 0, 0],
        d,
        (_t, [a = 0, b = 0, wa = 0, wb = 0]) => {
          const delta = a - b;
          const den = 3 - Math.cos(2 * delta);
          const aa =
            (-gravity * (3 * Math.sin(a) + Math.sin(a - 2 * b)) -
              2 * Math.sin(delta) * (wb * wb + wa * wa * Math.cos(delta))) /
            den;
          const ab =
            (2 *
              Math.sin(delta) *
              (2 * wa * wa + 2 * gravity * Math.cos(a) + wb * wb * Math.cos(delta))) /
            den;
          return [wa, wb, aa, ab];
        },
        1100,
      );
      const stateAndTip = solved.states.map((state, stateIndex) => {
        const theta1 = stateValue(state, 0, `Double pendulum state ${stateIndex}`);
        const theta2 = stateValue(state, 1, `Double pendulum state ${stateIndex}`);
        return [
          ...state,
          Math.sin(theta1) + Math.sin(theta2),
          -Math.cos(theta1) - Math.cos(theta2),
        ];
      });
      return resultFromStates(
        d,
        solved.times,
        stateAndTip,
        [
          { id: 'theta1', label: 'Arm θ₁' },
          { id: 'theta2', label: 'Arm θ₂' },
          { id: 'omega1', label: 'Angular velocity ω₁' },
          { id: 'omega2', label: 'Angular velocity ω₂' },
          { id: 'tip-x', label: 'Tip x' },
          { id: 'tip-y', label: 'Tip y' },
        ],
        [4, 5],
      );
    }
    case 'kuramoto': {
      const coupling = p.coupling ?? 1.8;
      const spread = p.spread ?? 0.8;
      const count = 12;
      const frequencies = Array.from(
        { length: count },
        (_, i) => spread * ((i - (count - 1) / 2) / count),
      );
      const solved = rk4(
        Array.from({ length: count }, (_, i) => (i * 2 * Math.PI) / count + 0.17 * Math.sin(i)),
        d,
        (_t, state) =>
          state.map((theta, i) => {
            const pull = state.reduce((sum, other) => sum + Math.sin(other - theta), 0) / count;
            return stateValue(frequencies, i, 'Kuramoto frequencies') + coupling * pull;
          }),
      );
      const order = solved.states.map((state) => {
        const x = state.reduce((sum, theta) => sum + Math.cos(theta), 0) / count;
        const y = state.reduce((sum, theta) => sum + Math.sin(theta), 0) / count;
        return [x, y, Math.hypot(x, y), stateValue(state, 0, 'Kuramoto state')];
      });
      return resultFromStates(d, solved.times, order, [
        'Collective x',
        'Collective y',
        'Coherence',
        'Lead phase',
      ]);
    }
    case 'fput': {
      const alpha = p.alpha ?? 0.25;
      const amplitude = p.amplitude ?? 0.8;
      const n = 8;
      const initial = [
        ...Array.from({ length: n }, (_, i) => amplitude * Math.sin((Math.PI * (i + 1)) / (n + 1))),
        ...Array.from({ length: n }, () => 0),
      ];
      const solved = rk4(
        initial,
        d,
        (_t, state) => {
          const q = state.slice(0, n);
          const velocity = state.slice(n);
          const acceleration = q.map((value, i) => {
            const left = i === 0 ? 0 : stateValue(q, i - 1, 'FPUT positions');
            const right = i === n - 1 ? 0 : stateValue(q, i + 1, 'FPUT positions');
            return left - 2 * value + right + alpha * ((right - value) ** 2 - (value - left) ** 2);
          });
          return [...velocity, ...acceleration];
        },
        1000,
      );
      const modes = solved.states.map((state) => [
        stateValue(state, 0, 'FPUT result state'),
        stateValue(state, 2, 'FPUT result state'),
        stateValue(state, 4, 'FPUT result state'),
        stateValue(state, 6, 'FPUT result state'),
      ]);
      return resultFromStates(d, solved.times, modes, ['Mass 1', 'Mass 3', 'Mass 5', 'Mass 7']);
    }
    case 'lotka-volterra': {
      const alpha = p.recovery ?? 1.1;
      const beta = p.predation ?? 0.7;
      const gamma = 0.9;
      const delta = 0.45;
      const solved = rk4([1.2, 0.7], d, (_t, [prey = 0, predator = 0]) => [
        alpha * prey - beta * prey * predator,
        delta * prey * predator - gamma * predator,
      ]);
      return resultFromStates(d, solved.times, solved.states, ['Prey', 'Predator']);
    }
    case 'brusselator': {
      const a = p.a ?? 1;
      const b = p.b ?? 3;
      const solved = rk4([1.2, 2.4], d, (_t, [x = 0, y = 0]) => [
        a - (b + 1) * x + x * x * y,
        b * x - x * x * y,
      ]);
      return resultFromStates(d, solved.times, solved.states, [
        { id: 'x', label: 'Activator X' },
        { id: 'y', label: 'Intermediate Y' },
      ]);
    }
    case 'oregonator': {
      const epsilon = p.epsilon ?? 0.08;
      const feedback = p.feedback ?? 1.2;
      if (epsilon <= 0) throw new Error('Oregonator epsilon must be greater than zero.');
      const solved = rk4(
        [0.35, 0.9, 0.2],
        d,
        (_t, [x = 0, y = 0, z = 0]) => {
          const q = 0.02;
          return [
            (q * y - x * y + x * (1 - x)) / epsilon,
            -q * y - x * y + feedback * z,
            0.3 * (x - z),
          ];
        },
        1200,
      );
      return resultFromStates(d, solved.times, solved.states, [
        { id: 'x', label: 'HBrO₂' },
        { id: 'y', label: 'Br⁻' },
        { id: 'z', label: 'Catalyst' },
      ]);
    }
    case 'sir': {
      const beta = p.transmission ?? 0.34;
      const gamma = p.recovery ?? 0.12;
      const solved = rk4([0.992, 0.008, 0], d, (_t, [s = 0, i = 0]) => [
        -beta * s * i,
        beta * s * i - gamma * i,
        gamma * i,
      ]);
      return resultFromStates(
        d,
        solved.times,
        solved.states,
        [
          { id: 'S', label: 'Susceptible' },
          { id: 'I', label: 'Infectious' },
          { id: 'R', label: 'Removed' },
        ],
        [0, 1],
      );
    }
    case 'fitzhugh-nagumo': {
      const current = p.current ?? 0.48;
      const recovery = p.recovery ?? 0.08;
      const solved = rk4([-1, -0.4], d, (_t, [v = 0, w = 0]) => [
        v - v ** 3 / 3 - w + current,
        recovery * (v + 0.7 - 0.8 * w),
      ]);
      return resultFromStates(d, solved.times, solved.states, [
        { id: 'v', label: 'Membrane potential' },
        { id: 'w', label: 'Recovery' },
      ]);
    }
    case 'hodgkin-huxley': {
      const current = p.current ?? 10;
      const gNa = p.conductance ?? 120;
      const solved = rk4(
        [-65, 0.0529, 0.596, 0.317],
        d,
        (_t, [v = -65, m = 0, h = 0, n = 0]) => {
          const { alphaM: am, alphaN: an } = hodgkinHuxleyAlphaRates(v);
          const bm = 4 * Math.exp(-(v + 65) / 18);
          const ah = 0.07 * Math.exp(-(v + 65) / 20);
          const bh = 1 / (1 + Math.exp(-(v + 35) / 10));
          const bn = 0.125 * Math.exp(-(v + 65) / 80);
          const dv =
            current - gNa * m ** 3 * h * (v - 50) - 36 * n ** 4 * (v + 77) - 0.3 * (v + 54.4);
          return [dv, am * (1 - m) - bm * m, ah * (1 - h) - bh * h, an * (1 - n) - bn * n];
        },
        1800,
      );
      return resultFromStates(d, solved.times, solved.states, [
        { id: 'V', label: 'Voltage' },
        { id: 'm', label: 'Na activation' },
        { id: 'h', label: 'Na inactivation' },
        { id: 'n', label: 'K activation' },
      ]);
    }
    case 'lorenz': {
      const rho = p.rho ?? 28;
      const sigma = p.sigma ?? 10;
      const beta = 8 / 3;
      const solved = rk4(
        [0.1, 0, 0],
        d,
        (_t, [x = 0, y = 0, z = 0]) => [sigma * (y - x), x * (rho - z) - y, x * y - beta * z],
        1400,
      );
      return resultFromStates(
        d,
        solved.times,
        solved.states,
        ['Convection x', 'Temperature y', 'Gradient z'],
        [0, 2],
      );
    }
    case 'stommel': {
      const freshwater = p.freshwater ?? 0.85;
      const exchange = p.exchange ?? 0.7;
      const solved = rk4([0.8, 0.2], d, (_t, [temperature = 0, salinity = 0]) => {
        const flow = exchange * (temperature - salinity);
        return [
          1 - temperature - Math.abs(flow) * temperature,
          freshwater - salinity - Math.abs(flow) * salinity,
        ];
      });
      return resultFromStates(d, solved.times, solved.states, [
        'Temperature contrast',
        'Salinity contrast',
      ]);
    }
    case 'daisyworld': {
      const luminosity = p.luminosity ?? 1;
      const death = p.death ?? 0.3;
      const solved = rk4([0.2, 0.2], d, (_t, [dark = 0, light = 0]) => {
        const bare = 1 - dark - light;
        if (bare < 0) {
          throw new Error('Daisyworld cover fractions left the declared population simplex.');
        }
        const albedo = 0.5 - 0.25 * dark + 0.25 * light;
        const temp = 22 + 55 * (luminosity * (1 - albedo) - 0.5);
        const growthDark = Math.max(0, 1 - ((temp + 4 - 22.5) / 18) ** 2);
        const growthLight = Math.max(0, 1 - ((temp - 4 - 22.5) / 18) ** 2);
        return [dark * (bare * growthDark - death), light * (bare * growthLight - death)];
      });
      const stateAndTemperature = solved.states.map((state, stateIndex) => {
        const dark = stateValue(state, 0, `Daisyworld state ${stateIndex}`);
        const light = stateValue(state, 1, `Daisyworld state ${stateIndex}`);
        const albedo = 0.5 - 0.25 * dark + 0.25 * light;
        const temperature = 22 + 55 * (luminosity * (1 - albedo) - 0.5);
        return [dark, light, temperature];
      });
      return resultFromStates(d, solved.times, stateAndTemperature, [
        { id: 'dark-cover', label: 'Dark daisies' },
        { id: 'light-cover', label: 'Light daisies' },
        { id: 'temperature', label: 'Global temperature' },
      ]);
    }
    case 'carbon-cycle': {
      const emission = p.emission ?? 1.8;
      const ocean = p.ocean ?? 0.12;
      const solved = rk4([1, 1, 1], d, (t, [air = 0, sea = 0, life = 0]) => {
        const pulse = t < d * 0.22 ? emission : 0;
        return [
          pulse - ocean * air + 0.03 * sea - 0.08 * air + 0.05 * life,
          ocean * air - 0.03 * sea,
          0.08 * air - 0.05 * life,
        ];
      });
      return resultFromStates(d, solved.times, solved.states, ['Atmosphere', 'Ocean', 'Biosphere']);
    }
    case 'restricted-three-body': {
      const mu = p.massRatio ?? 0.012;
      const velocity = p.velocity ?? 0.62;
      const initial: [number, number, number, number] = [0.72, 0.05, 0, velocity];
      assertCr3bpPosition(initial[0], initial[1], mu, 'initial condition');
      const solved = rk4(
        initial,
        d,
        (_t, state) => {
          const x = stateValue(state, 0, 'CR3BP x');
          const y = stateValue(state, 1, 'CR3BP y');
          const vx = stateValue(state, 2, 'CR3BP vx');
          const vy = stateValue(state, 3, 'CR3BP vy');
          const r1 = Math.hypot(x + mu, y);
          const r2 = Math.hypot(x - 1 + mu, y);
          assertCr3bpPosition(x, y, mu, 'at an RK4 stage');
          const ax = x + 2 * vy - ((1 - mu) * (x + mu)) / r1 ** 3 - (mu * (x - 1 + mu)) / r2 ** 3;
          const ay = y - 2 * vx - ((1 - mu) * y) / r1 ** 3 - (mu * y) / r2 ** 3;
          return [vx, vy, ax, ay];
        },
        1600,
        (previous, next, step, nextTime) => {
          const previousX = stateValue(previous, 0, 'CR3BP previous x');
          const previousY = stateValue(previous, 1, 'CR3BP previous y');
          const nextX = stateValue(next, 0, 'CR3BP next x');
          const nextY = stateValue(next, 1, 'CR3BP next y');
          for (const primaryX of [-mu, 1 - mu]) {
            if (
              distanceFromPointToSegment(previousX, previousY, nextX, nextY, primaryX, 0) <=
              CR3BP_EXCLUSION_RADIUS
            ) {
              throw new Error(
                `CR3BP close-encounter event crossed the declared ${CR3BP_EXCLUSION_RADIUS} exclusion radius between step ${step - 1} and step ${step} (t=${nextTime}).`,
              );
            }
          }
        },
      );
      const states = solved.states.map((state) => {
        const x = stateValue(state, 0, 'CR3BP x');
        const y = stateValue(state, 1, 'CR3BP y');
        const vx = stateValue(state, 2, 'CR3BP vx');
        const vy = stateValue(state, 3, 'CR3BP vy');
        const r1 = Math.hypot(x + mu, y);
        const r2 = Math.hypot(x - 1 + mu, y);
        const potential = 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2;
        return [x, y, vx, vy, 2 * potential - vx * vx - vy * vy];
      });
      return resultFromStates(
        d,
        solved.times,
        states,
        [
          { id: 'x', label: 'Rotating x' },
          { id: 'y', label: 'Rotating y' },
          { id: 'vx', label: 'Velocity x' },
          { id: 'vy', label: 'Velocity y' },
          { id: 'jacobi', label: 'Jacobi integral' },
        ],
        [0, 1],
        `Fixed-step RK4 of the rotating-frame CR3BP; segments entering the declared ${CR3BP_EXCLUSION_RADIUS} close-encounter radius are invalid.`,
      );
    }
    case 'n-body': {
      const thirdMass = p.mass ?? 0.6;
      const speed = p.velocity ?? 0.82;
      const softening = 0.12;
      const masses = [1, 0.85, thirdMass];
      const initial = [-0.8, 0, 0.8, 0, 0, 0.9, 0, speed, 0, -speed, -speed * 0.7, 0];
      const solved = rk4(
        initial,
        d,
        (_t, state) => {
          const acceleration = Array.from({ length: 6 }, () => 0);
          for (let i = 0; i < 3; i += 1) {
            for (let j = 0; j < 3; j += 1) {
              if (i === j) continue;
              const dx =
                stateValue(state, j * 2, 'N-body state') - stateValue(state, i * 2, 'N-body state');
              const dy =
                stateValue(state, j * 2 + 1, 'N-body state') -
                stateValue(state, i * 2 + 1, 'N-body state');
              const softenedRadiusCubed = (dx * dx + dy * dy + softening * softening) ** 1.5;
              acceleration[i * 2] +=
                (stateValue(masses, j, 'N-body masses') * dx) / softenedRadiusCubed;
              acceleration[i * 2 + 1] +=
                (stateValue(masses, j, 'N-body masses') * dy) / softenedRadiusCubed;
            }
          }
          return [...state.slice(6), ...acceleration];
        },
        1200,
      );
      return resultFromStates(
        d,
        solved.times,
        solved.states,
        [
          'Body A x',
          'Body A y',
          'Body B x',
          'Body B y',
          'Body C x',
          'Body C y',
          'Body A vx',
          'Body A vy',
          'Body B vx',
          'Body B vy',
          'Body C vx',
          'Body C vy',
        ],
        [0, 1],
        `Fixed-step RK4 of a planar three-body model with declared Plummer softening length ${softening}.`,
      );
    }
    case 'friedmann': {
      const matter = p.matter ?? 0.3;
      const vacuum = p.vacuum ?? 0.7;
      const curvature = 1 - matter - vacuum;
      const expansionRate = (a: number) => {
        if (!(a > 0)) throw new Error('Friedmann scale factor reached a non-positive value.');
        const radicand = matter / a + curvature + vacuum * a * a;
        if (radicand <= 0) {
          throw new Error(
            'Friedmann expanding-branch turnaround event made the radicand non-positive.',
          );
        }
        return Math.sqrt(radicand);
      };
      const solved = rk4(
        [0.06],
        d,
        (_t, state) => [expansionRate(stateValue(state, 0, 'Scale factor'))],
        900,
      );
      const states = solved.states.map((state) => {
        const a = stateValue(state, 0, 'Scale factor');
        const aDot = expansionRate(a);
        return [a, aDot / a, matter / a ** 3, vacuum];
      });
      return resultFromStates(
        d,
        solved.times,
        states,
        [
          { id: 'scale-factor', label: 'Scale factor' },
          { id: 'hubble-rate', label: 'Hubble rate' },
          { id: 'matter-density', label: 'Matter density' },
          { id: 'vacuum-density', label: 'Vacuum density' },
        ],
        [0, 1],
        'Fixed-step RK4 of the normalized Friedmann expanding branch; a non-positive radicand is an explicit turnaround event.',
      );
    }
    default:
      return null;
  }
}

function discreteWork(work: WorkManifest, p: Record<string, number>): WorkResult | null {
  if (work.kernel === 'logistic') {
    const growth = p.growth ?? 3.72;
    let x = p.initial ?? 0.21;
    const states: number[][] = [];
    const times: number[] = [];
    for (let iteration = 1; iteration <= 800; iteration += 1) {
      x = growth * x * (1 - x);
      if (iteration > 80) {
        states.push([x, iteration, growth]);
        times.push(iteration);
      }
    }
    const result = resultFromStates(
      800,
      times,
      states,
      [
        { id: 'x', label: 'Population' },
        { id: 'iteration', label: 'Iteration' },
        { id: 'growth', label: 'Growth' },
      ],
      [1, 0],
    );
    result.presentationDuration = work.duration;
    return result;
  }
  if (work.kernel === 'standard-map') {
    const kick = p.kick ?? 1.1;
    let theta = 0.3;
    let momentum = p.momentum ?? 0.4;
    const states: number[][] = [];
    const times: number[] = [];
    const period = Math.PI * 2;
    const wrap = (value: number) => {
      const remainder = value % period;
      return remainder < 0 ? remainder + period : remainder;
    };
    for (let iteration = 0; iteration <= 850; iteration += 1) {
      states.push([theta, momentum]);
      times.push(iteration);
      if (iteration === 850) break;
      momentum = wrap(momentum + kick * Math.sin(theta));
      theta = wrap(theta + momentum);
    }
    const result = resultFromStates(850, times, states, [
      { id: 'theta', label: 'Angle' },
      { id: 'momentum', label: 'Momentum' },
    ]);
    result.presentationDuration = work.duration;
    return result;
  }
  return null;
}

const kernelsByRuntime = {
  'reaction-network-v1': ['reaction-chain'],
  'ode-v1': [
    'double-pendulum',
    'kuramoto',
    'fput',
    'lotka-volterra',
    'brusselator',
    'oregonator',
    'sir',
    'hodgkin-huxley',
    'fitzhugh-nagumo',
    'lorenz',
    'stommel',
    'daisyworld',
    'carbon-cycle',
    'restricted-three-body',
    'n-body',
    'friedmann',
  ],
  'field-v1': [
    'wave',
    'heat',
    'schrodinger',
    'gray-scott',
    'cahn-hilliard',
    'shallow-water',
    'budyko-sellers',
  ],
  'discrete-v1': ['logistic', 'standard-map', 'ising'],
  'analytic-v1': ['kepler', 'hohmann', 'exoplanet-transit'],
} as const satisfies Record<RuntimeKind, readonly string[]>;

function registeredRuntimeFor(kernel: string): RuntimeKind | null {
  for (const runtime of Object.keys(kernelsByRuntime) as RuntimeKind[]) {
    if ((kernelsByRuntime[runtime] as readonly string[]).includes(kernel)) return runtime;
  }
  return null;
}

function dispatchWork(work: WorkManifest, parameters: Record<string, number>): WorkResult {
  const registeredRuntime = registeredRuntimeFor(work.kernel);
  if (registeredRuntime !== work.runtime) {
    if (registeredRuntime) {
      throw new Error(
        `Kernel "${work.kernel}" is registered for runtime "${registeredRuntime}", not declared runtime "${work.runtime}".`,
      );
    }
    throw new Error(
      `No simulation kernel "${work.kernel}" is registered for runtime "${work.runtime}".`,
    );
  }

  let result: WorkResult | null;
  switch (work.runtime) {
    case 'reaction-network-v1':
    case 'ode-v1':
      result =
        simulateReviewedFoundation(work, parameters) ??
        simulateReviewedCollective(work, parameters) ??
        odeWork(work, parameters);
      break;
    case 'analytic-v1':
      result = simulateReviewedAnalyticOrbit(work, parameters);
      break;
    case 'discrete-v1':
      // Ising is a seeded Markov chain whose scientific clock is Monte Carlo sweeps.
      // Its lattice view is a field payload, but it remains a discrete runtime.
      result = simulateReviewedField(work, parameters) ?? discreteWork(work, parameters);
      break;
    case 'field-v1':
      result =
        simulateReviewedField(work, parameters) ?? simulateReviewedAnalyticField(work, parameters);
      break;
  }

  if (!result) {
    throw new Error(
      `Kernel "${work.kernel}" did not produce a result for runtime "${work.runtime}".`,
    );
  }
  return result;
}

function validateWorkResult(work: WorkManifest, result: WorkResult): void {
  assertFiniteNumber(result.duration, `Work "${work.slug}" result duration`);
  if (result.duration <= 0) {
    throw new Error(`Work "${work.slug}" result duration must be positive.`);
  }
  if (result.presentationDuration !== undefined) {
    assertFiniteNumber(result.presentationDuration, `Work "${work.slug}" presentation duration`);
    if (result.presentationDuration <= 0) {
      throw new Error(`Work "${work.slug}" presentation duration must be positive.`);
    }
  }
  if (result.times.length === 0) throw new Error(`Work "${work.slug}" returned no times.`);
  result.times.forEach((time, index) => {
    assertFiniteNumber(time, `Work "${work.slug}" time[${index}]`);
    if (index > 0 && time <= result.times[index - 1]) {
      throw new Error(`Work "${work.slug}" times are not strictly increasing at index ${index}.`);
    }
  });
  if (result.series.length === 0) throw new Error(`Work "${work.slug}" returned no series.`);
  result.series.forEach((series) => {
    if (series.values.length !== result.times.length) {
      throw new Error(
        `Work "${work.slug}" series "${series.id}" has ${series.values.length} values for ${result.times.length} times.`,
      );
    }
    assertFiniteVector(
      series.values,
      result.times.length,
      `Work "${work.slug}" series "${series.id}"`,
    );
  });
  if (result.points.length !== result.times.length) {
    throw new Error(
      `Work "${work.slug}" has ${result.points.length} points for ${result.times.length} times.`,
    );
  }
  result.points.forEach((point, index) => {
    assertFiniteNumber(point.x, `Work "${work.slug}" point[${index}].x`);
    assertFiniteNumber(point.y, `Work "${work.slug}" point[${index}].y`);
  });
  if (result.field) {
    const { columns, rows, values } = result.field;
    if (!Number.isInteger(columns) || columns <= 0 || !Number.isInteger(rows) || rows <= 0) {
      throw new Error(
        `Work "${work.slug}" returned invalid field dimensions ${columns} x ${rows}.`,
      );
    }
    if (values.length !== columns * rows) {
      throw new Error(
        `Work "${work.slug}" field has ${values.length} values; expected ${columns * rows}.`,
      );
    }
    assertFiniteVector(values, columns * rows, `Work "${work.slug}" field`);
    if (result.field.valueDomain) {
      const [minimum, maximum] = result.field.valueDomain;
      assertFiniteNumber(minimum, `Work "${work.slug}" field value-domain minimum`);
      assertFiniteNumber(maximum, `Work "${work.slug}" field value-domain maximum`);
      if (minimum >= maximum) {
        throw new Error(`Work "${work.slug}" field value domain must increase.`);
      }
    }
  }
  const fieldFrames = result.numerical?.fieldFrames;
  if (fieldFrames) {
    if (fieldFrames.length !== result.times.length) {
      throw new Error(
        `Work "${work.slug}" has ${fieldFrames.length} field frames for ${result.times.length} times.`,
      );
    }
    fieldFrames.forEach((frame, frameIndex) => {
      assertFiniteNumber(frame.time, `Work "${work.slug}" field frame ${frameIndex} time`);
      if (frame.time !== result.times[frameIndex]) {
        throw new Error(`Work "${work.slug}" field frame ${frameIndex} time does not match times.`);
      }
      const [rows, columns] = frame.shape;
      if (
        !Number.isSafeInteger(rows) ||
        rows <= 0 ||
        !Number.isSafeInteger(columns) ||
        columns <= 0
      ) {
        throw new Error(
          `Work "${work.slug}" field frame ${frameIndex} has invalid shape ${rows} x ${columns}.`,
        );
      }
      const expected = rows * columns;
      if (Object.keys(frame.components).length === 0) {
        throw new Error(`Work "${work.slug}" field frame ${frameIndex} has no components.`);
      }
      for (const [component, values] of Object.entries(frame.components)) {
        assertFiniteVector(
          values,
          expected,
          `Work "${work.slug}" field frame ${frameIndex} component "${component}"`,
        );
      }
      const displayComponent = result.field?.componentId;
      if (displayComponent && !frame.components[displayComponent]) {
        throw new Error(
          `Work "${work.slug}" field frame ${frameIndex} omits display component "${displayComponent}".`,
        );
      }
    });
  }
  const rawState = result.numerical?.state;
  if (rawState) {
    const [frameCount, stateDimension] = rawState.shape;
    if (
      !Number.isSafeInteger(frameCount) ||
      frameCount <= 0 ||
      !Number.isSafeInteger(stateDimension) ||
      stateDimension <= 0 ||
      frameCount !== result.times.length ||
      rawState.coordinateIds.length !== stateDimension
    ) {
      throw new Error(`Work "${work.slug}" raw state shape does not match times or coordinates.`);
    }
    assertFiniteVector(
      rawState.values,
      frameCount * stateDimension,
      `Work "${work.slug}" raw state`,
    );
  }
}

export function simulateWork(work: WorkManifest, overrides: Record<string, number>): WorkResult {
  const parameters = parametersFor(work, overrides);
  const result = dispatchWork(work, parameters);
  validateWorkResult(work, result);
  return result;
}
