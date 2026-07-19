export type FieldSolverId =
  'gray-scott' | 'cahn-hilliard' | 'ising-metropolis' | 'linear-rotating-shallow-water';

export type FieldComponentData = Float64Array | Int8Array;

export interface FieldSolverFrame {
  time: number;
  components: Readonly<Record<string, FieldComponentData>>;
}

export interface FieldSummarySeries {
  id: string;
  label: string;
  unit: string;
  values: Float64Array;
}

export interface FieldValidationEvidence {
  id: string;
  category: 'stability' | 'invariant' | 'constraint' | 'diagnostic';
  status: 'passed' | 'observed';
  value: number;
  unit: string;
  tolerance?: number;
  description: string;
}

export interface FieldSolverMetadata {
  solverId: FieldSolverId;
  version: 1;
  equation: string;
  method: string;
  dynamics: 'deterministic' | 'stochastic';
  reproducibility: 'bitwise-deterministic' | 'seeded-replay';
  boundary: 'periodic-x-y';
  grid: {
    width: number;
    height: number;
    dx: number;
    dy: number;
  };
  temporal: {
    stepSize: number;
    steps: number;
    unit: 'dimensionless-time' | 'sweep';
  };
  parameters: Readonly<Record<string, number | string>>;
}

export interface FieldSolverResult {
  times: Float64Array;
  frames: FieldSolverFrame[];
  summaries: FieldSummarySeries[];
  metadata: FieldSolverMetadata;
  evidence: FieldValidationEvidence[];
}

export type FieldSolverErrorKind =
  'invalid-input' | 'stability-limit' | 'non-finite' | 'constraint-violation';

export class FieldSolverError extends Error {
  readonly kind: FieldSolverErrorKind;
  readonly solverId: FieldSolverId;
  readonly step: number | undefined;

  constructor(kind: FieldSolverErrorKind, solverId: FieldSolverId, message: string, step?: number) {
    super(message);
    this.name = 'FieldSolverError';
    this.kind = kind;
    this.solverId = solverId;
    this.step = step;
  }
}

interface GridOptions {
  width?: number;
  height?: number;
  dx?: number;
  dy?: number;
  snapshotCount?: number;
}

export type GrayScottInitialCondition =
  | { kind: 'uniform'; u: number; v: number }
  | {
      kind: 'central-square';
      halfWidth: number;
      uInside: number;
      vInside: number;
      uOutside: number;
      vOutside: number;
    };

export interface GrayScottOptions extends GridOptions {
  diffusionU?: number;
  diffusionV?: number;
  feed?: number;
  kill?: number;
  dt?: number;
  steps?: number;
  initialCondition?: GrayScottInitialCondition;
}

export type CahnHilliardInitialCondition =
  | { kind: 'uniform'; value: number }
  | {
      kind: 'cosine-modes';
      mean: number;
      amplitude: number;
      modeX: number;
      modeY: number;
    };

export interface CahnHilliardOptions extends GridOptions {
  mobility?: number;
  kappa?: number;
  dt?: number;
  steps?: number;
  initialCondition?: CahnHilliardInitialCondition;
}

export interface IsingOptions extends GridOptions {
  seed: number;
  temperature?: number;
  coupling?: number;
  field?: number;
  sweeps?: number;
  initialState?: 'random' | 'up' | 'down';
}

export type ShallowWaterInitialCondition =
  | { kind: 'cosine-height'; amplitude: number; modeX: number; modeY: number }
  | { kind: 'uniform-flow'; surfaceHeight: number; u: number; v: number };

export interface ShallowWaterOptions extends GridOptions {
  gravity?: number;
  meanDepth?: number;
  coriolis?: number;
  dt?: number;
  steps?: number;
  initialCondition?: ShallowWaterInitialCondition;
}

const DEFAULT_SNAPSHOT_COUNT = 9;
const MAX_SNAPSHOT_COUNT = 32;
const MAX_GRID_CELLS = 128 * 128;
const MASS_TOLERANCE_FACTOR = 1e-10;

function finiteInput(solverId: FieldSolverId, name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new FieldSolverError('invalid-input', solverId, `${name} must be finite`);
  }
  return value;
}

function positiveInput(solverId: FieldSolverId, name: string, value: number): number {
  finiteInput(solverId, name, value);
  if (value <= 0) {
    throw new FieldSolverError('invalid-input', solverId, `${name} must be greater than zero`);
  }
  return value;
}

function nonnegativeInput(solverId: FieldSolverId, name: string, value: number): number {
  finiteInput(solverId, name, value);
  if (value < 0) {
    throw new FieldSolverError('invalid-input', solverId, `${name} must be nonnegative`);
  }
  return value;
}

function integerInput(
  solverId: FieldSolverId,
  name: string,
  value: number,
  minimum: number,
): number {
  finiteInput(solverId, name, value);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new FieldSolverError(
      'invalid-input',
      solverId,
      `${name} must be an integer greater than or equal to ${minimum}`,
    );
  }
  return value;
}

function snapshotSteps(
  solverId: FieldSolverId,
  steps: number,
  requestedCount: number,
): Set<number> {
  const count = integerInput(solverId, 'snapshotCount', requestedCount, 2);
  if (count > MAX_SNAPSHOT_COUNT) {
    throw new FieldSolverError(
      'invalid-input',
      solverId,
      `snapshotCount cannot exceed the fixed browser budget of ${MAX_SNAPSHOT_COUNT}`,
    );
  }
  if (count > steps + 1) {
    throw new FieldSolverError(
      'invalid-input',
      solverId,
      'snapshotCount cannot exceed the number of computed states',
    );
  }
  const selected = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    selected.add(Math.round((index * steps) / (count - 1)));
  }
  return selected;
}

