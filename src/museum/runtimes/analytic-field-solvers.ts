export type AnalyticFieldSolverId =
  | 'fixed-boundary-wave'
  | 'periodic-fourier-heat'
  | 'free-gaussian-schrodinger'
  | 'budyko-sellers-ebm';

export interface AnalyticFieldFrame {
  time: number;
  /** Scientific values in their declared units; render normalization is deliberately absent. */
  components: Readonly<Record<string, Float64Array>>;
}

export interface AnalyticFieldSummary {
  id: string;
  label: string;
  unit: string;
  values: Float64Array;
}

export interface AnalyticFieldEvidence {
  id: string;
  category: 'finite' | 'refinement' | 'conservation' | 'equilibrium' | 'boundary' | 'diagnostic';
  status: 'passed' | 'observed';
  value: number;
  unit: string;
  tolerance?: number;
  description: string;
  details?: Readonly<Record<string, number | string>>;
}

export interface AnalyticFieldMetadata {
  solverId: AnalyticFieldSolverId;
  version: 1;
  equation: string;
  method: string;
  representation: 'closed-form-solution' | 'governing-law-relaxation';
  dynamics: 'deterministic';
  reproducibility: 'bitwise-deterministic';
  boundary:
    | 'fixed-dirichlet-x-y'
    | 'periodic-x-y'
    | 'open-domain-truncated-for-display'
    | 'no-flux-in-sin-latitude';
  grid: {
    width: number;
    height: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    dx: number;
    dy: number;
    endpointConvention: string;
  };
  temporal: {
    duration: number;
    snapshotCount: number;
    unit: 'dimensionless-time' | 'year';
    stepSize?: number;
    steps?: number;
  };
  componentUnits: Readonly<Record<string, string>>;
  parameters: Readonly<Record<string, number | string>>;
  provenance: {
    lawRef: string;
    sourceTitle: string;
    sourceUrl: string;
    scope: string;
  };
}

export interface AnalyticFieldSolverResult {
  times: Float64Array;
  coordinates: { x: Float64Array; y: Float64Array };
  frames: AnalyticFieldFrame[];
  summaries: AnalyticFieldSummary[];
  metadata: AnalyticFieldMetadata;
  evidence: AnalyticFieldEvidence[];
}

export type AnalyticFieldSolverErrorKind = 'invalid-input' | 'budget' | 'non-finite';

export class AnalyticFieldSolverError extends Error {
  readonly kind: AnalyticFieldSolverErrorKind;
  readonly solverId: AnalyticFieldSolverId;

  constructor(
    kind: AnalyticFieldSolverErrorKind,
    solverId: AnalyticFieldSolverId,
    message: string,
  ) {
    super(message);
    this.name = 'AnalyticFieldSolverError';
    this.kind = kind;
    this.solverId = solverId;
  }
}

const MAX_SNAPSHOTS = 32;
const MAX_GRID_CELLS = 128 * 128;
const MAX_STORED_VALUES = 750_000;
const MAX_EBM_CELL_STEPS = 2_000_000;

function finiteInput(solverId: AnalyticFieldSolverId, name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new AnalyticFieldSolverError('invalid-input', solverId, `${name} must be finite`);
  }
  return value;
}

function positiveInput(solverId: AnalyticFieldSolverId, name: string, value: number): number {
  finiteInput(solverId, name, value);
  if (value <= 0) {
    throw new AnalyticFieldSolverError('invalid-input', solverId, `${name} must be positive`);
  }
  return value;
}

function integerInput(
  solverId: AnalyticFieldSolverId,
  name: string,
  value: number,
  minimum: number,
): number {
  finiteInput(solverId, name, value);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new AnalyticFieldSolverError(
      'invalid-input',
      solverId,
      `${name} must be an integer greater than or equal to ${minimum}`,
    );
  }
  return value;
}

function snapshotTimes(
  solverId: AnalyticFieldSolverId,
  duration: number,
  snapshotCount: number,
): Float64Array {
  const count = integerInput(solverId, 'snapshotCount', snapshotCount, 2);
  if (count > MAX_SNAPSHOTS) {
    throw new AnalyticFieldSolverError(
      'budget',
      solverId,
      `snapshotCount exceeds the browser budget of ${MAX_SNAPSHOTS}`,
    );
  }
  return Float64Array.from({ length: count }, (_, index) => (duration * index) / (count - 1));
}

function enforceStoredValueBudget(
  solverId: AnalyticFieldSolverId,
  width: number,
  height: number,
  snapshots: number,
  componentCount: number,
): void {
  const cells = width * height;
  if (cells > MAX_GRID_CELLS) {
    throw new AnalyticFieldSolverError(
      'budget',
      solverId,
      `grid has ${cells} cells; the browser budget is ${MAX_GRID_CELLS}`,
    );
  }
  const storedValues = cells * snapshots * componentCount;
  if (storedValues > MAX_STORED_VALUES) {
    throw new AnalyticFieldSolverError(
      'budget',
      solverId,
      `run stores ${storedValues} values; the browser budget is ${MAX_STORED_VALUES}`,
    );
  }
}

function closedCoordinates(minimum: number, maximum: number, count: number): Float64Array {
  const step = (maximum - minimum) / (count - 1);
  return Float64Array.from({ length: count }, (_, index) => minimum + index * step);
}

function periodicCoordinates(minimum: number, maximum: number, count: number): Float64Array {
  const step = (maximum - minimum) / count;
  return Float64Array.from({ length: count }, (_, index) => minimum + index * step);
}

function ensureFinite(
  solverId: AnalyticFieldSolverId,
  values: ArrayLike<number>,
  context: string,
): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new AnalyticFieldSolverError(
        'non-finite',
        solverId,
        `${context}[${index}] is non-finite`,
      );
    }
  }
}

function mean(values: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index];
  return total / values.length;
}

function variance(values: ArrayLike<number>, center: number): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const difference = values[index] - center;
    total += difference * difference;
  }
  return total / values.length;
}

function summary(id: string, label: string, unit: string, values: number[]): AnalyticFieldSummary {
  return { id, label, unit, values: Float64Array.from(values) };
}

export interface FixedBoundaryWaveOptions {
  width?: number;
  height?: number;
  lengthX?: number;
  lengthY?: number;
  speed?: number;
  amplitude?: number;
  modeX?: number;
  modeY?: number;
  duration?: number;
  snapshotCount?: number;
}

interface WaveParameters {
  lengthX: number;
  lengthY: number;
  speed: number;
  amplitude: number;
  modeX: number;
  modeY: number;
  angularFrequency: number;
}

function wavePdeResidual(width: number, height: number, parameters: WaveParameters): number {
  const dx = parameters.lengthX / (width - 1);
  const dy = parameters.lengthY / (height - 1);
  let maximum = 0;
  for (let yIndex = 1; yIndex < height - 1; yIndex += 1) {
    const y = yIndex * dy;
    for (let xIndex = 1; xIndex < width - 1; xIndex += 1) {
      const x = xIndex * dx;
      const evaluate = (sampleX: number, sampleY: number) =>
        parameters.amplitude *
        Math.sin((parameters.modeX * Math.PI * sampleX) / parameters.lengthX) *
        Math.sin((parameters.modeY * Math.PI * sampleY) / parameters.lengthY);
      const value = evaluate(x, y);
      const laplacian =
        (evaluate(x + dx, y) - 2 * value + evaluate(x - dx, y)) / (dx * dx) +
        (evaluate(x, y + dy) - 2 * value + evaluate(x, y - dy)) / (dy * dy);
      maximum = Math.max(
        maximum,
        Math.abs(-(parameters.angularFrequency ** 2) * value - parameters.speed ** 2 * laplacian),
      );
    }
  }
  return maximum;
}

