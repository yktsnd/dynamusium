import type { FieldFrame, Series, WorkManifest, WorkResult } from './types.ts';

type Derivative = (time: number, state: number[]) => number[];

const palette = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b', '#b99cff', '#ff8d68'];

function parametersFor(work: WorkManifest, overrides: Record<string, number>) {
  return Object.fromEntries(
    work.parameters.map((parameter) => [
      parameter.id,
      overrides[parameter.id] ?? parameter.default,
    ]),
  );
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(-1e6, Math.min(1e6, value)) : fallback;
}

function rk4(initial: number[], duration: number, derivative: Derivative, steps = 720) {
  const dt = duration / steps;
  const states: number[][] = [initial.slice()];
  const times = [0];
  let state = initial.slice();
  for (let step = 1; step <= steps; step += 1) {
    const time = (step - 1) * dt;
    const k1 = derivative(time, state);
    const k2 = derivative(
      time + dt / 2,
      state.map((v, i) => v + (dt * (k1[i] ?? 0)) / 2),
    );
    const k3 = derivative(
      time + dt / 2,
      state.map((v, i) => v + (dt * (k2[i] ?? 0)) / 2),
    );
    const k4 = derivative(
      time + dt,
      state.map((v, i) => v + dt * (k3[i] ?? 0)),
    );
    state = state.map((v, i) =>
      finite(v + (dt / 6) * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0))),
    );
    states.push(state);
    times.push(step * dt);
  }
  return { states, times };
}