function enforceWorkBudget(
  solverId: FieldSolverId,
  width: number,
  height: number,
  steps: number,
  maximumCellSteps: number,
) {
  const cells = width * height;
  if (cells > MAX_GRID_CELLS) {
    throw new FieldSolverError(
      'invalid-input',
      solverId,
      `grid has ${cells} cells; the fixed browser budget is ${MAX_GRID_CELLS}`,
    );
  }
  if (cells * steps > maximumCellSteps) {
    throw new FieldSolverError(
      'invalid-input',
      solverId,
      `requested ${cells * steps} cell-steps exceeds the solver budget ${maximumCellSteps}`,
    );
  }
}

function periodicLaplacian(
  input: Float64Array,
  output: Float64Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
) {
  const inverseDxSquared = 1 / (dx * dx);
  const inverseDySquared = 1 / (dy * dy);
  for (let y = 0; y < height; y += 1) {
    const up = y === 0 ? height - 1 : y - 1;
    const down = y === height - 1 ? 0 : y + 1;
    for (let x = 0; x < width; x += 1) {
      const left = x === 0 ? width - 1 : x - 1;
      const right = x === width - 1 ? 0 : x + 1;
      const index = y * width + x;
      output[index] =
        (input[y * width + left]! - 2 * input[index]! + input[y * width + right]!) *
          inverseDxSquared +
        (input[up * width + x]! - 2 * input[index]! + input[down * width + x]!) * inverseDySquared;
    }
  }
}

function ensureFiniteArray(
  solverId: FieldSolverId,
  values: ArrayLike<number>,
  component: string,
  step: number,
) {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new FieldSolverError(
        'non-finite',
        solverId,
        `${component}[${index}] became non-finite at step ${step}`,
        step,
      );
    }
  }
}

function arrayMean(values: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index]!;
  return total / values.length;
}

function arrayVariance(values: ArrayLike<number>, mean: number): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const difference = values[index]! - mean;
    total += difference * difference;
  }
  return total / values.length;
}

function arraySum(values: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index]!;
  return total;
}

function summarySeries(
  id: string,
  label: string,
  unit: string,
  values: number[],
): FieldSummarySeries {
  return { id, label, unit, values: Float64Array.from(values) };
}

function massTolerance(initialMass: number): number {
  return MASS_TOLERANCE_FACTOR * Math.max(1, Math.abs(initialMass));
}