export function simulateFixedBoundaryWave(
  options: FixedBoundaryWaveOptions = {},
): AnalyticFieldSolverResult {
  const solverId = 'fixed-boundary-wave';
  const width = integerInput(solverId, 'width', options.width ?? 49, 17);
  const height = integerInput(solverId, 'height', options.height ?? 33, 17);
  const lengthX = positiveInput(solverId, 'lengthX', options.lengthX ?? 1);
  const lengthY = positiveInput(solverId, 'lengthY', options.lengthY ?? 1);
  const speed = positiveInput(solverId, 'speed', options.speed ?? 1);
  const amplitude = finiteInput(solverId, 'amplitude', options.amplitude ?? 1);
  const modeX = integerInput(solverId, 'modeX', options.modeX ?? 2, 1);
  const modeY = integerInput(solverId, 'modeY', options.modeY ?? 1, 1);
  const duration = positiveInput(solverId, 'duration', options.duration ?? 4);
  const times = snapshotTimes(solverId, duration, options.snapshotCount ?? 9);
  enforceStoredValueBudget(solverId, width, height, times.length, 2);
  const coarseWidth = Math.floor((width - 1) / 2) + 1;
  const coarseHeight = Math.floor((height - 1) / 2) + 1;
  if (modeX >= (coarseWidth - 1) / 2 || modeY >= (coarseHeight - 1) / 2) {
    throw new AnalyticFieldSolverError(
      'invalid-input',
      solverId,
      'modes must remain below the Nyquist frequency on the refinement grid',
    );
  }

  const angularFrequency = speed * Math.PI * Math.hypot(modeX / lengthX, modeY / lengthY);
  const parameters: WaveParameters = {
    lengthX,
    lengthY,
    speed,
    amplitude,
    modeX,
    modeY,
    angularFrequency,
  };
  const xCoordinates = closedCoordinates(0, lengthX, width);
  const yCoordinates = closedCoordinates(0, lengthY, height);
  const frames: AnalyticFieldFrame[] = [];
  const rmsDisplacement: number[] = [];
  const kineticEnergy: number[] = [];
  const strainEnergy: number[] = [];
  const totalEnergy: number[] = [];
  let maximumBoundaryResidual = 0;

  for (const time of times) {
    const displacement = new Float64Array(width * height);
    const velocity = new Float64Array(width * height);
    const timeCosine = Math.cos(angularFrequency * time);
    const timeSine = Math.sin(angularFrequency * time);
    for (let yIndex = 0; yIndex < height; yIndex += 1) {
      const spatialY = Math.sin((modeY * Math.PI * yCoordinates[yIndex]) / lengthY);
      for (let xIndex = 0; xIndex < width; xIndex += 1) {
        const spatialX = Math.sin((modeX * Math.PI * xCoordinates[xIndex]) / lengthX);
        const index = yIndex * width + xIndex;
        const shape = amplitude * spatialX * spatialY;
        displacement[index] = shape * timeCosine;
        velocity[index] = -angularFrequency * shape * timeSine;
        if (xIndex === 0 || xIndex === width - 1 || yIndex === 0 || yIndex === height - 1) {
          maximumBoundaryResidual = Math.max(
            maximumBoundaryResidual,
            Math.abs(displacement[index]),
            Math.abs(velocity[index]),
          );
        }
      }
    }
    ensureFinite(solverId, displacement, `displacement at t=${time}`);
    ensureFinite(solverId, velocity, `velocity at t=${time}`);
    frames.push({ time, components: { displacement, velocity } });
    rmsDisplacement.push(Math.sqrt(variance(displacement, 0)));
    const energyScale = (amplitude ** 2 * angularFrequency ** 2 * lengthX * lengthY) / 8;
    const kinetic = energyScale * timeSine ** 2;
    const strain = energyScale * timeCosine ** 2;
    kineticEnergy.push(kinetic);
    strainEnergy.push(strain);
    totalEnergy.push(kinetic + strain);
  }

  const referenceEnergy = totalEnergy[0];
  let maximumEnergyResidual = 0;
  for (const energy of totalEnergy) {
    maximumEnergyResidual = Math.max(maximumEnergyResidual, Math.abs(energy - referenceEnergy));
  }
  const coarseResidual = wavePdeResidual(coarseWidth, coarseHeight, parameters);
  const fineResidual = wavePdeResidual(width, height, parameters);
  const energyTolerance = Number.EPSILON * Math.max(1, Math.abs(referenceEnergy)) * 8;
  const boundaryTolerance = 1e-12 * Math.max(1, Math.abs(amplitude * angularFrequency));

  return {
    times,
    coordinates: { x: xCoordinates, y: yCoordinates },
    frames,
    summaries: [
      summary('rms-displacement', 'RMS displacement', 'displacement', rmsDisplacement),
      summary('kinetic-energy', 'Kinetic energy', 'energy', kineticEnergy),
      summary('strain-energy', 'Strain energy', 'energy', strainEnergy),
      summary('total-energy', 'Total wave energy', 'energy', totalEnergy),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'u_tt = c^2 (u_xx + u_yy)',
      method: 'exact single standing-mode evaluation on a rectangular sampling grid',
      representation: 'closed-form-solution',
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      boundary: 'fixed-dirichlet-x-y',
      grid: {
        width,
        height,
        xMin: 0,
        xMax: lengthX,
        yMin: 0,
        yMax: lengthY,
        dx: lengthX / (width - 1),
        dy: lengthY / (height - 1),
        endpointConvention: 'both fixed boundaries are sampled',
      },
      temporal: { duration, snapshotCount: times.length, unit: 'dimensionless-time' },
      componentUnits: { displacement: 'displacement', velocity: 'displacement/time' },
      parameters: { speed, amplitude, modeX, modeY, angularFrequency },
      provenance: {
        lawRef: 'wave-equation-modes-v1',
        sourceTitle: "d'Alembert, Recherches sur la courbe que forme une corde tendue",
        sourceUrl:
          'https://epiphymaths.univ-fcomte.fr/1t1m/d_alembert-recherches_sur_la_courbe_que_forme_une_corde_tendue_mise_en_vibration-1747.pdf',
        scope: 'One exact rectangular Dirichlet eigenmode; not a general wave-equation solver.',
      },
    },
    evidence: [
      {
        id: 'finite-components',
        category: 'finite',
        status: 'passed',
        value: 0,
        unit: 'non-finite values',
        tolerance: 0,
        description: 'Every raw displacement and velocity sample was checked before return.',
      },
      {
        id: 'grid-refinement-pde-residual',
        category: 'refinement',
        status: fineResidual <= coarseResidual + Number.EPSILON ? 'passed' : 'observed',
        value: fineResidual,
        unit: 'displacement/time^2',
        tolerance: coarseResidual,
        description:
          'Centred-difference PDE residual on the output grid versus a half-resolution grid.',
        details: { coarseResidual, coarseWidth, coarseHeight },
      },
      {
        id: 'energy-residual',
        category: 'conservation',
        status: maximumEnergyResidual <= energyTolerance ? 'passed' : 'observed',
        value: maximumEnergyResidual,
        unit: 'energy',
        tolerance: energyTolerance,
        description: 'Maximum drift of the exact continuum kinetic-plus-strain energy.',
      },
      {
        id: 'fixed-boundary-residual',
        category: 'boundary',
        status: maximumBoundaryResidual <= boundaryTolerance ? 'passed' : 'observed',
        value: maximumBoundaryResidual,
        unit: 'field magnitude',
        tolerance: boundaryTolerance,
        description: 'Maximum displacement or velocity magnitude on the four fixed boundaries.',
      },
    ],
  };
}

