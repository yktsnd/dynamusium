import type { RunCheckResult, RunProvenance } from '../portrait-types.ts';
import type { Series, WorkManifest, WorkResult } from '../types.ts';

const colors = ['#7ce7ff', '#ffbd59', '#ff6f9f', '#8bf18b', '#b99cff', '#ff8d68'];
const sampleCount = 721;

function requireParameter(parameters: Record<string, number>, id: string): number {
  const value = parameters[id];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`Analytic orbital parameter "${id}" is missing or non-finite.`);
  }
  return value;
}

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number) {
  let eccentricAnomaly = meanAnomaly;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const residual = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly;
    const derivative = 1 - eccentricity * Math.cos(eccentricAnomaly);
    if (!(derivative > 0) || !Number.isFinite(residual)) {
      throw new Error('Kepler equation produced an invalid Newton step.');
    }
    const correction = residual / derivative;
    eccentricAnomaly -= correction;
    if (Math.abs(correction) <= 2e-14) return eccentricAnomaly;
  }
  throw new Error('Kepler equation did not converge within 20 Newton iterations.');
}

function series(id: string, label: string, values: number[], index: number): Series {
  const color = colors[index % colors.length];
  if (color === undefined) throw new Error('Analytic orbital palette is empty.');
  return { id, label, color, values };
}

function provenance(
  work: WorkManifest,
  id: string,
  interval: readonly [number, number],
  initialCondition: Record<string, number>,
): RunProvenance {
  if (work.schemaVersion !== 2) throw new Error(`${work.kernel} requires a v2 portrait.`);
  return {
    kernel: {
      id: work.kernel,
      version: '1',
      definitionHash: work.portrait.runtime.definitionHash,
    },
    execution: {
      kind: 'analytic-evaluator',
      id,
      version: '1',
      precision: 'float64',
      iterations: sampleCount - 1,
    },
    interval,
    initialCondition,
  };
}

function resultFromAnalyticState(input: {
  work: WorkManifest;
  times: number[];
  coordinateIds: string[];
  state: number[][];
  series: Series[];
  checks: RunCheckResult[];
  executionId: string;
  initialCondition: Record<string, number>;
  diagnostics: string;
}): WorkResult {
  const { work, times, coordinateIds, state } = input;
  const finalTime = times.at(-1);
  if (finalTime === undefined || state.length !== times.length) {
    throw new Error(`${work.kernel} analytic state has inconsistent dimensions.`);
  }
  const stateDimension = coordinateIds.length;
  const flattened: number[] = [];
  for (let sample = 0; sample < state.length; sample += 1) {
    const row = state[sample];
    if (!row || row.length !== stateDimension || row.some((value) => !Number.isFinite(value))) {
      throw new Error(`${work.kernel} analytic state row ${sample} is invalid.`);
    }
    flattened.push(...row);
  }
  const xIndex = coordinateIds.indexOf('x');
  const yIndex = coordinateIds.indexOf('y');
  if (xIndex < 0 || yIndex < 0) throw new Error(`${work.kernel} state omits x-y coordinates.`);
  return {
    duration: finalTime,
    presentationDuration: work.duration,
    times,
    series: input.series,
    points: state.map((row) => ({ x: row[xIndex]!, y: row[yIndex]! })),
    diagnostics: input.diagnostics,
    numerical: {
      provenance: provenance(
        work,
        input.executionId,
        [times[0]!, finalTime],
        input.initialCondition,
      ),
      checks: input.checks,
      state: {
        coordinateIds,
        shape: [times.length, stateDimension],
        values: flattened,
      },
    },
  };
}