export function simulateGrayScott(options: GrayScottOptions = {}): FieldSolverResult {
  const solverId = 'gray-scott';
  const width = integerInput(solverId, 'width', options.width ?? 48, 8);
  const height = integerInput(solverId, 'height', options.height ?? 32, 8);
  const dx = positiveInput(solverId, 'dx', options.dx ?? 1);
  const dy = positiveInput(solverId, 'dy', options.dy ?? 1);
  const diffusionU = positiveInput(solverId, 'diffusionU', options.diffusionU ?? 0.16);
  const diffusionV = positiveInput(solverId, 'diffusionV', options.diffusionV ?? 0.08);
  const feed = nonnegativeInput(solverId, 'feed', options.feed ?? 0.0367);
  const kill = nonnegativeInput(solverId, 'kill', options.kill ?? 0.0649);
  const dt = positiveInput(solverId, 'dt', options.dt ?? 1);
  const steps = integerInput(solverId, 'steps', options.steps ?? 900, 1);
  enforceWorkBudget(solverId, width, height, steps, 8_000_000);
  const captures = snapshotSteps(solverId, steps, options.snapshotCount ?? DEFAULT_SNAPSHOT_COUNT);
  const initial =
    options.initialCondition ??
    ({
      kind: 'central-square',
      halfWidth: 3,
      uInside: 0.5,
      vInside: 0.25,
      uOutside: 1,
      vOutside: 0,
    } satisfies GrayScottInitialCondition);

  const inverseDxSquared = 1 / (dx * dx);
  const inverseDySquared = 1 / (dy * dy);
  const diffusionCfl =
    2 * Math.max(diffusionU, diffusionV) * dt * (inverseDxSquared + inverseDySquared);
  if (diffusionCfl > 1) {
    throw new FieldSolverError(
      'stability-limit',
      solverId,
      `explicit diffusion CFL ${diffusionCfl} exceeds the limit 1`,
    );
  }

  const count = width * height;
  let u = new Float64Array(count);
  let v = new Float64Array(count);
  if (initial.kind === 'uniform') {
    const initialU = nonnegativeInput(solverId, 'initialCondition.u', initial.u);
    const initialV = nonnegativeInput(solverId, 'initialCondition.v', initial.v);
    u.fill(initialU);
    v.fill(initialV);
  } else {
    const halfWidth = positiveInput(solverId, 'initialCondition.halfWidth', initial.halfWidth);
    if (halfWidth * 2 >= Math.min(width * dx, height * dy)) {
      throw new FieldSolverError(
        'invalid-input',
        solverId,
        'initialCondition.halfWidth must leave an exterior region in physical coordinates',
      );
    }
    const uInside = nonnegativeInput(solverId, 'initialCondition.uInside', initial.uInside);
    const vInside = nonnegativeInput(solverId, 'initialCondition.vInside', initial.vInside);
    const uOutside = nonnegativeInput(solverId, 'initialCondition.uOutside', initial.uOutside);
    const vOutside = nonnegativeInput(solverId, 'initialCondition.vOutside', initial.vOutside);
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside =
          Math.abs(x - centerX) * dx <= halfWidth && Math.abs(y - centerY) * dy <= halfWidth;
        const index = y * width + x;
        u[index] = inside ? uInside : uOutside;
        v[index] = inside ? vInside : vOutside;
      }
    }
  }

  let nextU = new Float64Array(count);
  let nextV = new Float64Array(count);
  const laplacianU = new Float64Array(count);
  const laplacianV = new Float64Array(count);
  const times: number[] = [];
  const frames: FieldSolverFrame[] = [];
  const meanU: number[] = [];
  const meanV: number[] = [];
  const varianceV: number[] = [];
  let minimumConcentration = Number.POSITIVE_INFINITY;
  let maximumReactionStepNumber = 0;

  const capture = (step: number) => {
    const currentMeanU = arrayMean(u);
    const currentMeanV = arrayMean(v);
    times.push(step * dt);
    frames.push({ time: step * dt, components: { u: u.slice(), v: v.slice() } });
    meanU.push(currentMeanU);
    meanV.push(currentMeanV);
    varianceV.push(arrayVariance(v, currentMeanV));
  };

  capture(0);
  for (let step = 1; step <= steps; step += 1) {
    periodicLaplacian(u, laplacianU, width, height, dx, dy);
    periodicLaplacian(v, laplacianV, width, height, dx, dy);
    let reactionStepNumber = 0;
    for (let index = 0; index < count; index += 1) {
      const uValue = u[index]!;
      const vValue = v[index]!;
      const vSquared = vValue * vValue;
      const uvTwice = 2 * Math.abs(uValue * vValue);
      const localReactionBound = Math.max(
        vSquared + feed + uvTwice,
        vSquared + Math.abs(2 * uValue * vValue - (feed + kill)),
      );
      reactionStepNumber = Math.max(reactionStepNumber, dt * localReactionBound);
      const conversion = uValue * vSquared;
      nextU[index] =
        uValue + dt * (diffusionU * laplacianU[index]! - conversion + feed * (1 - uValue));
      nextV[index] =
        vValue + dt * (diffusionV * laplacianV[index]! + conversion - (feed + kill) * vValue);
    }
    if (reactionStepNumber > 1) {
      throw new FieldSolverError(
        'stability-limit',
        solverId,
        `explicit reaction step number ${reactionStepNumber} exceeds the limit 1`,
        step,
      );
    }
    maximumReactionStepNumber = Math.max(maximumReactionStepNumber, reactionStepNumber);
    ensureFiniteArray(solverId, nextU, 'u', step);
    ensureFiniteArray(solverId, nextV, 'v', step);
    for (let index = 0; index < count; index += 1) {
      const nextUValue = nextU[index]!;
      const nextVValue = nextV[index]!;
      minimumConcentration = Math.min(minimumConcentration, nextUValue, nextVValue);
      if (nextUValue < 0 || nextVValue < 0) {
        throw new FieldSolverError(
          'constraint-violation',
          solverId,
          `negative concentration at cell ${index} and step ${step}`,
          step,
        );
      }
    }
    [u, nextU] = [nextU, u];
    [v, nextV] = [nextV, v];
    if (captures.has(step)) capture(step);
  }

  return {
    times: Float64Array.from(times),
    frames,
    summaries: [
      summarySeries('mean-u', 'Mean U', 'concentration', meanU),
      summarySeries('mean-v', 'Mean V', 'concentration', meanV),
      summarySeries('variance-v', 'Variance of V', 'concentration²', varianceV),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'u_t = D_u Δu - uv² + F(1-u); v_t = D_v Δv + uv² - (F+k)v',
      method: 'forward Euler with a five-point periodic Laplacian',
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      boundary: 'periodic-x-y',
      grid: { width, height, dx, dy },
      temporal: { stepSize: dt, steps, unit: 'dimensionless-time' },
      parameters: {
        diffusionU,
        diffusionV,
        feed,
        kill,
        initialCondition: JSON.stringify(initial),
      },
    },
    evidence: [
      {
        id: 'diffusion-cfl',
        category: 'stability',
        status: 'passed',
        value: diffusionCfl,
        unit: '1',
        tolerance: 1,
        description: 'Forward-Euler diffusion number on the periodic five-point grid.',
      },
      {
        id: 'reaction-step-number',
        category: 'stability',
        status: 'passed',
        value: maximumReactionStepNumber,
        unit: '1',
        tolerance: 1,
        description: 'Maximum local reaction Jacobian row-sum bound multiplied by dt.',
      },
      {
        id: 'minimum-concentration',
        category: 'constraint',
        status: 'passed',
        value: minimumConcentration,
        unit: 'concentration',
        tolerance: 0,
        description: 'Minimum accepted U or V value; negative values abort rather than clamp.',
      },
    ],
  };
}

function cahnHilliardFreeEnergy(
  phi: Float64Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
  kappa: number,
): number {
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    const down = y === height - 1 ? 0 : y + 1;
    for (let x = 0; x < width; x += 1) {
      const right = x === width - 1 ? 0 : x + 1;
      const index = y * width + x;
      const value = phi[index]!;
      const gradientX = (phi[y * width + right]! - value) / dx;
      const gradientY = (phi[down * width + x]! - value) / dy;
      const bulk = 0.25 * (value * value - 1) ** 2;
      total += bulk + 0.5 * kappa * (gradientX * gradientX + gradientY * gradientY);
    }
  }
  return total * dx * dy;
}