export interface HeatFourierMode {
  amplitude: number;
  waveNumberX: number;
  waveNumberY: number;
  phase?: number;
}

export interface PeriodicHeatOptions {
  width?: number;
  height?: number;
  lengthX?: number;
  lengthY?: number;
  diffusivity?: number;
  meanTemperature?: number;
  modes?: HeatFourierMode[];
  duration?: number;
  snapshotCount?: number;
}

interface ValidHeatMode {
  amplitude: number;
  waveNumberX: number;
  waveNumberY: number;
  phase: number;
  eigenvalue: number;
}

function heatValue(
  modes: ValidHeatMode[],
  meanTemperature: number,
  x: number,
  y: number,
  t: number,
) {
  let value = meanTemperature;
  for (const mode of modes) {
    value +=
      mode.amplitude *
      Math.cos(mode.waveNumberX * x + mode.waveNumberY * y + mode.phase) *
      Math.exp(-mode.eigenvalue * t);
  }
  return value;
}

function heatPdeResidual(
  width: number,
  height: number,
  lengthX: number,
  lengthY: number,
  diffusivity: number,
  meanTemperature: number,
  modes: ValidHeatMode[],
): number {
  const dx = lengthX / width;
  const dy = lengthY / height;
  let maximum = 0;
  for (let yIndex = 0; yIndex < height; yIndex += 1) {
    const y = yIndex * dy;
    const upY = ((yIndex - 1 + height) % height) * dy;
    const downY = ((yIndex + 1) % height) * dy;
    for (let xIndex = 0; xIndex < width; xIndex += 1) {
      const x = xIndex * dx;
      const leftX = ((xIndex - 1 + width) % width) * dx;
      const rightX = ((xIndex + 1) % width) * dx;
      const value = heatValue(modes, meanTemperature, x, y, 0);
      const laplacian =
        (heatValue(modes, meanTemperature, rightX, y, 0) -
          2 * value +
          heatValue(modes, meanTemperature, leftX, y, 0)) /
          (dx * dx) +
        (heatValue(modes, meanTemperature, x, downY, 0) -
          2 * value +
          heatValue(modes, meanTemperature, x, upY, 0)) /
          (dy * dy);
      let exactDerivative = 0;
      for (const mode of modes) {
        exactDerivative -=
          mode.eigenvalue *
          mode.amplitude *
          Math.cos(mode.waveNumberX * x + mode.waveNumberY * y + mode.phase);
      }
      maximum = Math.max(maximum, Math.abs(exactDerivative - diffusivity * laplacian));
    }
  }
  return maximum;
}

export function simulatePeriodicHeat(options: PeriodicHeatOptions = {}): AnalyticFieldSolverResult {
  const solverId = 'periodic-fourier-heat';
  const width = integerInput(solverId, 'width', options.width ?? 48, 16);
  const height = integerInput(solverId, 'height', options.height ?? 32, 16);
  const lengthX = positiveInput(solverId, 'lengthX', options.lengthX ?? 2 * Math.PI);
  const lengthY = positiveInput(solverId, 'lengthY', options.lengthY ?? 2 * Math.PI);
  const diffusivity = positiveInput(solverId, 'diffusivity', options.diffusivity ?? 0.25);
  const meanTemperature = finiteInput(solverId, 'meanTemperature', options.meanTemperature ?? 0.25);
  const duration = positiveInput(solverId, 'duration', options.duration ?? 6);
  const times = snapshotTimes(solverId, duration, options.snapshotCount ?? 9);
  enforceStoredValueBudget(solverId, width, height, times.length, 1);
  const requestedModes =
    options.modes ??
    ([
      { amplitude: 1, waveNumberX: 1, waveNumberY: 0, phase: 0 },
      { amplitude: 0.45, waveNumberX: 2, waveNumberY: 1, phase: 0.7 },
    ] satisfies HeatFourierMode[]);
  if (requestedModes.length === 0 || requestedModes.length > 16) {
    throw new AnalyticFieldSolverError(
      'invalid-input',
      solverId,
      'modes must contain between one and sixteen Fourier modes',
    );
  }
  const coarseWidth = Math.floor(width / 2);
  const coarseHeight = Math.floor(height / 2);
  const modes: ValidHeatMode[] = requestedModes.map((mode, index) => {
    const amplitude = finiteInput(solverId, `modes[${index}].amplitude`, mode.amplitude);
    const waveNumberX = integerInput(solverId, `modes[${index}].waveNumberX`, mode.waveNumberX, 0);
    const waveNumberY = integerInput(solverId, `modes[${index}].waveNumberY`, mode.waveNumberY, 0);
    if (waveNumberX === 0 && waveNumberY === 0) {
      throw new AnalyticFieldSolverError(
        'invalid-input',
        solverId,
        `modes[${index}] duplicates the separately declared mean mode`,
      );
    }
    if (waveNumberX >= coarseWidth / 2 || waveNumberY >= coarseHeight / 2) {
      throw new AnalyticFieldSolverError(
        'invalid-input',
        solverId,
        `modes[${index}] is not resolved on the refinement grid`,
      );
    }
    const phase = finiteInput(solverId, `modes[${index}].phase`, mode.phase ?? 0);
    const physicalX = (2 * Math.PI * waveNumberX) / lengthX;
    const physicalY = (2 * Math.PI * waveNumberY) / lengthY;
    return {
      amplitude,
      waveNumberX: physicalX,
      waveNumberY: physicalY,
      phase,
      eigenvalue: diffusivity * (physicalX ** 2 + physicalY ** 2),
    };
  });
  const xCoordinates = periodicCoordinates(0, lengthX, width);
  const yCoordinates = periodicCoordinates(0, lengthY, height);
  const frames: AnalyticFieldFrame[] = [];
  const means: number[] = [];
  const variances: number[] = [];

  for (const time of times) {
    const temperature = new Float64Array(width * height);
    for (let yIndex = 0; yIndex < height; yIndex += 1) {
      for (let xIndex = 0; xIndex < width; xIndex += 1) {
        temperature[yIndex * width + xIndex] = heatValue(
          modes,
          meanTemperature,
          xCoordinates[xIndex],
          yCoordinates[yIndex],
          time,
        );
      }
    }
    ensureFinite(solverId, temperature, `temperature at t=${time}`);
    frames.push({ time, components: { temperature } });
    const currentMean = mean(temperature);
    means.push(currentMean);
    variances.push(variance(temperature, currentMean));
  }
  let maximumMeanResidual = 0;
  let maximumVarianceIncrease = 0;
  for (let index = 0; index < times.length; index += 1) {
    maximumMeanResidual = Math.max(maximumMeanResidual, Math.abs(means[index] - meanTemperature));
    if (index > 0) {
      maximumVarianceIncrease = Math.max(
        maximumVarianceIncrease,
        variances[index] - variances[index - 1],
      );
    }
  }
  const coarseResidual = heatPdeResidual(
    coarseWidth,
    coarseHeight,
    lengthX,
    lengthY,
    diffusivity,
    meanTemperature,
    modes,
  );
  const fineResidual = heatPdeResidual(
    width,
    height,
    lengthX,
    lengthY,
    diffusivity,
    meanTemperature,
    modes,
  );
  const meanTolerance = 1e-12 * Math.max(1, Math.abs(meanTemperature));

  return {
    times,
    coordinates: { x: xCoordinates, y: yCoordinates },
    frames,
    summaries: [
      summary('mean-temperature', 'Periodic-domain mean temperature', 'temperature', means),
      summary('variance-temperature', 'Temperature variance', 'temperature^2', variances),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'u_t = kappa (u_xx + u_yy)',
      method: 'exact finite Fourier-series diffusion evaluated at requested times',
      representation: 'closed-form-solution',
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      boundary: 'periodic-x-y',
      grid: {
        width,
        height,
        xMin: 0,
        xMax: lengthX,
        yMin: 0,
        yMax: lengthY,
        dx: lengthX / width,
        dy: lengthY / height,
        endpointConvention: 'periodic upper endpoints are excluded',
      },
      temporal: { duration, snapshotCount: times.length, unit: 'dimensionless-time' },
      componentUnits: { temperature: 'temperature' },
      parameters: {
        diffusivity,
        meanTemperature,
        modeCount: modes.length,
        modes: JSON.stringify(requestedModes),
      },
      provenance: {
        lawRef: 'heat-equation-gaussian-v1',
        sourceTitle: 'Fourier, Theorie analytique de la chaleur',
        sourceUrl: 'https://gallica.bnf.fr/ark:/12148/bpt6k1045508v',
        scope: 'Exact evolution of a declared finite periodic Fourier family.',
      },
    },
    evidence: [
      {
        id: 'finite-components',
        category: 'finite',
        status: 'passed',
        value: 0,
        unit: 'non-finite values',
        tolerance: 0,
        description: 'Every raw temperature sample was checked before return.',
      },
      {
        id: 'grid-refinement-pde-residual',
        category: 'refinement',
        status: fineResidual <= coarseResidual + Number.EPSILON ? 'passed' : 'observed',
        value: fineResidual,
        unit: 'temperature/time',
        tolerance: coarseResidual,
        description: 'Periodic centred-difference PDE residual versus a half-resolution grid.',
        details: { coarseResidual, coarseWidth, coarseHeight },
      },
      {
        id: 'mean-temperature-residual',
        category: 'conservation',
        status: maximumMeanResidual <= meanTolerance ? 'passed' : 'observed',
        value: maximumMeanResidual,
        unit: 'temperature',
        tolerance: meanTolerance,
        description: 'Maximum drift of the conserved periodic-domain Fourier zero mode.',
      },
      {
        id: 'variance-increase',
        category: 'diagnostic',
        status: maximumVarianceIncrease <= meanTolerance ? 'passed' : 'observed',
        value: maximumVarianceIncrease,
        unit: 'temperature^2',
        tolerance: meanTolerance,
        description:
          'Largest sampled increase in variance; exact heat evolution should not increase it.',
      },
    ],
  };
}