function simulateKepler(work: WorkManifest, parameters: Record<string, number>): WorkResult {
  const eccentricity = requireParameter(parameters, 'eccentricity');
  const semiMajorAxis = requireParameter(parameters, 'axis');
  if (eccentricity < 0 || eccentricity >= 1 || semiMajorAxis <= 0) {
    throw new Error(
      'Kepler ellipse requires 0 <= eccentricity < 1 and a positive semi-major axis.',
    );
  }
  const gravitationalParameter = semiMajorAxis ** 3;
  const root = Math.sqrt(1 - eccentricity ** 2);
  const times: number[] = [];
  const state: number[][] = [];
  const radius: number[] = [];
  const speed: number[] = [];
  const sweptArea: number[] = [];
  let maximumEquationResidual = 0;
  let maximumEnergyResidual = 0;
  const referenceEnergy = -gravitationalParameter / (2 * semiMajorAxis);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const meanAnomaly = (sample / (sampleCount - 1)) * 2 * Math.PI;
    const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, eccentricity);
    const denominator = 1 - eccentricity * Math.cos(eccentricAnomaly);
    const x = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
    const y = semiMajorAxis * root * Math.sin(eccentricAnomaly);
    const velocityX = (-semiMajorAxis * Math.sin(eccentricAnomaly)) / denominator;
    const velocityY = (semiMajorAxis * root * Math.cos(eccentricAnomaly)) / denominator;
    const currentRadius = Math.hypot(x, y);
    const currentSpeed = Math.hypot(velocityX, velocityY);
    const energy = 0.5 * currentSpeed ** 2 - gravitationalParameter / currentRadius;
    maximumEnergyResidual = Math.max(maximumEnergyResidual, Math.abs(energy - referenceEnergy));
    maximumEquationResidual = Math.max(
      maximumEquationResidual,
      Math.abs(eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly),
    );
    times.push(meanAnomaly);
    state.push([x, y, velocityX, velocityY]);
    radius.push(currentRadius);
    speed.push(currentSpeed);
    sweptArea.push(0.5 * semiMajorAxis ** 2 * root * meanAnomaly);
  }
  const energyTolerance = 2e-12 * Math.max(1, Math.abs(referenceEnergy));
  const result = resultFromAnalyticState({
    work,
    times,
    coordinateIds: ['x', 'y', 'vx', 'vy'],
    state,
    series: [
      series(
        'x',
        'Orbit x',
        state.map((row) => row[0]!),
        0,
      ),
      series(
        'y',
        'Orbit y',
        state.map((row) => row[1]!),
        1,
      ),
      series('radius', 'Orbital radius', radius, 2),
      series('speed', 'Orbital speed', speed, 3),
      series('swept-area', 'Swept area', sweptArea, 4),
    ],
    checks: [
      {
        id: 'energy-residual',
        status: maximumEnergyResidual <= energyTolerance ? 'passed' : 'failed',
        severity: 'claim',
        metrics: [
          {
            id: 'maximum-specific-energy-residual',
            value: maximumEnergyResidual,
            unit: 'specific energy',
            tolerance: energyTolerance,
          },
        ],
        message: 'The exact elliptic state satisfies the two-body specific-energy invariant.',
      },
      {
        id: 'reference-statistic',
        status: maximumEquationResidual <= 1e-12 ? 'passed' : 'failed',
        severity: 'claim',
        metrics: [
          {
            id: 'maximum-kepler-equation-residual',
            value: maximumEquationResidual,
            unit: 'radian',
            tolerance: 1e-12,
          },
        ],
        message:
          'Every sample is parameterized by uniform mean anomaly and satisfies Kepler equation.',
      },
    ],
    executionId: 'kepler-equation-newton',
    initialCondition: { eccentricity, semiMajorAxis },
    diagnostics:
      'Exact bound two-body ellipse sampled uniformly in mean anomaly; Kepler equation and specific energy are checked.',
  });
  return result;
}