function periodicSignChangeDensity(phi: Float64Array, width: number, height: number): number {
  let crossings = 0;
  const edgeCount = 2 * width * height;
  for (let y = 0; y < height; y += 1) {
    const down = y === height - 1 ? 0 : y + 1;
    for (let x = 0; x < width; x += 1) {
      const right = x === width - 1 ? 0 : x + 1;
      const value = phi[y * width + x]!;
      if (value * phi[y * width + right]! < 0) crossings += 1;
      if (value * phi[down * width + x]! < 0) crossings += 1;
    }
  }
  return crossings / edgeCount;
}

export function simulateCahnHilliard(options: CahnHilliardOptions = {}): FieldSolverResult {
  const solverId = 'cahn-hilliard';
  const width = integerInput(solverId, 'width', options.width ?? 32, 8);
  const height = integerInput(solverId, 'height', options.height ?? 32, 8);
  const dx = positiveInput(solverId, 'dx', options.dx ?? 1);
  const dy = positiveInput(solverId, 'dy', options.dy ?? 1);
  const mobility = positiveInput(solverId, 'mobility', options.mobility ?? 1);
  const kappa = positiveInput(solverId, 'kappa', options.kappa ?? 1);
  const dt = positiveInput(solverId, 'dt', options.dt ?? 0.005);
  const steps = integerInput(solverId, 'steps', options.steps ?? 1000, 1);
  enforceWorkBudget(solverId, width, height, steps, 8_000_000);
  const captures = snapshotSteps(solverId, steps, options.snapshotCount ?? DEFAULT_SNAPSHOT_COUNT);
  const initial =
    options.initialCondition ??
    ({
      kind: 'cosine-modes',
      mean: 0,
      amplitude: 0.04,
      modeX: 2,
      modeY: 3,
    } satisfies CahnHilliardInitialCondition);
  const count = width * height;
  let phi = new Float64Array(count);
  if (initial.kind === 'uniform') {
    const value = finiteInput(solverId, 'initialCondition.value', initial.value);
    phi.fill(value);
  } else {
    const mean = finiteInput(solverId, 'initialCondition.mean', initial.mean);
    const amplitude = finiteInput(solverId, 'initialCondition.amplitude', initial.amplitude);
    const modeX = integerInput(solverId, 'initialCondition.modeX', initial.modeX, 1);
    const modeY = integerInput(solverId, 'initialCondition.modeY', initial.modeY, 1);
    if (modeX >= width / 2 || modeY >= height / 2) {
      throw new FieldSolverError(
        'invalid-input',
        solverId,
        'initial cosine modes must be below the grid Nyquist frequency',
      );
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        phi[y * width + x] =
          mean +
          amplitude *
            (Math.cos((2 * Math.PI * modeX * x) / width) +
              Math.cos((2 * Math.PI * modeY * y) / height));
      }
    }
  }

  let nextPhi = new Float64Array(count);
  const laplacianPhi = new Float64Array(count);
  const chemicalPotential = new Float64Array(count);
  const laplacianChemicalPotential = new Float64Array(count);
  const times: number[] = [];
  const frames: FieldSolverFrame[] = [];
  const meanPhi: number[] = [];
  const freeEnergy: number[] = [];
  const interfaceDensity: number[] = [];
  const initialMass = arraySum(phi) * dx * dy;
  const allowedMassResidual = massTolerance(initialMass);
  let maximumMassResidual = 0;
  let maximumStabilityNumber = 0;

  const capture = (step: number) => {
    times.push(step * dt);
    frames.push({ time: step * dt, components: { phi: phi.slice() } });
    meanPhi.push(arrayMean(phi));
    freeEnergy.push(cahnHilliardFreeEnergy(phi, width, height, dx, dy, kappa));
    interfaceDensity.push(periodicSignChangeDensity(phi, width, height));
  };

  capture(0);
  const laplacianMagnitudeBound = 4 / (dx * dx) + 4 / (dy * dy);
  for (let step = 1; step <= steps; step += 1) {
    let maximumFreeEnergyCurvature = 0;
    for (let index = 0; index < count; index += 1) {
      const value = phi[index]!;
      maximumFreeEnergyCurvature = Math.max(
        maximumFreeEnergyCurvature,
        Math.abs(3 * value * value - 1),
      );
    }
    const stabilityNumber =
      dt *
      mobility *
      (kappa * laplacianMagnitudeBound ** 2 + maximumFreeEnergyCurvature * laplacianMagnitudeBound);
    if (stabilityNumber > 1) {
      throw new FieldSolverError(
        'stability-limit',
        solverId,
        `explicit Cahn-Hilliard stability number ${stabilityNumber} exceeds the limit 1`,
        step,
      );
    }
    maximumStabilityNumber = Math.max(maximumStabilityNumber, stabilityNumber);
    periodicLaplacian(phi, laplacianPhi, width, height, dx, dy);
    for (let index = 0; index < count; index += 1) {
      const value = phi[index]!;
      chemicalPotential[index] = value ** 3 - value - kappa * laplacianPhi[index]!;
    }
    periodicLaplacian(chemicalPotential, laplacianChemicalPotential, width, height, dx, dy);
    for (let index = 0; index < count; index += 1) {
      nextPhi[index] = phi[index]! + dt * mobility * laplacianChemicalPotential[index]!;
    }
    ensureFiniteArray(solverId, nextPhi, 'phi', step);
    const currentMass = arraySum(nextPhi) * dx * dy;
    const residual = Math.abs(currentMass - initialMass);
    maximumMassResidual = Math.max(maximumMassResidual, residual);
    if (residual > allowedMassResidual) {
      throw new FieldSolverError(
        'constraint-violation',
        solverId,
        `discrete mass residual ${residual} exceeds ${allowedMassResidual}`,
        step,
      );
    }
    [phi, nextPhi] = [nextPhi, phi];
    if (captures.has(step)) capture(step);
  }

  let maximumFreeEnergyIncrease = 0;
  for (let index = 1; index < freeEnergy.length; index += 1) {
    maximumFreeEnergyIncrease = Math.max(
      maximumFreeEnergyIncrease,
      freeEnergy[index]! - freeEnergy[index - 1]!,
    );
  }
  const energyTolerance = 1e-10 * Math.max(1, ...freeEnergy.map((energy) => Math.abs(energy)));

  return {
    times: Float64Array.from(times),
    frames,
    summaries: [
      summarySeries('mean-phi', 'Mean order parameter', '1', meanPhi),
      summarySeries('free-energy', 'Discrete free energy', 'energy', freeEnergy),
      summarySeries(
        'interface-density',
        'Periodic sign-change edge density',
        'fraction',
        interfaceDensity,
      ),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'phi_t = M Δ(phi³ - phi - kappa Δphi)',
      method: 'forward Euler with two five-point periodic Laplacians',
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      boundary: 'periodic-x-y',
      grid: { width, height, dx, dy },
      temporal: { stepSize: dt, steps, unit: 'dimensionless-time' },
      parameters: { mobility, kappa, initialCondition: JSON.stringify(initial) },
    },
    evidence: [
      {
        id: 'explicit-stability-number',
        category: 'stability',
        status: 'passed',
        value: maximumStabilityNumber,
        unit: '1',
        tolerance: 1,
        description: 'Operator-norm safety bound for the explicit fourth-order update.',
      },
      {
        id: 'mass-residual',
        category: 'invariant',
        status: 'passed',
        value: maximumMassResidual,
        unit: 'order-parameter × area',
        tolerance: allowedMassResidual,
        description: 'Maximum absolute drift of the periodic-domain integral of phi.',
      },
      {
        id: 'free-energy-increase',
        category: 'invariant',
        status: maximumFreeEnergyIncrease <= energyTolerance ? 'passed' : 'observed',
        value: maximumFreeEnergyIncrease,
        unit: 'energy',
        tolerance: energyTolerance,
        description:
          'Maximum increase between captured discrete free-energy samples; no post-hoc correction is applied.',
      },
    ],
  };
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function isingMagnetization(spins: Int8Array): number {
  return arraySum(spins) / spins.length;
}