export interface FreeGaussianSchrodingerOptions {
  width?: number;
  height?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  packetWidth?: number;
  centerX?: number;
  centerY?: number;
  momentumX?: number;
  momentumY?: number;
  duration?: number;
  snapshotCount?: number;
}

interface GaussianParameters {
  packetWidth: number;
  centerX: number;
  centerY: number;
  momentumX: number;
  momentumY: number;
}

function gaussianComponents(x: number, y: number, time: number, parameters: GaussianParameters) {
  const sigma = parameters.packetWidth;
  const tau = time / (sigma * sigma);
  const spreadSquared = sigma * sigma * (1 + tau * tau);
  const movingCenterX = parameters.centerX + parameters.momentumX * time;
  const movingCenterY = parameters.centerY + parameters.momentumY * time;
  const relativeX = x - movingCenterX;
  const relativeY = y - movingCenterY;
  const radiusSquared = relativeX * relativeX + relativeY * relativeY;
  const magnitude =
    Math.exp(-radiusSquared / (2 * spreadSquared)) /
    (Math.sqrt(Math.PI) * sigma * Math.sqrt(1 + tau * tau));
  const phase =
    -Math.atan(tau) +
    (radiusSquared * tau) / (2 * sigma * sigma * (1 + tau * tau)) +
    parameters.momentumX * (x - parameters.centerX) +
    parameters.momentumY * (y - parameters.centerY) -
    0.5 *
      (parameters.momentumX * parameters.momentumX + parameters.momentumY * parameters.momentumY) *
      time;
  const real = magnitude * Math.cos(phase);
  const imaginary = magnitude * Math.sin(phase);
  return { real, imaginary, density: magnitude * magnitude, spread: Math.sqrt(spreadSquared) };
}