function resultFromStates(
  duration: number,
  times: number[],
  states: number[][],
  labels: string[],
  pointAxes: [number, number] = [0, 1],
  diagnostics = 'Deterministic numerical trajectory',
): WorkResult {
  const series: Series[] = labels.map((label, index) => ({
    id: `${label.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'series'}-${index}`,
    label,
    color: palette[index % palette.length] ?? '#fff',
    values: states.map((state) => finite(state[index] ?? 0)),
  }));
  return {
    duration,
    times,
    series,
    points: states.map((state) => ({
      x: finite(state[pointAxes[0]] ?? 0),
      y: finite(state[pointAxes[1]] ?? 0),
    })),
    diagnostics,
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
      const positions = solved.states.map(([a = 0, b = 0]) => [
        Math.sin(a) + Math.sin(b),
        -Math.cos(a) - Math.cos(b),
        a,
        b,
      ]);
      return resultFromStates(d, solved.times, positions, ['Tip x', 'Tip y', 'Arm θ₁', 'Arm θ₂']);
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
            return (frequencies[i] ?? 0) + coupling * pull;
          }),
      );
      const order = solved.states.map((state) => {
        const x = state.reduce((sum, theta) => sum + Math.cos(theta), 0) / count;
        const y = state.reduce((sum, theta) => sum + Math.sin(theta), 0) / count;
        return [x, y, Math.hypot(x, y), state[0] ?? 0];
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
            const left = i === 0 ? 0 : (q[i - 1] ?? 0);
            const right = i === n - 1 ? 0 : (q[i + 1] ?? 0);
            return left - 2 * value + right + alpha * ((right - value) ** 2 - (value - left) ** 2);
          });
          return [...velocity, ...acceleration];
        },
        1000,
      );
      const modes = solved.states.map((state) => [
        state[0] ?? 0,
        state[2] ?? 0,
        state[4] ?? 0,
        state[6] ?? 0,
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
      return resultFromStates(d, solved.times, solved.states, ['Activator X', 'Intermediate Y']);
    }
    case 'oregonator': {
      const epsilon = p.epsilon ?? 0.08;
      const feedback = p.feedback ?? 1.2;
      const solved = rk4(
        [0.35, 0.9, 0.2],
        d,
        (_t, [x = 0, y = 0, z = 0]) => {
          const q = 0.02;
          return [
            (q * y - x * y + x * (1 - x)) / Math.max(epsilon, 0.02),
            -q * y - x * y + feedback * z,
            0.3 * (x - z),
          ];
        },
        1200,
      );
      return resultFromStates(d, solved.times, solved.states, ['HBrO₂', 'Br⁻', 'Catalyst']);
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
        ['Susceptible', 'Infectious', 'Removed'],
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
      return resultFromStates(d, solved.times, solved.states, ['Membrane potential', 'Recovery']);
    }
    case 'hodgkin-huxley': {
      const current = p.current ?? 10;
      const gNa = p.conductance ?? 120;
      const safeRate = (numerator: number, denominator: number) =>
        Math.abs(denominator) < 1e-7 ? 1 : numerator / denominator;
      const solved = rk4(
        [-65, 0.0529, 0.596, 0.317],
        d,
        (_t, [v = -65, m = 0, h = 0, n = 0]) => {
          const am = safeRate(0.1 * (v + 40), 1 - Math.exp(-(v + 40) / 10));
          const bm = 4 * Math.exp(-(v + 65) / 18);
          const ah = 0.07 * Math.exp(-(v + 65) / 20);
          const bh = 1 / (1 + Math.exp(-(v + 35) / 10));
          const an = safeRate(0.01 * (v + 55), 1 - Math.exp(-(v + 55) / 10));
          const bn = 0.125 * Math.exp(-(v + 65) / 80);
          const dv =
            current - gNa * m ** 3 * h * (v - 50) - 36 * n ** 4 * (v + 77) - 0.3 * (v + 54.4);
          return [dv, am * (1 - m) - bm * m, ah * (1 - h) - bh * h, an * (1 - n) - bn * n];
        },
        1800,
      );
      return resultFromStates(d, solved.times, solved.states, [
        'Voltage',
        'Na activation',
        'Na inactivation',
        'K activation',
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
        const bare = Math.max(0, 1 - dark - light);
        const albedo = 0.5 - 0.25 * dark + 0.25 * light;
        const temp = 22 + 55 * (luminosity * (1 - albedo) - 0.5);
        const growthDark = Math.max(0, 1 - ((temp + 4 - 22.5) / 18) ** 2);
        const growthLight = Math.max(0, 1 - ((temp - 4 - 22.5) / 18) ** 2);
        return [dark * (bare * growthDark - death), light * (bare * growthLight - death)];
      });
      return resultFromStates(d, solved.times, solved.states, ['Dark daisies', 'Light daisies']);
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
      const solved = rk4(
        [0.72, 0.05, 0, velocity],
        d,
        (_t, [x = 0, y = 0, vx = 0, vy = 0]) => {
          const r1 = Math.max(0.03, Math.hypot(x + mu, y));
          const r2 = Math.max(0.03, Math.hypot(x - 1 + mu, y));
          const ax = x + 2 * vy - ((1 - mu) * (x + mu)) / r1 ** 3 - (mu * (x - 1 + mu)) / r2 ** 3;
          const ay = y - 2 * vx - ((1 - mu) * y) / r1 ** 3 - (mu * y) / r2 ** 3;
          return [vx, vy, ax, ay];
        },
        1600,
      );
      return resultFromStates(d, solved.times, solved.states, [
        'Rotating x',
        'Rotating y',
        'Velocity x',
        'Velocity y',
      ]);
    }
    case 'n-body': {
      const thirdMass = p.mass ?? 0.6;
      const speed = p.velocity ?? 0.82;
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
              const dx = (state[j * 2] ?? 0) - (state[i * 2] ?? 0);
              const dy = (state[j * 2 + 1] ?? 0) - (state[i * 2 + 1] ?? 0);
              const radius = Math.max(0.12, Math.hypot(dx, dy));
              acceleration[i * 2] =
                (acceleration[i * 2] ?? 0) + ((masses[j] ?? 0) * dx) / radius ** 3;
              acceleration[i * 2 + 1] =
                (acceleration[i * 2 + 1] ?? 0) + ((masses[j] ?? 0) * dy) / radius ** 3;
            }
          }
          return [...state.slice(6), ...acceleration];
        },
        1200,
      );
      return resultFromStates(d, solved.times, solved.states, [
        'Body A x',
        'Body A y',
        'Body B x',
        'Body B y',
        'Body C x',
        'Body C y',
      ]);
    }
    case 'friedmann': {
      const matter = p.matter ?? 0.3;
      const vacuum = p.vacuum ?? 0.7;
      const curvature = 1 - matter - vacuum;
      const solved = rk4(
        [0.06],
        d,
        (_t, [a = 0.06]) => [
          Math.sqrt(Math.max(0.0001, matter / Math.max(a, 0.02) + curvature + vacuum * a * a)),
        ],
        900,
      );
      const states = solved.states.map(([a = 0]) => [a, matter / Math.max(a, 0.02) ** 3, vacuum]);
      return resultFromStates(
        d,
        solved.times,
        states,
        ['Scale factor', 'Matter density', 'Vacuum density'],
        [0, 1],
      );
    }
    default:
      return null;
  }
}