function isingEnergy(
  spins: Int8Array,
  width: number,
  height: number,
  coupling: number,
  field: number,
): number {
  let energy = 0;
  for (let y = 0; y < height; y += 1) {
    const down = y === height - 1 ? 0 : y + 1;
    for (let x = 0; x < width; x += 1) {
      const right = x === width - 1 ? 0 : x + 1;
      const index = y * width + x;
      const spin = spins[index]!;
      energy -= coupling * spin * (spins[y * width + right]! + spins[down * width + x]!);
      energy -= field * spin;
    }
  }
  return energy / spins.length;
}

export function simulateIsing(options: IsingOptions): FieldSolverResult {
  const solverId = 'ising-metropolis';
  if (options === undefined || options === null) {
    throw new FieldSolverError('invalid-input', solverId, 'an explicit seed is required');
  }
  const width = integerInput(solverId, 'width', options.width ?? 32, 8);
  const height = integerInput(solverId, 'height', options.height ?? 32, 8);
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new FieldSolverError(
      'invalid-input',
      solverId,
      'periodic checkerboard Metropolis requires even width and height',
    );
  }
  const dx = positiveInput(solverId, 'dx', options.dx ?? 1);
  const dy = positiveInput(solverId, 'dy', options.dy ?? 1);
  const seed = integerInput(solverId, 'seed', options.seed, 0);
  if (seed > 0xffff_ffff) {
    throw new FieldSolverError(
      'invalid-input',
      solverId,
      'seed must fit in an unsigned 32-bit integer',
    );
  }
  const temperature = nonnegativeInput(solverId, 'temperature', options.temperature ?? 2.269);
  const coupling = finiteInput(solverId, 'coupling', options.coupling ?? 1);
  const field = finiteInput(solverId, 'field', options.field ?? 0);
  const sweeps = integerInput(solverId, 'sweeps', options.sweeps ?? 160, 1);
  enforceWorkBudget(solverId, width, height, sweeps, 4_000_000);
  const captures = snapshotSteps(solverId, sweeps, options.snapshotCount ?? DEFAULT_SNAPSHOT_COUNT);
  const initialState = options.initialState ?? 'random';
  const random = createMulberry32(seed);
  const count = width * height;
  const spins = new Int8Array(count);
  for (let index = 0; index < count; index += 1) {
    spins[index] =
      initialState === 'up' ? 1 : initialState === 'down' ? -1 : random() < 0.5 ? -1 : 1;
  }

  const times: number[] = [];
  const frames: FieldSolverFrame[] = [];
  const magnetization: number[] = [];
  const energy: number[] = [];
  const acceptanceFraction: number[] = [];
  let attempted = 0;
  let accepted = 0;

  const capture = (sweep: number) => {
    times.push(sweep);
    frames.push({ time: sweep, components: { spin: spins.slice() } });
    magnetization.push(isingMagnetization(spins));
    energy.push(isingEnergy(spins, width, height, coupling, field));
    acceptanceFraction.push(attempted === 0 ? 0 : accepted / attempted);
  };

  capture(0);
  for (let sweep = 1; sweep <= sweeps; sweep += 1) {
    for (let parity = 0; parity < 2; parity += 1) {
      for (let y = 0; y < height; y += 1) {
        const up = y === 0 ? height - 1 : y - 1;
        const down = y === height - 1 ? 0 : y + 1;
        for (let x = 0; x < width; x += 1) {
          if ((x + y) % 2 !== parity) continue;
          const left = x === 0 ? width - 1 : x - 1;
          const right = x === width - 1 ? 0 : x + 1;
          const index = y * width + x;
          const spin = spins[index]!;
          const neighborSum =
            spins[y * width + left]! +
            spins[y * width + right]! +
            spins[up * width + x]! +
            spins[down * width + x]!;
          const energyChange = 2 * spin * (coupling * neighborSum + field);
          if (!Number.isFinite(energyChange)) {
            throw new FieldSolverError(
              'non-finite',
              solverId,
              `spin-flip energy became non-finite at sweep ${sweep}`,
              sweep,
            );
          }
          attempted += 1;
          const accept =
            energyChange <= 0 ||
            (temperature > 0 && random() < Math.exp(-energyChange / temperature));
          if (accept) {
            spins[index] = -spin;
            accepted += 1;
          }
        }
      }
    }
    if (captures.has(sweep)) capture(sweep);
  }
  ensureFiniteArray(solverId, energy, 'energy summary', sweeps);
  const burnInCapture = Math.floor(magnetization.length / 2);
  const retainedMagnetization = magnetization.slice(burnInCapture);
  const retainedMean = arrayMean(retainedMagnetization);
  let retainedVariance = 0;
  let lagOneCovariance = 0;
  for (let index = 0; index < retainedMagnetization.length; index += 1) {
    const centered = retainedMagnetization[index]! - retainedMean;
    retainedVariance += centered * centered;
    if (index > 0) {
      lagOneCovariance += centered * (retainedMagnetization[index - 1]! - retainedMean);
    }
  }
  const lagOneAutocorrelation =
    retainedVariance <= Number.EPSILON ? 0 : lagOneCovariance / retainedVariance;

  return {
    times: Float64Array.from(times),
    frames,
    summaries: [
      summarySeries('magnetization', 'Magnetization per spin', 'spin', magnetization),
      summarySeries('energy', 'Energy per spin', 'J', energy),
      summarySeries('acceptance', 'Cumulative acceptance fraction', '1', acceptanceFraction),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'H=-J sum_<ij> s_i s_j-h sum_i s_i; P(accept s_i -> -s_i)=min(1, exp(-DeltaE/T))',
      method: 'seeded two-colour checkerboard Metropolis updates',
      dynamics: 'stochastic',
      reproducibility: 'seeded-replay',
      boundary: 'periodic-x-y',
      grid: { width, height, dx, dy },
      temporal: { stepSize: 1, steps: sweeps, unit: 'sweep' },
      parameters: {
        temperature,
        coupling,
        field,
        seed,
        prng: 'mulberry32-v1',
        initialState,
        burnInSweeps: Math.floor(sweeps / 2),
      },
    },
    evidence: [
      {
        id: 'spin-domain',
        category: 'constraint',
        status: 'passed',
        value: spins.every((spin) => spin === -1 || spin === 1) ? 1 : 0,
        unit: 'boolean',
        tolerance: 1,
        description: 'Every lattice state remains in the declared {-1,+1} state space.',
      },
      {
        id: 'accepted-flips',
        category: 'diagnostic',
        status: 'observed',
        value: accepted,
        unit: 'flips',
        description: 'Accepted Metropolis spin flips over the complete run.',
      },
      {
        id: 'burn-in-sweeps',
        category: 'diagnostic',
        status: 'observed',
        value: Math.floor(sweeps / 2),
        unit: 'sweeps',
        description:
          'The first half of the captured sweep window is excluded from the reported autocorrelation diagnostic.',
      },
      {
        id: 'post-burn-in-lag-one-autocorrelation',
        category: 'diagnostic',
        status: 'observed',
        value: lagOneAutocorrelation,
        unit: 'correlation',
        description:
          'Lag-one magnetization autocorrelation over retained captures; zero denotes a degenerate zero-variance retained sequence and does not imply independence.',
      },
    ],
  };
}