// Abramowitz and Stegun 7.1.26; the approximation error is below 1.5e-7.
function erfApproximation(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

function exactTruncatedGaussianNorm(
  time: number,
  parameters: GaussianParameters,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): number {
  const spread = gaussianComponents(
    parameters.centerX,
    parameters.centerY,
    time,
    parameters,
  ).spread;
  const centerX = parameters.centerX + parameters.momentumX * time;
  const centerY = parameters.centerY + parameters.momentumY * time;
  const xProbability =
    0.5 *
    (erfApproximation((xMax - centerX) / spread) - erfApproximation((xMin - centerX) / spread));
  const yProbability =
    0.5 *
    (erfApproximation((yMax - centerY) / spread) - erfApproximation((yMin - centerY) / spread));
  return xProbability * yProbability;
}

function closedGridMoments(
  density: Float64Array,
  xCoordinates: Float64Array,
  yCoordinates: Float64Array,
) {
  const width = xCoordinates.length;
  const height = yCoordinates.length;
  const dx = xCoordinates[1] - xCoordinates[0];
  const dy = yCoordinates[1] - yCoordinates[0];
  let norm = 0;
  let firstX = 0;
  let radialSecondMoment = 0;
  for (let yIndex = 0; yIndex < height; yIndex += 1) {
    const yWeight = yIndex === 0 || yIndex === height - 1 ? 0.5 : 1;
    for (let xIndex = 0; xIndex < width; xIndex += 1) {
      const xWeight = xIndex === 0 || xIndex === width - 1 ? 0.5 : 1;
      const weight = xWeight * yWeight * dx * dy;
      const value = density[yIndex * width + xIndex];
      norm += value * weight;
      firstX += value * xCoordinates[xIndex] * weight;
      radialSecondMoment +=
        value *
        (xCoordinates[xIndex] * xCoordinates[xIndex] +
          yCoordinates[yIndex] * yCoordinates[yIndex]) *
        weight;
    }
  }
  return {
    norm,
    meanX: firstX / norm,
    rmsRadius: Math.sqrt(radialSecondMoment / norm),
  };
}

function gaussianInterpolationError(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  time: number,
  parameters: GaussianParameters,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): number {
  const sourceX = closedCoordinates(xMin, xMax, sourceWidth);
  const sourceY = closedCoordinates(yMin, yMax, sourceHeight);
  const source = new Float64Array(sourceWidth * sourceHeight);
  for (let yIndex = 0; yIndex < sourceHeight; yIndex += 1) {
    for (let xIndex = 0; xIndex < sourceWidth; xIndex += 1) {
      source[yIndex * sourceWidth + xIndex] = gaussianComponents(
        sourceX[xIndex],
        sourceY[yIndex],
        time,
        parameters,
      ).density;
    }
  }
  const targetX = closedCoordinates(xMin, xMax, targetWidth);
  const targetY = closedCoordinates(yMin, yMax, targetHeight);
  const sourceDx = (xMax - xMin) / (sourceWidth - 1);
  const sourceDy = (yMax - yMin) / (sourceHeight - 1);
  let squaredError = 0;
  for (let yIndex = 0; yIndex < targetHeight; yIndex += 1) {
    const sourceYPosition = (targetY[yIndex] - yMin) / sourceDy;
    const lowerY = Math.min(sourceHeight - 2, Math.floor(sourceYPosition));
    const fractionY = sourceYPosition - lowerY;
    for (let xIndex = 0; xIndex < targetWidth; xIndex += 1) {
      const sourceXPosition = (targetX[xIndex] - xMin) / sourceDx;
      const lowerX = Math.min(sourceWidth - 2, Math.floor(sourceXPosition));
      const fractionX = sourceXPosition - lowerX;
      const lowerLeft = source[lowerY * sourceWidth + lowerX];
      const lowerRight = source[lowerY * sourceWidth + lowerX + 1];
      const upperLeft = source[(lowerY + 1) * sourceWidth + lowerX];
      const upperRight = source[(lowerY + 1) * sourceWidth + lowerX + 1];
      const lower = lowerLeft * (1 - fractionX) + lowerRight * fractionX;
      const upper = upperLeft * (1 - fractionX) + upperRight * fractionX;
      const interpolated = lower * (1 - fractionY) + upper * fractionY;
      const exact = gaussianComponents(targetX[xIndex], targetY[yIndex], time, parameters).density;
      squaredError += (interpolated - exact) ** 2;
    }
  }
  return Math.sqrt(squaredError / (targetWidth * targetHeight));
}

export function simulateFreeGaussianSchrodinger(
  options: FreeGaussianSchrodingerOptions = {},
): AnalyticFieldSolverResult {
  const solverId = 'free-gaussian-schrodinger';
  const width = integerInput(solverId, 'width', options.width ?? 65, 33);
  const height = integerInput(solverId, 'height', options.height ?? 49, 33);
  const xMin = finiteInput(solverId, 'xMin', options.xMin ?? -8);
  const xMax = finiteInput(solverId, 'xMax', options.xMax ?? 8);
  const yMin = finiteInput(solverId, 'yMin', options.yMin ?? -6);
  const yMax = finiteInput(solverId, 'yMax', options.yMax ?? 6);
  if (xMax <= xMin || yMax <= yMin) {
    throw new AnalyticFieldSolverError(
      'invalid-input',
      solverId,
      'display-domain maxima must exceed minima',
    );
  }
  const packetWidth = positiveInput(solverId, 'packetWidth', options.packetWidth ?? 1);
  const centerX = finiteInput(solverId, 'centerX', options.centerX ?? -2);
  const centerY = finiteInput(solverId, 'centerY', options.centerY ?? 0);
  const momentumX = finiteInput(solverId, 'momentumX', options.momentumX ?? 1.2);
  const momentumY = finiteInput(solverId, 'momentumY', options.momentumY ?? 0);
  const duration = positiveInput(solverId, 'duration', options.duration ?? 3);
  const times = snapshotTimes(solverId, duration, options.snapshotCount ?? 9);
  enforceStoredValueBudget(solverId, width, height, times.length, 3);
  const dx = (xMax - xMin) / (width - 1);
  const dy = (yMax - yMin) / (height - 1);
  if (dx > packetWidth / 2 || dy > packetWidth / 2) {
    throw new AnalyticFieldSolverError(
      'invalid-input',
      solverId,
      'the initial packet width must be sampled by at least two intervals in each direction',
    );
  }
  const parameters: GaussianParameters = {
    packetWidth,
    centerX,
    centerY,
    momentumX,
    momentumY,
  };
  const xCoordinates = closedCoordinates(xMin, xMax, width);
  const yCoordinates = closedCoordinates(yMin, yMax, height);
  const frames: AnalyticFieldFrame[] = [];
  const sampledNorms: number[] = [];
  const truncationLosses: number[] = [];
  const sampledMeanX: number[] = [];
  const sampledRmsRadius: number[] = [];
  const analyticPacketWidth: number[] = [];
  let maximumQuadratureResidual = 0;
  let maximumIdentityResidual = 0;

  for (const time of times) {
    const real = new Float64Array(width * height);
    const imaginary = new Float64Array(width * height);
    const probabilityDensity = new Float64Array(width * height);
    for (let yIndex = 0; yIndex < height; yIndex += 1) {
      for (let xIndex = 0; xIndex < width; xIndex += 1) {
        const index = yIndex * width + xIndex;
        const components = gaussianComponents(
          xCoordinates[xIndex],
          yCoordinates[yIndex],
          time,
          parameters,
        );
        real[index] = components.real;
        imaginary[index] = components.imaginary;
        probabilityDensity[index] = components.density;
        maximumIdentityResidual = Math.max(
          maximumIdentityResidual,
          Math.abs(components.real ** 2 + components.imaginary ** 2 - components.density),
        );
      }
    }
    ensureFinite(solverId, real, `real wavefunction at t=${time}`);
    ensureFinite(solverId, imaginary, `imaginary wavefunction at t=${time}`);
    ensureFinite(solverId, probabilityDensity, `probability density at t=${time}`);
    const moments = closedGridMoments(probabilityDensity, xCoordinates, yCoordinates);
    const exactTruncatedNorm = exactTruncatedGaussianNorm(time, parameters, xMin, xMax, yMin, yMax);
    if (exactTruncatedNorm < 0 || exactTruncatedNorm > 1 + 2e-7) {
      throw new AnalyticFieldSolverError(
        'non-finite',
        solverId,
        `analytic truncated norm is outside its probability range at t=${time}`,
      );
    }
    maximumQuadratureResidual = Math.max(
      maximumQuadratureResidual,
      Math.abs(moments.norm - exactTruncatedNorm),
    );
    frames.push({ time, components: { real, imaginary, probabilityDensity } });
    sampledNorms.push(moments.norm);
    truncationLosses.push(1 - exactTruncatedNorm);
    sampledMeanX.push(moments.meanX);
    sampledRmsRadius.push(moments.rmsRadius);
    analyticPacketWidth.push(
      gaussianComponents(centerX + momentumX * time, centerY + momentumY * time, time, parameters)
        .spread,
    );
  }
  const mediumWidth = Math.floor((width - 1) / 2) + 1;
  const mediumHeight = Math.floor((height - 1) / 2) + 1;
  const coarseWidth = Math.floor((mediumWidth - 1) / 2) + 1;
  const coarseHeight = Math.floor((mediumHeight - 1) / 2) + 1;
  const refinementTime = duration / 3;
  const coarseError = gaussianInterpolationError(
    coarseWidth,
    coarseHeight,
    mediumWidth,
    mediumHeight,
    refinementTime,
    parameters,
    xMin,
    xMax,
    yMin,
    yMax,
  );
  const fineError = gaussianInterpolationError(
    mediumWidth,
    mediumHeight,
    width,
    height,
    refinementTime,
    parameters,
    xMin,
    xMax,
    yMin,
    yMax,
  );
  const quadratureTolerance = 2e-4;
  const densityIdentityTolerance = 16 * Number.EPSILON;

  return {
    times,
    coordinates: { x: xCoordinates, y: yCoordinates },
    frames,
    summaries: [
      summary(
        'sampled-domain-norm',
        'Probability on the sampled domain',
        'probability',
        sampledNorms,
      ),
      summary(
        'analytic-truncation-loss',
        'Probability outside the sampled domain',
        'probability',
        truncationLosses,
      ),
      summary('sampled-mean-x', 'Sampled mean x', 'length', sampledMeanX),
      summary('sampled-rms-radius', 'Sampled RMS radius from origin', 'length', sampledRmsRadius),
      summary(
        'analytic-packet-width',
        'Analytic Gaussian width parameter',
        'length',
        analyticPacketWidth,
      ),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'i psi_t = -(1/2) Laplacian(psi), with hbar = mass = 1',
      method: 'exact free two-dimensional Gaussian packet evaluated on a truncated display domain',
      representation: 'closed-form-solution',
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      boundary: 'open-domain-truncated-for-display',
      grid: {
        width,
        height,
        xMin,
        xMax,
        yMin,
        yMax,
        dx,
        dy,
        endpointConvention:
          'both display-window endpoints are sampled; they are not PDE boundaries',
      },
      temporal: { duration, snapshotCount: times.length, unit: 'dimensionless-time' },
      componentUnits: {
        real: '1/length',
        imaginary: '1/length',
        probabilityDensity: '1/length^2',
      },
      parameters: { packetWidth, centerX, centerY, momentumX, momentumY },
      provenance: {
        lawRef: 'free-schrodinger-gaussian-v1',
        sourceTitle: 'Schrodinger, Quantisierung als Eigenwertproblem',
        sourceUrl: 'https://doi.org/10.1002/andp.19263840404',
        scope:
          'Normalized free-particle Gaussian family; finite display-window loss is reported explicitly.',
      },
    },
    evidence: [
      {
        id: 'finite-components',
        category: 'finite',
        status: 'passed',
        value: 0,
        unit: 'non-finite values',
        tolerance: 0,
        description: 'Every raw real, imaginary, and density sample was checked before return.',
      },
      {
        id: 'grid-refinement-interpolation-error',
        category: 'refinement',
        status: fineError <= coarseError + Number.EPSILON ? 'passed' : 'observed',
        value: fineError,
        unit: 'probability density RMS',
        tolerance: coarseError,
        description: 'Bilinear representation error after doubling each sampling resolution.',
        details: { coarseError, coarseWidth, coarseHeight, mediumWidth, mediumHeight },
      },
      {
        id: 'full-space-norm-residual',
        category: 'conservation',
        status: 'passed',
        value: 0,
        unit: 'probability',
        tolerance: Number.EPSILON,
        description: 'The closed-form full-space Gaussian is normalized to one at every time.',
      },
      {
        id: 'display-quadrature-residual',
        category: 'diagnostic',
        status: maximumQuadratureResidual <= quadratureTolerance ? 'passed' : 'observed',
        value: maximumQuadratureResidual,
        unit: 'probability',
        tolerance: quadratureTolerance,
        description:
          'Trapezoidal grid norm versus the analytic probability inside the display window.',
      },
      {
        id: 'maximum-truncation-loss',
        category: 'diagnostic',
        status: 'observed',
        value: Math.max(...truncationLosses),
        unit: 'probability',
        description: 'Largest exact probability fraction outside the finite display window.',
      },
      {
        id: 'density-identity-residual',
        category: 'conservation',
        status: maximumIdentityResidual <= densityIdentityTolerance ? 'passed' : 'observed',
        value: maximumIdentityResidual,
        unit: 'probability density',
        tolerance: densityIdentityTolerance,
        description: 'Maximum residual of |psi|^2 = real(psi)^2 + imag(psi)^2.',
      },
    ],
  };
}

export type BudykoInitialCondition =
  | { kind: 'uniform'; temperature: number }
  | { kind: 'equator-to-pole'; equatorTemperature: number; poleTemperature: number };

export interface BudykoSellersOptions {
  latitudeCells?: number;
  solarScale?: number;
  meanSolarFlux?: number;
  insolationP2?: number;
  transport?: number;
  heatCapacity?: number;
  outgoingIntercept?: number;
  outgoingSlope?: number;
  warmAlbedo?: number;
  coldAlbedo?: number;
  iceTransitionTemperature?: number;
  iceTransitionWidth?: number;
  dtYears?: number;
  steps?: number;
  snapshotCount?: number;
  equilibriumTolerance?: number;
  /** Reviewed RMS agreement threshold against the half-resolution final profile. */
  refinementTolerance?: number;
  initialCondition?: BudykoInitialCondition;
}

interface BudykoParameters {
  latitudeCells: number;
  solarScale: number;
  meanSolarFlux: number;
  insolationP2: number;
  transport: number;
  heatCapacity: number;
  outgoingIntercept: number;
  outgoingSlope: number;
  warmAlbedo: number;
  coldAlbedo: number;
  iceTransitionTemperature: number;
  iceTransitionWidth: number;
  dtYears: number;
  steps: number;
  initialCondition: BudykoInitialCondition;
}

function coldFraction(temperature: number, transition: number, width: number): number {
  const scaled = (temperature - transition) / width;
  if (scaled >= 0) {
    const inverse = Math.exp(-scaled);
    return inverse / (1 + inverse);
  }
  const direct = Math.exp(scaled);
  return 1 / (1 + direct);
}

function budykoInitialTemperature(cellCoordinate: number, initial: BudykoInitialCondition): number {
  if (initial.kind === 'uniform') return initial.temperature;
  return (
    initial.poleTemperature +
    (initial.equatorTemperature - initial.poleTemperature) * (1 - cellCoordinate ** 2)
  );
}

function budykoAlbedo(temperature: number, parameters: BudykoParameters): number {
  return (
    parameters.warmAlbedo +
    (parameters.coldAlbedo - parameters.warmAlbedo) *
      coldFraction(temperature, parameters.iceTransitionTemperature, parameters.iceTransitionWidth)
  );
}

function solveTridiagonal(
  lower: Float64Array,
  diagonal: Float64Array,
  upper: Float64Array,
  rightHandSide: Float64Array,
): Float64Array {
  const count = diagonal.length;
  const modifiedUpper = new Float64Array(count);
  const modifiedRight = new Float64Array(count);
  modifiedUpper[0] = upper[0] / diagonal[0];
  modifiedRight[0] = rightHandSide[0] / diagonal[0];
  for (let index = 1; index < count; index += 1) {
    const pivot = diagonal[index] - lower[index] * modifiedUpper[index - 1];
    if (!Number.isFinite(pivot) || pivot === 0) {
      throw new Error(`non-finite or zero tridiagonal pivot at index ${index}`);
    }
    modifiedUpper[index] = index === count - 1 ? 0 : upper[index] / pivot;
    modifiedRight[index] = (rightHandSide[index] - lower[index] * modifiedRight[index - 1]) / pivot;
  }
  const solution = new Float64Array(count);
  solution[count - 1] = modifiedRight[count - 1];
  for (let index = count - 2; index >= 0; index -= 1) {
    solution[index] = modifiedRight[index] - modifiedUpper[index] * solution[index + 1];
  }
  return solution;
}

function budykoTransport(
  temperature: Float64Array,
  cellWidth: number,
  transport: number,
): Float64Array {
  const count = temperature.length;
  const divergence = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const leftFace = -1 + index * cellWidth;
    const rightFace = leftFace + cellWidth;
    const leftFlux =
      index === 0
        ? 0
        : (transport * (1 - leftFace ** 2) * (temperature[index] - temperature[index - 1])) /
          cellWidth;
    const rightFlux =
      index === count - 1
        ? 0
        : (transport * (1 - rightFace ** 2) * (temperature[index + 1] - temperature[index])) /
          cellWidth;
    divergence[index] = (rightFlux - leftFlux) / cellWidth;
  }
  return divergence;
}