function analyticWork(work: WorkManifest, p: Record<string, number>): WorkResult | null {
  const samples = 720;
  const times = Array.from({ length: samples + 1 }, (_, i) => (i / samples) * work.duration);
  if (work.kernel === 'kepler') {
    const e = p.eccentricity ?? 0.48;
    const a = p.axis ?? 1;
    const states = times.map((_time, i) => {
      const theta = (i / samples) * Math.PI * 2;
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta));
      return [r * Math.cos(theta), r * Math.sin(theta), r];
    });
    return resultFromStates(work.duration, times, states, ['Orbit x', 'Orbit y', 'Radius']);
  }
  if (work.kernel === 'hohmann') {
    const target = p.target ?? 2.2;
    const phase = p.phase ?? 0;
    const states = times.map((_time, i) => {
      const theta = (i / samples) * Math.PI * 2;
      const transfer = i / samples < 0.5;
      const r = transfer
        ? (2 * target) / (1 + target + (target - 1) * Math.cos(theta * 2))
        : target;
      return [r * Math.cos(theta + phase), r * Math.sin(theta + phase), r];
    });
    return resultFromStates(work.duration, times, states, ['Transfer x', 'Transfer y', 'Radius']);
  }
  if (work.kernel === 'exoplanet-transit') {
    const radius = p.radius ?? 0.1;
    const impact = p.impact ?? 0.35;
    const states = times.map((_time, i) => {
      const phase = (i / samples) * 2 - 1;
      const separation = Math.hypot(phase * 2.2, impact);
      const overlap = Math.max(0, Math.min(1, (1 + radius - separation) / (2 * radius)));
      const flux =
        1 -
        radius *
          radius *
          overlap *
          (1 - 0.28 * Math.sqrt(Math.max(0, 1 - separation * separation)));
      return [phase, flux, overlap];
    });
    return resultFromStates(
      work.duration,
      times,
      states,
      ['Orbital phase', 'Stellar flux', 'Overlap'],
      [0, 1],
    );
  }
  return null;
}

function discreteWork(work: WorkManifest, p: Record<string, number>): WorkResult | null {
  if (work.kernel === 'logistic') {
    const growth = p.growth ?? 3.72;
    let x = p.initial ?? 0.21;
    const states: number[][] = [];
    const times: number[] = [];
    for (let i = 0; i <= 800; i += 1) {
      x = growth * x * (1 - x);
      if (i > 80) {
        states.push([i, x, growth]);
        times.push(states.length - 1);
      }
    }
    return resultFromStates(
      times.length - 1,
      times,
      states,
      ['Iteration', 'Population', 'Growth'],
      [0, 1],
    );
  }
  if (work.kernel === 'standard-map') {
    const kick = p.kick ?? 1.1;
    let theta = 0.3;
    let momentum = p.momentum ?? 0.4;
    const states: number[][] = [];
    const times: number[] = [];
    for (let i = 0; i <= 850; i += 1) {
      momentum = (momentum + kick * Math.sin(theta) + Math.PI * 4) % (Math.PI * 2);
      theta = (theta + momentum) % (Math.PI * 2);
      states.push([theta, momentum]);
      times.push(i);
    }
    return resultFromStates(850, times, states, ['Angle', 'Momentum']);
  }
  return null;
}