interface ShallowWaterState {
  surfaceHeight: Float64Array;
  u: Float64Array;
  v: Float64Array;
}

function shallowWaterDerivatives(
  state: ShallowWaterState,
  output: ShallowWaterState,
  width: number,
  height: number,
  dx: number,
  dy: number,
  gravity: number,
  meanDepth: number,
  coriolis: number,
) {
  for (let y = 0; y < height; y += 1) {
    const up = y === 0 ? height - 1 : y - 1;
    const down = y === height - 1 ? 0 : y + 1;
    for (let x = 0; x < width; x += 1) {
      const left = x === 0 ? width - 1 : x - 1;
      const right = x === width - 1 ? 0 : x + 1;
      const index = y * width + x;
      const divergence =
        (state.u[y * width + right]! - state.u[y * width + left]!) / (2 * dx) +
        (state.v[down * width + x]! - state.v[up * width + x]!) / (2 * dy);
      const surfaceGradientX =
        (state.surfaceHeight[y * width + right]! - state.surfaceHeight[y * width + left]!) /
        (2 * dx);
      const surfaceGradientY =
        (state.surfaceHeight[down * width + x]! - state.surfaceHeight[up * width + x]!) / (2 * dy);
      output.surfaceHeight[index] = -meanDepth * divergence;
      output.u[index] = -gravity * surfaceGradientX + coriolis * state.v[index]!;
      output.v[index] = -gravity * surfaceGradientY - coriolis * state.u[index]!;
    }
  }
}