function budykoResidual(temperature: Float64Array, parameters: BudykoParameters): Float64Array {
  const cellWidth = 2 / parameters.latitudeCells;
  const transport = budykoTransport(temperature, cellWidth, parameters.transport);
  const residual = new Float64Array(parameters.latitudeCells);
  for (let index = 0; index < parameters.latitudeCells; index += 1) {
    const x = -1 + (index + 0.5) * cellWidth;
    const legendreP2 = 0.5 * (3 * x * x - 1);
    const insolation =
      parameters.meanSolarFlux * parameters.solarScale * (1 + parameters.insolationP2 * legendreP2);
    const absorbed = insolation * (1 - budykoAlbedo(temperature[index], parameters));
    residual[index] =
      absorbed -
      (parameters.outgoingIntercept + parameters.outgoingSlope * temperature[index]) +
      transport[index];
  }
  return residual;
}

function budykoRelaxation(parameters: BudykoParameters, captureSteps?: Set<number>) {
  const count = parameters.latitudeCells;
  const cellWidth = 2 / count;
  let temperature: Float64Array = Float64Array.from({ length: count }, (_, index) =>
    budykoInitialTemperature(-1 + (index + 0.5) * cellWidth, parameters.initialCondition),
  );
  const lower = new Float64Array(count);
  const diagonal = new Float64Array(count);
  const upper = new Float64Array(count);
  const capacityRate = parameters.heatCapacity / parameters.dtYears;
  for (let index = 0; index < count; index += 1) {
    const leftFace = -1 + index * cellWidth;
    const rightFace = leftFace + cellWidth;
    const leftCoefficient =
      index === 0 ? 0 : (parameters.transport * (1 - leftFace ** 2)) / cellWidth ** 2;
    const rightCoefficient =
      index === count - 1 ? 0 : (parameters.transport * (1 - rightFace ** 2)) / cellWidth ** 2;
    lower[index] = -leftCoefficient;
    upper[index] = -rightCoefficient;
    diagonal[index] = capacityRate + parameters.outgoingSlope + leftCoefficient + rightCoefficient;
  }
  const captures: Array<{ step: number; temperature: Float64Array }> = [];
  if (captureSteps?.has(0)) captures.push({ step: 0, temperature: temperature.slice() });
  let maximumTransportIntegralResidual = 0;
  for (let step = 1; step <= parameters.steps; step += 1) {
    const rightHandSide = new Float64Array(count);
    for (let index = 0; index < count; index += 1) {
      const x = -1 + (index + 0.5) * cellWidth;
      const legendreP2 = 0.5 * (3 * x * x - 1);
      const insolation =
        parameters.meanSolarFlux *
        parameters.solarScale *
        (1 + parameters.insolationP2 * legendreP2);
      const absorbed = insolation * (1 - budykoAlbedo(temperature[index], parameters));
      rightHandSide[index] =
        capacityRate * temperature[index] + absorbed - parameters.outgoingIntercept;
    }
    try {
      temperature = solveTridiagonal(lower, diagonal, upper, rightHandSide);
    } catch (error) {
      throw new AnalyticFieldSolverError(
        'non-finite',
        'budyko-sellers-ebm',
        error instanceof Error ? error.message : 'tridiagonal solve failed',
      );
    }
    ensureFinite('budyko-sellers-ebm', temperature, `temperature at step ${step}`);
    const transportDivergence = budykoTransport(temperature, cellWidth, parameters.transport);
    let transportIntegral = 0;
    for (const value of transportDivergence) transportIntegral += value * cellWidth;
    maximumTransportIntegralResidual = Math.max(
      maximumTransportIntegralResidual,
      Math.abs(transportIntegral),
    );
    if (captureSteps?.has(step)) captures.push({ step, temperature: temperature.slice() });
  }
  return { temperature, captures, maximumTransportIntegralResidual };
}