function seeded(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function fieldWork(work: WorkManifest, p: Record<string, number>): WorkResult | null {
  const columns = 48;
  const rows = 32;
  const values: number[] = [];
  const phase = 1.7;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const nx = (x / (columns - 1)) * 2 - 1;
      const ny = (y / (rows - 1)) * 2 - 1;
      let value: number;
      switch (work.kernel) {
        case 'wave': {
          const speed = p.speed ?? 1;
          const mode = p.mode ?? 2;
          value =
            Math.sin(Math.PI * mode * nx - phase * speed) * Math.cos(Math.PI * ny) * 0.5 + 0.5;
          break;
        }
        case 'heat': {
          const diffusivity = p.diffusivity ?? 0.25;
          const sources = Math.round(p.sources ?? 2);
          value = 0;
          for (let source = 0; source < sources; source += 1) {
            const sx = Math.cos(source * 2.4) * 0.45;
            const sy = Math.sin(source * 1.7) * 0.45;
            value += Math.exp(-((nx - sx) ** 2 + (ny - sy) ** 2) / (0.05 + diffusivity * 0.35));
          }
          value = Math.min(1, value / Math.max(1, sources * 0.55));
          break;
        }
        case 'schrodinger': {
          const momentum = p.momentum ?? 3.2;
          const width = p.width ?? 0.65;
          const envelope = Math.exp(
            -((nx + 0.15) ** 2 + ny * ny * 1.8) / Math.max(0.03, width * width),
          );
          value = 0.5 + 0.5 * envelope * Math.cos(momentum * 6 * nx - phase);
          break;
        }
        case 'gray-scott': {
          const feed = p.feed ?? 0.0367;
          const kill = p.kill ?? 0.0649;
          const radial = Math.hypot(nx, ny);
          value =
            0.5 +
            0.5 *
              Math.sin(28 * radial - 9 * phase + 180 * feed) *
              Math.cos(13 * nx * ny + 100 * kill);
          value *= Math.exp(-0.18 * radial);
          break;
        }
        case 'ising': {
          const temperature = p.temperature ?? 2.27;
          const field = p.field ?? 0;
          const scale = Math.max(2, Math.round(2 + temperature * 1.5));
          const cell = Math.floor(x / scale) + Math.floor(y / scale) * 31;
          value = seeded(cell) + field * 0.22 > temperature / 5 ? 1 : 0;
          break;
        }
        case 'cahn-hilliard': {
          const mobility = p.mobility ?? 0.35;
          const interfaceCost = p.interface ?? 0.7;
          const texture =
            Math.sin(9 * nx + 3 * Math.sin(7 * ny)) + Math.cos(8 * ny - 2 * Math.sin(6 * nx));
          value =
            0.5 +
            0.5 *
              Math.tanh(
                (texture + (seeded(x + y * columns) - 0.5) * mobility * 3) /
                  Math.max(0.2, interfaceCost),
              );
          break;
        }
        case 'shallow-water': {
          const depth = p.depth ?? 1;
          const rotation = p.rotation ?? 0.7;
          value =
            0.5 +
            0.22 * Math.sin(9 * nx - phase * Math.sqrt(depth)) +
            0.18 * Math.cos(7 * ny + rotation * nx * 4);
          break;
        }
        case 'budyko-sellers': {
          const solar = p.solar ?? 1;
          const transport = p.transport ?? 0.35;
          const latitude = Math.abs(ny);
          const temperature =
            1.25 * solar * (1 - 0.55 * latitude ** 2) - 0.52 + transport * (0.5 - latitude);
          value = 1 / (1 + Math.exp(-10 * temperature));
          break;
        }
        default:
          return null;
      }
      values.push(Math.max(0, Math.min(1, finite(value, 0.5))));
    }
  }
  const rowMeans = Array.from({ length: rows }, (_, row) => {
    const slice = values.slice(row * columns, (row + 1) * columns);
    return slice.reduce((sum, value) => sum + value, 0) / columns;
  });
  const times = rowMeans.map((_value, index) => (index / (rows - 1)) * work.duration);
  const series: Series[] = [
    {
      id: 'field-intensity',
      label: 'Field intensity',
      color: palette[0] ?? '#fff',
      values: rowMeans,
    },
    {
      id: 'field-contrast',
      label: 'Local contrast',
      color: palette[1] ?? '#fff',
      values: rowMeans.map((value, index) => Math.abs(value - (rowMeans[index - 1] ?? value))),
    },
  ];
  const field: FieldFrame = { columns, rows, values };
  return {
    duration: work.duration,
    times,
    series,
    points: rowMeans.map((value, index) => ({ x: index, y: value })),
    field,
    diagnostics: 'Deterministic spatial field sampled on a 48 × 32 grid',
  };
}

export function simulateWork(work: WorkManifest, overrides: Record<string, number>): WorkResult {
  const parameters = parametersFor(work, overrides);
  const result =
    odeWork(work, parameters) ??
    analyticWork(work, parameters) ??
    discreteWork(work, parameters) ??
    fieldWork(work, parameters);
  if (!result) throw new Error(`No simulation kernel registered for ${work.kernel}.`);
  return result;
}