function combineShallowWaterStage(
  base: ShallowWaterState,
  derivative: ShallowWaterState,
  factor: number,
  output: ShallowWaterState,
) {
  for (let index = 0; index < base.surfaceHeight.length; index += 1) {
    output.surfaceHeight[index] =
      base.surfaceHeight[index]! + factor * derivative.surfaceHeight[index]!;
    output.u[index] = base.u[index]! + factor * derivative.u[index]!;
    output.v[index] = base.v[index]! + factor * derivative.v[index]!;
  }
}

function shallowWaterEnergy(
  state: ShallowWaterState,
  gravity: number,
  meanDepth: number,
  cellArea: number,
): number {
  let energy = 0;
  for (let index = 0; index < state.surfaceHeight.length; index += 1) {
    const surfaceHeight = state.surfaceHeight[index]!;
    const u = state.u[index]!;
    const v = state.v[index]!;
    energy += 0.5 * (gravity * surfaceHeight * surfaceHeight + meanDepth * (u * u + v * v));
  }
  return energy * cellArea;
}

function createShallowWaterState(count: number): ShallowWaterState {
  return {
    surfaceHeight: new Float64Array(count),
    u: new Float64Array(count),
    v: new Float64Array(count),
  };
}

export function simulateLinearRotatingShallowWater(
  options: ShallowWaterOptions = {},
): FieldSolverResult {
  const solverId = 'linear-rotating-shallow-water';
  const width = integerInput(solverId, 'width', options.width ?? 32, 8);
  const height = integerInput(solverId, 'height', options.height ?? 32, 8);
  const dx = positiveInput(solverId, 'dx', options.dx ?? 1);
  const dy = positiveInput(solverId, 'dy', options.dy ?? 1);
  const gravity = positiveInput(solverId, 'gravity', options.gravity ?? 1);
  const meanDepth = positiveInput(solverId, 'meanDepth', options.meanDepth ?? 1);
  const coriolis = finiteInput(solverId, 'coriolis', options.coriolis ?? 0.1);
  const dt = positiveInput(solverId, 'dt', options.dt ?? 0.1);
  const steps = integerInput(solverId, 'steps', options.steps ?? 400, 1);
  enforceWorkBudget(solverId, width, height, steps, 2_000_000);
  const captures = snapshotSteps(solverId, steps, options.snapshotCount ?? DEFAULT_SNAPSHOT_COUNT);
  const waveSpeed = Math.sqrt(gravity * meanDepth);
  const spectralCfl = dt * (waveSpeed * Math.hypot(1 / dx, 1 / dy) + Math.abs(coriolis));
  const stabilityLimit = 1.5;
  if (spectralCfl > stabilityLimit) {
    throw new FieldSolverError(
      'stability-limit',
      solverId,
      `RK4 wave/Coriolis stability number ${spectralCfl} exceeds ${stabilityLimit}`,
    );
  }
  const initial =
    options.initialCondition ??
    ({
      kind: 'cosine-height',
      amplitude: 0.05,
      modeX: 1,
      modeY: 1,
    } satisfies ShallowWaterInitialCondition);
  const count = width * height;
  let state = createShallowWaterState(count);
  if (initial.kind === 'uniform-flow') {
    const surfaceHeight = finiteInput(
      solverId,
      'initialCondition.surfaceHeight',
      initial.surfaceHeight,
    );
    const u = finiteInput(solverId, 'initialCondition.u', initial.u);
    const v = finiteInput(solverId, 'initialCondition.v', initial.v);
    state.surfaceHeight.fill(surfaceHeight);
    state.u.fill(u);
    state.v.fill(v);
  } else {
    const amplitude = finiteInput(solverId, 'initialCondition.amplitude', initial.amplitude);
    const modeX = integerInput(solverId, 'initialCondition.modeX', initial.modeX, 0);
    const modeY = integerInput(solverId, 'initialCondition.modeY', initial.modeY, 0);
    if (modeX >= width / 2 || modeY >= height / 2 || (modeX === 0 && modeY === 0)) {
      throw new FieldSolverError(
        'invalid-input',
        solverId,
        'initial cosine modes must be nonzero and below the grid Nyquist frequency',
      );
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        state.surfaceHeight[y * width + x] =
          amplitude *
          Math.cos((2 * Math.PI * modeX * x) / width) *
          Math.cos((2 * Math.PI * modeY * y) / height);
      }
    }
  }

  const k1 = createShallowWaterState(count);
  const k2 = createShallowWaterState(count);
  const k3 = createShallowWaterState(count);
  const k4 = createShallowWaterState(count);
  const stage = createShallowWaterState(count);
  let next = createShallowWaterState(count);
  const cellArea = dx * dy;
  const initialMass = arraySum(state.surfaceHeight) * cellArea;
  const allowedMassResidual = massTolerance(initialMass);
  const initialEnergy = shallowWaterEnergy(state, gravity, meanDepth, cellArea);
  let maximumMassResidual = 0;
  let maximumRelativeEnergyDrift = 0;
  const times: number[] = [];
  const frames: FieldSolverFrame[] = [];
  const meanSurfaceHeight: number[] = [];
  const rmsSurfaceHeight: number[] = [];
  const energy: number[] = [];

  const capture = (step: number) => {
    const mean = arrayMean(state.surfaceHeight);
    const currentEnergy = shallowWaterEnergy(state, gravity, meanDepth, cellArea);
    times.push(step * dt);
    frames.push({
      time: step * dt,
      components: {
        'surface-height': state.surfaceHeight.slice(),
        u: state.u.slice(),
        v: state.v.slice(),
      },
    });
    meanSurfaceHeight.push(mean);
    rmsSurfaceHeight.push(Math.sqrt(arrayVariance(state.surfaceHeight, 0)));
    energy.push(currentEnergy);
  };

  capture(0);
  for (let step = 1; step <= steps; step += 1) {
    shallowWaterDerivatives(state, k1, width, height, dx, dy, gravity, meanDepth, coriolis);
    combineShallowWaterStage(state, k1, dt / 2, stage);
    shallowWaterDerivatives(stage, k2, width, height, dx, dy, gravity, meanDepth, coriolis);
    combineShallowWaterStage(state, k2, dt / 2, stage);
    shallowWaterDerivatives(stage, k3, width, height, dx, dy, gravity, meanDepth, coriolis);
    combineShallowWaterStage(state, k3, dt, stage);
    shallowWaterDerivatives(stage, k4, width, height, dx, dy, gravity, meanDepth, coriolis);
    for (let index = 0; index < count; index += 1) {
      next.surfaceHeight[index] =
        state.surfaceHeight[index]! +
        (dt / 6) *
          (k1.surfaceHeight[index]! +
            2 * k2.surfaceHeight[index]! +
            2 * k3.surfaceHeight[index]! +
            k4.surfaceHeight[index]!);
      next.u[index] =
        state.u[index]! +
        (dt / 6) * (k1.u[index]! + 2 * k2.u[index]! + 2 * k3.u[index]! + k4.u[index]!);
      next.v[index] =
        state.v[index]! +
        (dt / 6) * (k1.v[index]! + 2 * k2.v[index]! + 2 * k3.v[index]! + k4.v[index]!);
    }
    ensureFiniteArray(solverId, next.surfaceHeight, 'surfaceHeight', step);
    ensureFiniteArray(solverId, next.u, 'u', step);
    ensureFiniteArray(solverId, next.v, 'v', step);
    const mass = arraySum(next.surfaceHeight) * cellArea;
    const massResidual = Math.abs(mass - initialMass);
    maximumMassResidual = Math.max(maximumMassResidual, massResidual);
    if (massResidual > allowedMassResidual) {
      throw new FieldSolverError(
        'constraint-violation',
        solverId,
        `linear shallow-water mass residual ${massResidual} exceeds ${allowedMassResidual}`,
        step,
      );
    }
    const currentEnergy = shallowWaterEnergy(next, gravity, meanDepth, cellArea);
    const relativeEnergyDrift =
      initialEnergy === 0
        ? Math.abs(currentEnergy - initialEnergy)
        : Math.abs((currentEnergy - initialEnergy) / initialEnergy);
    maximumRelativeEnergyDrift = Math.max(maximumRelativeEnergyDrift, relativeEnergyDrift);
    [state, next] = [next, state];
    if (captures.has(step)) capture(step);
  }

  return {
    times: Float64Array.from(times),
    frames,
    summaries: [
      summarySeries(
        'mean-surface-height',
        'Mean surface-height anomaly',
        'length',
        meanSurfaceHeight,
      ),
      summarySeries('rms-surface-height', 'RMS surface-height anomaly', 'length', rmsSurfaceHeight),
      summarySeries('linear-energy', 'Linear wave energy', 'energy', energy),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'eta_t=-H div(u); u_t=-g eta_x+fv; v_t=-g eta_y-fu',
      method: 'classical RK4 with centred periodic finite differences',
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      boundary: 'periodic-x-y',
      grid: { width, height, dx, dy },
      temporal: { stepSize: dt, steps, unit: 'dimensionless-time' },
      parameters: { gravity, meanDepth, coriolis, initialCondition: JSON.stringify(initial) },
    },
    evidence: [
      {
        id: 'wave-cfl',
        category: 'stability',
        status: 'passed',
        value: spectralCfl,
        unit: '1',
        tolerance: stabilityLimit,
        description: 'Conservative RK4 spectral bound for gravity waves plus Coriolis rotation.',
      },
      {
        id: 'mass-residual',
        category: 'invariant',
        status: 'passed',
        value: maximumMassResidual,
        unit: 'height × area',
        tolerance: allowedMassResidual,
        description: 'Maximum drift of the periodic-domain integral of surface-height anomaly.',
      },
      {
        id: 'relative-energy-drift',
        category: 'diagnostic',
        status: 'observed',
        value: maximumRelativeEnergyDrift,
        unit: '1',
        description: 'Maximum relative drift of the discrete linear wave energy.',
      },
    ],
  };
}