function simulateHohmann(work: WorkManifest, parameters: Record<string, number>): WorkResult {
  const targetRadius = requireParameter(parameters, 'target');
  const phase = requireParameter(parameters, 'phase');
  if (targetRadius <= 1)
    throw new Error('The reviewed Hohmann family requires a target radius above 1.');
  const gravitationalParameter = 1;
  const semiMajorAxis = (1 + targetRadius) / 2;
  const eccentricity = (targetRadius - 1) / (targetRadius + 1);
  const root = Math.sqrt(1 - eccentricity ** 2);
  const meanMotion = Math.sqrt(gravitationalParameter / semiMajorAxis ** 3);
  const departureDeltaV =
    Math.sqrt(gravitationalParameter) * (Math.sqrt((2 * targetRadius) / (1 + targetRadius)) - 1);
  const arrivalDeltaV =
    Math.sqrt(gravitationalParameter / targetRadius) * (1 - Math.sqrt(2 / (1 + targetRadius)));
  const times: number[] = [];
  const state: number[][] = [];
  const radius: number[] = [];
  const cumulativeDeltaV: number[] = [];
  let maximumVisVivaResidual = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const eccentricAnomaly = (sample / (sampleCount - 1)) * Math.PI;
    const meanAnomaly = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly);
    const time = meanAnomaly / meanMotion;
    const localX = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
    const localY = semiMajorAxis * root * Math.sin(eccentricAnomaly);
    const anomalyRate = meanMotion / (1 - eccentricity * Math.cos(eccentricAnomaly));
    const localVx = -semiMajorAxis * Math.sin(eccentricAnomaly) * anomalyRate;
    const localVy = semiMajorAxis * root * Math.cos(eccentricAnomaly) * anomalyRate;
    const cosine = Math.cos(phase);
    const sine = Math.sin(phase);
    const x = localX * cosine - localY * sine;
    const y = localX * sine + localY * cosine;
    const vx = localVx * cosine - localVy * sine;
    const vy = localVx * sine + localVy * cosine;
    const currentRadius = Math.hypot(x, y);
    const speedSquared = vx * vx + vy * vy;
    const expectedSpeedSquared = gravitationalParameter * (2 / currentRadius - 1 / semiMajorAxis);
    maximumVisVivaResidual = Math.max(
      maximumVisVivaResidual,
      Math.abs(speedSquared - expectedSpeedSquared),
    );
    times.push(time);
    state.push([x, y, vx, vy]);
    radius.push(currentRadius);
    cumulativeDeltaV.push(
      sample === sampleCount - 1 ? departureDeltaV + arrivalDeltaV : departureDeltaV,
    );
  }
  const endpointResidual = Math.max(
    Math.abs(radius[0]! - 1),
    Math.abs(radius.at(-1)! - targetRadius),
  );
  const result = resultFromAnalyticState({
    work,
    times,
    coordinateIds: ['x', 'y', 'vx', 'vy'],
    state,
    series: [
      series(
        'x',
        'Transfer x',
        state.map((row) => row[0]!),
        0,
      ),
      series(
        'y',
        'Transfer y',
        state.map((row) => row[1]!),
        1,
      ),
      series('radius', 'Orbital radius', radius, 2),
      series('delta-v', 'Cumulative impulse magnitude', cumulativeDeltaV, 3),
    ],
    checks: [
      {
        id: 'reference-statistic',
        status: endpointResidual <= 1e-12 && maximumVisVivaResidual <= 1e-12 ? 'passed' : 'failed',
        severity: 'claim',
        metrics: [
          { id: 'tangent-endpoint-radius-residual', value: endpointResidual, tolerance: 1e-12 },
          { id: 'maximum-vis-viva-residual', value: maximumVisVivaResidual, tolerance: 1e-12 },
          { id: 'total-delta-v', value: departureDeltaV + arrivalDeltaV, unit: 'speed' },
        ],
        message:
          'The half-ellipse is continuous and tangent at both circular-orbit radii and satisfies vis-viva.',
      },
    ],
    executionId: 'analytic-hohmann-events',
    initialCondition: { departureRadius: 1, targetRadius, phase },
    diagnostics:
      'Exact tangent Keplerian transfer half-ellipse with two declared instantaneous impulses; no circular coast is synthesized.',
  });
  return result;
}