function captureStepSet(
  solverId: AnalyticFieldSolverId,
  steps: number,
  snapshotCount: number,
): Set<number> {
  const count = integerInput(solverId, 'snapshotCount', snapshotCount, 2);
  if (count > MAX_SNAPSHOTS || count > steps + 1) {
    throw new AnalyticFieldSolverError(
      'budget',
      solverId,
      `snapshotCount must not exceed ${Math.min(MAX_SNAPSHOTS, steps + 1)}`,
    );
  }
  const captures = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    captures.add(Math.round((index * steps) / (count - 1)));
  }
  return captures;
}

function interpolateCellCenteredProfile(coarse: Float64Array, fineCoordinate: number): number {
  const coarseWidth = 2 / coarse.length;
  const position = (fineCoordinate + 1) / coarseWidth - 0.5;
  if (position <= 0) return coarse[0];
  if (position >= coarse.length - 1) return coarse[coarse.length - 1];
  const left = Math.floor(position);
  const fraction = position - left;
  return coarse[left] * (1 - fraction) + coarse[left + 1] * fraction;
}

function iceLineLatitude(temperature: Float64Array, transitionTemperature: number): number {
  const count = temperature.length;
  const cellWidth = 2 / count;
  const northernStart = Math.floor(count / 2);
  if (temperature[northernStart] < transitionTemperature) return 0;
  for (let index = northernStart + 1; index < count; index += 1) {
    if (temperature[index] < transitionTemperature) {
      const previousX = -1 + (index - 0.5) * cellWidth;
      const currentX = -1 + (index + 0.5) * cellWidth;
      const fraction =
        (transitionTemperature - temperature[index - 1]) /
        (temperature[index] - temperature[index - 1]);
      return (Math.asin(previousX + fraction * (currentX - previousX)) * 180) / Math.PI;
    }
  }
  return 90;
}

export function simulateBudykoSellers(
  options: BudykoSellersOptions = {},
): AnalyticFieldSolverResult {
  const solverId = 'budyko-sellers-ebm';
  const latitudeCells = integerInput(solverId, 'latitudeCells', options.latitudeCells ?? 48, 16);
  const solarScale = positiveInput(solverId, 'solarScale', options.solarScale ?? 1);
  const meanSolarFlux = positiveInput(solverId, 'meanSolarFlux', options.meanSolarFlux ?? 340);
  const insolationP2 = finiteInput(solverId, 'insolationP2', options.insolationP2 ?? -0.482);
  if (insolationP2 < -1 || insolationP2 > 2) {
    throw new AnalyticFieldSolverError(
      'invalid-input',
      solverId,
      'insolationP2 must keep the prescribed annual-mean insolation nonnegative',
    );
  }
  const transport = positiveInput(solverId, 'transport', options.transport ?? 0.35);
  const refinementTolerance = positiveInput(
    solverId,
    'refinementTolerance',
    options.refinementTolerance ?? 1,
  );
  const heatCapacity = positiveInput(solverId, 'heatCapacity', options.heatCapacity ?? 10);
  const outgoingIntercept = finiteInput(
    solverId,
    'outgoingIntercept',
    options.outgoingIntercept ?? 203.3,
  );
  const outgoingSlope = positiveInput(solverId, 'outgoingSlope', options.outgoingSlope ?? 2.09);
  const warmAlbedo = finiteInput(solverId, 'warmAlbedo', options.warmAlbedo ?? 0.3);
  const coldAlbedo = finiteInput(solverId, 'coldAlbedo', options.coldAlbedo ?? 0.62);
  if (
    warmAlbedo < 0 ||
    warmAlbedo > 1 ||
    coldAlbedo < 0 ||
    coldAlbedo > 1 ||
    coldAlbedo < warmAlbedo
  ) {
    throw new AnalyticFieldSolverError(
      'invalid-input',
      solverId,
      'albedos must satisfy 0 <= warmAlbedo <= coldAlbedo <= 1',
    );
  }
  const iceTransitionTemperature = finiteInput(
    solverId,
    'iceTransitionTemperature',
    options.iceTransitionTemperature ?? -10,
  );
  const iceTransitionWidth = positiveInput(
    solverId,
    'iceTransitionWidth',
    options.iceTransitionWidth ?? 2,
  );
  const dtYears = positiveInput(solverId, 'dtYears', options.dtYears ?? 0.25);
  const steps = integerInput(solverId, 'steps', options.steps ?? 800, 1);
  const equilibriumTolerance = positiveInput(
    solverId,
    'equilibriumTolerance',
    options.equilibriumTolerance ?? 0.05,
  );
  const initialCondition =
    options.initialCondition ??
    ({
      kind: 'equator-to-pole',
      equatorTemperature: 20,
      poleTemperature: -25,
    } satisfies BudykoInitialCondition);
  if (initialCondition.kind === 'uniform') {
    finiteInput(solverId, 'initialCondition.temperature', initialCondition.temperature);
  } else {
    finiteInput(
      solverId,
      'initialCondition.equatorTemperature',
      initialCondition.equatorTemperature,
    );
    finiteInput(solverId, 'initialCondition.poleTemperature', initialCondition.poleTemperature);
  }
  if (latitudeCells * steps > MAX_EBM_CELL_STEPS) {
    throw new AnalyticFieldSolverError(
      'budget',
      solverId,
      `run requests ${latitudeCells * steps} cell-steps; the browser budget is ${MAX_EBM_CELL_STEPS}`,
    );
  }
  const captures = captureStepSet(solverId, steps, options.snapshotCount ?? 9);
  enforceStoredValueBudget(solverId, 1, latitudeCells, captures.size, 1);
  const parameters: BudykoParameters = {
    latitudeCells,
    solarScale,
    meanSolarFlux,
    insolationP2,
    transport,
    heatCapacity,
    outgoingIntercept,
    outgoingSlope,
    warmAlbedo,
    coldAlbedo,
    iceTransitionTemperature,
    iceTransitionWidth,
    dtYears,
    steps,
    initialCondition,
  };
  const run = budykoRelaxation(parameters, captures);
  const sinLatitude = Float64Array.from(
    { length: latitudeCells },
    (_, index) => -1 + (index + 0.5) * (2 / latitudeCells),
  );
  const latitude = Float64Array.from(sinLatitude, (value) => Math.asin(value));
  const frames: AnalyticFieldFrame[] = [];
  const meanTemperature: number[] = [];
  const iceLine: number[] = [];
  const maximumEnergyImbalance: number[] = [];
  for (const capture of run.captures) {
    ensureFinite(solverId, capture.temperature, `temperature frame at step ${capture.step}`);
    const residual = budykoResidual(capture.temperature, parameters);
    let maximumResidual = 0;
    for (const value of residual) maximumResidual = Math.max(maximumResidual, Math.abs(value));
    const time = capture.step * dtYears;
    frames.push({ time, components: { temperature: capture.temperature.slice() } });
    meanTemperature.push(mean(capture.temperature));
    iceLine.push(iceLineLatitude(capture.temperature, iceTransitionTemperature));
    maximumEnergyImbalance.push(maximumResidual);
  }
  const times = Float64Array.from(frames, (frame) => frame.time);
  const finalResidual = maximumEnergyImbalance[maximumEnergyImbalance.length - 1];
  const coarseLatitudeCells = Math.floor(latitudeCells / 2);
  const coarseParameters: BudykoParameters = { ...parameters, latitudeCells: coarseLatitudeCells };
  const coarseRun = budykoRelaxation(coarseParameters);
  let refinementSquaredError = 0;
  for (let index = 0; index < latitudeCells; index += 1) {
    const interpolated = interpolateCellCenteredProfile(coarseRun.temperature, sinLatitude[index]);
    refinementSquaredError += (interpolated - run.temperature[index]) ** 2;
  }
  const refinementRms = Math.sqrt(refinementSquaredError / latitudeCells);
  const transportTolerance = 1e-10;

  return {
    times,
    coordinates: { x: Float64Array.of(0), y: latitude },
    frames,
    summaries: [
      summary('mean-temperature', 'Area-weighted mean temperature', 'degC', meanTemperature),
      summary('ice-line-latitude', 'Northern ice-line latitude', 'degree', iceLine),
      summary(
        'maximum-energy-imbalance',
        'Maximum local energy-balance residual',
        'W/m^2',
        maximumEnergyImbalance,
      ),
    ],
    metadata: {
      solverId,
      version: 1,
      equation: 'C T_t = Q s(x)(1-alpha(T)) - (A + B T) + D d/dx[(1-x^2) T_x], x=sin(latitude)',
      method:
        'finite-volume equal-area latitude grid; implicit diffusion/OLR and explicit smooth albedo relaxation',
      representation: 'governing-law-relaxation',
      dynamics: 'deterministic',
      reproducibility: 'bitwise-deterministic',
      boundary: 'no-flux-in-sin-latitude',
      grid: {
        width: 1,
        height: latitudeCells,
        xMin: 0,
        xMax: 0,
        yMin: -1,
        yMax: 1,
        dx: 1,
        dy: 2 / latitudeCells,
        endpointConvention: 'one-column cell-centred equal-area sin(latitude) state',
      },
      temporal: {
        duration: steps * dtYears,
        snapshotCount: times.length,
        unit: 'year',
        stepSize: dtYears,
        steps,
      },
      componentUnits: { temperature: 'degC' },
      parameters: {
        solarScale,
        meanSolarFlux,
        insolationP2,
        transport,
        heatCapacity,
        outgoingIntercept,
        outgoingSlope,
        warmAlbedo,
        coldAlbedo,
        iceTransitionTemperature,
        iceTransitionWidth,
        initialCondition: JSON.stringify(initialCondition),
        refinementTolerance,
      },
      provenance: {
        lawRef: 'budyko-sellers-equilibrium-v1',
        sourceTitle: 'Budyko, The effect of solar radiation variations on the climate of the Earth',
        sourceUrl: 'https://doi.org/10.1111/j.2153-3490.1969.tb00466.x',
        scope: 'Reduced annual-mean one-dimensional zonal EBM; model years are relaxation time.',
      },
    },
    evidence: [
      {
        id: 'finite-components',
        category: 'finite',
        status: 'passed',
        value: 0,
        unit: 'non-finite values',
        tolerance: 0,
        description: 'Every raw zonal temperature sample was checked before return.',
      },
      {
        id: 'grid-refinement-profile-rms',
        category: 'refinement',
        status: refinementRms <= refinementTolerance ? 'passed' : 'observed',
        value: refinementRms,
        unit: 'degC',
        tolerance: refinementTolerance,
        description:
          'RMS final-profile difference from a half-resolution equal-area relaxation against the reviewed display-scale tolerance.',
        details: { coarseLatitudeCells, fineLatitudeCells: latitudeCells },
      },
      {
        id: 'equilibrium-residual',
        category: 'equilibrium',
        status: finalResidual <= equilibriumTolerance ? 'passed' : 'observed',
        value: finalResidual,
        unit: 'W/m^2',
        tolerance: equilibriumTolerance,
        description: 'Maximum final residual of the discretized steady energy-balance equation.',
      },
      {
        id: 'transport-integral-residual',
        category: 'conservation',
        status: run.maximumTransportIntegralResidual <= transportTolerance ? 'passed' : 'observed',
        value: run.maximumTransportIntegralResidual,
        unit: 'W/m^2 integrated over sin(latitude)',
        tolerance: transportTolerance,
        description: 'Finite-volume meridional transport integrates to zero without correction.',
      },
      {
        id: 'no-flux-boundary-residual',
        category: 'boundary',
        status: 'passed',
        value: 0,
        unit: 'W/m^2',
        tolerance: 0,
        description: 'Both polar face fluxes are explicitly zero in the finite-volume operator.',
      },
    ],
  };
}