function diskOverlapArea(starRadius: number, planetRadius: number, separation: number) {
  if (separation >= starRadius + planetRadius) return 0;
  if (separation <= Math.abs(starRadius - planetRadius)) {
    return Math.PI * Math.min(starRadius, planetRadius) ** 2;
  }
  const roundoffUnit = (value: number, label: string) => {
    const tolerance = 64 * Number.EPSILON;
    if (!Number.isFinite(value) || value < -1 - tolerance || value > 1 + tolerance) {
      throw new Error(`Transit ${label} cosine lies outside its geometric domain.`);
    }
    return value < -1 ? -1 : value > 1 ? 1 : value;
  };
  const starCosine =
    (separation ** 2 + starRadius ** 2 - planetRadius ** 2) / (2 * separation * starRadius);
  const planetCosine =
    (separation ** 2 + planetRadius ** 2 - starRadius ** 2) / (2 * separation * planetRadius);
  const starAngle = Math.acos(roundoffUnit(starCosine, 'stellar'));
  const planetAngle = Math.acos(roundoffUnit(planetCosine, 'planetary'));
  const radical =
    (-separation + starRadius + planetRadius) *
    (separation + starRadius - planetRadius) *
    (separation - starRadius + planetRadius) *
    (separation + starRadius + planetRadius);
  const radicalTolerance = 64 * Number.EPSILON * (separation + starRadius + planetRadius) ** 4;
  if (!Number.isFinite(radical) || radical < -radicalTolerance) {
    throw new Error('Transit overlap radical lies outside its geometric domain.');
  }
  return (
    starRadius ** 2 * starAngle +
    planetRadius ** 2 * planetAngle -
    0.5 * Math.sqrt(radical < 0 ? 0 : radical)
  );
}

function simulateTransit(work: WorkManifest, parameters: Record<string, number>): WorkResult {
  const planetRadius = requireParameter(parameters, 'radius');
  const impact = requireParameter(parameters, 'impact');
  if (!(planetRadius > 0 && planetRadius < 1) || impact < 0) {
    throw new Error('Transit geometry requires 0 < planet radius < 1 and nonnegative impact.');
  }
  const starRadius = 1;
  const extent = 1.2 * (starRadius + planetRadius);
  const times: number[] = [];
  const state: number[][] = [];
  const phase: number[] = [];
  const flux: number[] = [];
  const overlapArea: number[] = [];
  let maximumSymmetryResidual = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const normalizedPhase = (sample / (sampleCount - 1)) * 2 - 1;
    const x = normalizedPhase * extent;
    const separation = Math.hypot(x, impact);
    const overlap = diskOverlapArea(starRadius, planetRadius, separation);
    const normalizedFlux = 1 - overlap / Math.PI;
    times.push(normalizedPhase + 1);
    state.push([x, impact]);
    phase.push(normalizedPhase);
    flux.push(normalizedFlux);
    overlapArea.push(overlap);
  }
  for (let index = 0; index < flux.length; index += 1) {
    maximumSymmetryResidual = Math.max(
      maximumSymmetryResidual,
      Math.abs(flux[index]! - flux[flux.length - 1 - index]!),
    );
  }
  const outsideResidual = Math.max(Math.abs(1 - flux[0]!), Math.abs(1 - flux.at(-1)!));
  const result = resultFromAnalyticState({
    work,
    times,
    coordinateIds: ['x', 'y'],
    state,
    series: [
      series('phase', 'Normalized transit phase', phase, 0),
      series('flux', 'Uniform-disk stellar flux', flux, 1),
      series('overlap-area', 'Projected overlap area', overlapArea, 2),
    ],
    checks: [
      {
        id: 'reference-statistic',
        status: maximumSymmetryResidual <= 1e-14 && outsideResidual <= 1e-14 ? 'passed' : 'failed',
        severity: 'claim',
        metrics: [
          { id: 'light-curve-symmetry-residual', value: maximumSymmetryResidual, tolerance: 1e-14 },
          { id: 'out-of-transit-flux-residual', value: outsideResidual, tolerance: 1e-14 },
        ],
        message:
          'Exact two-disk overlap yields a symmetric uniform-disk light curve and unit out-of-transit flux.',
      },
    ],
    executionId: 'analytic-disk-overlap',
    initialCondition: { starRadius, planetRadius, impact, projectedSpeed: 1 },
    diagnostics:
      'Exact overlap of uniform stellar and planetary disks along a straight projected chord; limb darkening is not included.',
  });
  result.points = phase.map((value, index) => ({ x: value, y: flux[index]! }));
  return result;
}

export function simulateReviewedAnalyticOrbit(
  work: WorkManifest,
  parameters: Record<string, number>,
): WorkResult | null {
  switch (work.kernel) {
    case 'kepler':
      return simulateKepler(work, parameters);
    case 'hohmann':
      return simulateHohmann(work, parameters);
    case 'exoplanet-transit':
      return simulateTransit(work, parameters);
    default:
      return null;
  }
}
