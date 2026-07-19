/**
 * Bounded pseudo-arclength continuation for finite-dimensional equilibria.
 *
 * This module follows the standard predictor/corrector construction for
 * F(x, parameter) = 0. Its output is numerical evidence, not an interval
 * enclosure or a computer-assisted proof. In particular, fold detections are
 * candidates until transversality and non-degeneracy have been checked by a
 * separate, problem-specific analysis.
 */

export const CONTINUATION_BROWSER_LIMITS = {
  maximumDimension: 12,
  maximumPoints: 256,
  maximumNewtonIterations: 24,
  maximumFunctionEvaluations: 200_000,
  maximumEigenIterations: 1_200,
} as const;

export interface ComplexEigenvalue {
  real: number;
  imaginary: number;
}

export interface EquilibriumProblem {
  /** The autonomous vector field or equilibrium residual F(x, parameter). */
  residual: (state: readonly number[], parameter: number) => readonly number[];
  /** State Jacobian dF/dx. A central finite difference is used when omitted. */
  jacobian?: (state: readonly number[], parameter: number) => readonly (readonly number[])[];
  /** Parameter derivative dF/dparameter. A central finite difference is used when omitted. */
  parameterDerivative?: (state: readonly number[], parameter: number) => readonly number[];
  /**
   * Optional problem-specific eigenvalue calculation for dF/dx. The bounded
   * real-Schur fallback is used when this callback is omitted.
   */
  stabilityEigenvalues?: (
    state: readonly number[],
    parameter: number,
    jacobian: readonly (readonly number[])[],
  ) => readonly ComplexEigenvalue[];
}

export interface ContinuationSeed {
  state: readonly number[];
  parameter: number;
  /** Optional oriented null vector of [dF/dx dF/dparameter]. */
  tangent?: {
    state: readonly number[];
    parameter: number;
  };
}

export interface ContinuationOptions {
  pointCount?: number;
  initialStep?: number;
  minimumStep?: number;
  maximumStep?: number;
  parameterDirection?: -1 | 1;
  newtonTolerance?: number;
  maximumNewtonIterations?: number;
  finiteDifferenceRelativeStep?: number;
  augmentedConditionLimit?: number;
  maximumFunctionEvaluations?: number;
  foldTangentTolerance?: number;
  stabilityTolerance?: number;
  maximumEigenIterations?: number;
}

export interface MatrixConditionEvidence {
  status: 'finite' | 'singular-or-unresolved';
  normInfinity: number;
  inverseNormInfinity: number | null;
  conditionInfinity: number | null;
  minimumAbsolutePivot: number | null;
}

export interface StabilityEvidence {
  status: 'computed' | 'not-converged';
  method: 'caller-supplied' | 'analytic-1x1' | 'analytic-2x2' | 'bounded-real-schur';
  eigenvalues: ComplexEigenvalue[];
  spectralAbscissa: number | null;
  unstableDimension: number | null;
  classification: 'stable' | 'unstable' | 'indeterminate';
  tolerance: number;
  iterations: number;
  /** Scale-normalized deflation residual from the real-Schur iteration. */
  residual: number | null;
  limitations: string[];
}

export interface ContinuationPoint {
  index: number;
  arclength: number;
  parameter: number;
  state: number[];
  tangent: {
    state: number[];
    parameter: number;
  };
  evidence: {
    residualInfinityNorm: number;
    pseudoArclengthResidual: number;
    newtonIterations: number;
    acceptedPredictorStep: number;
    rejectedAttemptsBeforeAcceptance: number;
    stateJacobianSource: 'caller-supplied' | 'finite-difference';
    parameterDerivativeSource: 'caller-supplied' | 'finite-difference';
    stateJacobianCondition: MatrixConditionEvidence;
    augmentedJacobianCondition: MatrixConditionEvidence;
    stability: StabilityEvidence;
  };
}

export interface FoldCandidate {
  kind: 'fold-candidate';
  betweenPointIndices: readonly [number, number];
  arclengthEstimate: number;
  parameterEstimate: number;
  stateEstimate: number[];
  evidence: {
    tangentParameterBefore: number;
    tangentParameterAfter: number;
    eigenvalueNearestZeroBefore: ComplexEigenvalue | null;
    eigenvalueNearestZeroAfter: ComplexEigenvalue | null;
  };
  limitations: string[];
}

export interface ContinuationDiagnostics {
  residualEvaluations: number;
  jacobianEvaluations: number;
  parameterDerivativeEvaluations: number;
  stabilityEvaluations: number;
  rejectedSteps: number;
  adaptedStepRange: readonly [number, number];
  limitations: string[];
}

export interface ContinuationSuccess {
  ok: true;
  points: ContinuationPoint[];
  foldCandidates: FoldCandidate[];
  diagnostics: ContinuationDiagnostics;
}

export type ContinuationFailureCode =
  | 'invalid-input'
  | 'dimension-mismatch'
  | 'evaluation-error'
  | 'non-finite-evaluation'
  | 'evaluation-limit'
  | 'singular-linear-system'
  | 'condition-limit'
  | 'newton-nonconvergence'
  | 'eigenvalue-evaluation-failed';

export interface ContinuationFailure {
  ok: false;
  code: ContinuationFailureCode;
  message: string;
  partialPoints: ContinuationPoint[];
  failedStep: number | null;
  diagnostics: ContinuationDiagnostics;
}

export type ContinuationResult = ContinuationSuccess | ContinuationFailure;

type MutableDiagnostics = {
  residualEvaluations: number;
  jacobianEvaluations: number;
  parameterDerivativeEvaluations: number;
  stabilityEvaluations: number;
  rejectedSteps: number;
  minimumAcceptedStep: number;
  maximumAcceptedStep: number;
};

type ResolvedOptions = Required<ContinuationOptions>;

type LinearSolution = {
  solution: number[];
  condition: MatrixConditionEvidence;
};

class ContinuationAbort extends Error {
  constructor(
    readonly code: ContinuationFailureCode,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  pointCount: 64,
  initialStep: 0.05,
  minimumStep: 1e-5,
  maximumStep: 0.2,
  parameterDirection: 1,
  newtonTolerance: 1e-9,
  maximumNewtonIterations: 12,
  finiteDifferenceRelativeStep: 1e-6,
  augmentedConditionLimit: 1e13,
  maximumFunctionEvaluations: 100_000,
  foldTangentTolerance: 1e-4,
  stabilityTolerance: 1e-7,
  maximumEigenIterations: 600,
};

function resolveOptions(options: ContinuationOptions): ResolvedOptions {
  return { ...DEFAULT_OPTIONS, ...options };
}

function finiteNumber(value: number, context: string): number {
  if (!Number.isFinite(value)) {
    throw new ContinuationAbort('non-finite-evaluation', `${context} is non-finite.`);
  }
  return value;
}

function validateVector(values: readonly number[], dimension: number, context: string): number[] {
  if (values.length !== dimension) {
    throw new ContinuationAbort(
      'dimension-mismatch',
      `${context} has dimension ${values.length}; expected ${dimension}.`,
    );
  }
  return values.map((value, index) => finiteNumber(value, `${context}[${index}]`));
}

function validateMatrix(
  values: readonly (readonly number[])[],
  dimension: number,
  context: string,
): number[][] {
  if (values.length !== dimension) {
    throw new ContinuationAbort(
      'dimension-mismatch',
      `${context} has ${values.length} rows; expected ${dimension}.`,
    );
  }
  return values.map((row, index) => validateVector(row, dimension, `${context} row ${index}`));
}

function infinityNorm(values: readonly number[]): number {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, Math.abs(value));
  return maximum;
}

function euclideanNorm(values: readonly number[]): number {
  return Math.hypot(...values);
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const rightValue = right[index];
    if (rightValue === undefined) {
      throw new ContinuationAbort('dimension-mismatch', 'Dot-product dimensions differ.');
    }
    sum += left[index]! * rightValue;
  }
  return sum;
}

function matrixInfinityNorm(matrix: readonly (readonly number[])[]): number {
  let maximum = 0;
  for (const row of matrix) {
    maximum = Math.max(
      maximum,
      row.reduce((sum, value) => sum + Math.abs(value), 0),
    );
  }
  return maximum;
}

function eliminate(
  matrix: readonly (readonly number[])[],
  rightHandSide: readonly number[],
): { solution: number[]; minimumAbsolutePivot: number } | null {
  const dimension = matrix.length;
  const coefficients = matrix.map((row) => [...row]);
  const result = [...rightHandSide];
  const scale = Math.max(1, matrixInfinityNorm(matrix));
  const pivotTolerance = scale * Number.EPSILON * 128 * Math.max(1, dimension);
  let minimumAbsolutePivot = Number.POSITIVE_INFINITY;

  for (let column = 0; column < dimension; column += 1) {
    let pivotRow = column;
    let pivotMagnitude = Math.abs(coefficients[column]?.[column] ?? 0);
    for (let row = column + 1; row < dimension; row += 1) {
      const candidate = Math.abs(coefficients[row]?.[column] ?? 0);
      if (candidate > pivotMagnitude) {
        pivotMagnitude = candidate;
        pivotRow = row;
      }
    }
    if (!Number.isFinite(pivotMagnitude) || pivotMagnitude <= pivotTolerance) return null;
    if (pivotRow !== column) {
      [coefficients[column], coefficients[pivotRow]] = [
        coefficients[pivotRow]!,
        coefficients[column]!,
      ];
      [result[column], result[pivotRow]] = [result[pivotRow]!, result[column]!];
    }
    const pivot = coefficients[column]?.[column];
    if (pivot === undefined) return null;
    minimumAbsolutePivot = Math.min(minimumAbsolutePivot, Math.abs(pivot));
    for (let row = column + 1; row < dimension; row += 1) {
      const targetRow = coefficients[row];
      const pivotData = coefficients[column];
      if (!targetRow || !pivotData) return null;
      const factor = targetRow[column]! / pivot;
      targetRow[column] = 0;
      for (let inner = column + 1; inner < dimension; inner += 1) {
        targetRow[inner] = targetRow[inner]! - factor * pivotData[inner]!;
      }
      result[row] = result[row]! - factor * result[column]!;
    }
  }

  const solution = Array<number>(dimension).fill(0);
  for (let row = dimension - 1; row >= 0; row -= 1) {
    const coefficientRow = coefficients[row];
    if (!coefficientRow) return null;
    let value = result[row]!;
    for (let column = row + 1; column < dimension; column += 1) {
      value -= coefficientRow[column]! * solution[column]!;
    }
    const pivot = coefficientRow[row];
    if (pivot === undefined || Math.abs(pivot) <= pivotTolerance) return null;
    solution[row] = value / pivot;
  }
  if (solution.some((value) => !Number.isFinite(value))) return null;
  return { solution, minimumAbsolutePivot };
}

function conditionEvidence(matrix: readonly (readonly number[])[]): MatrixConditionEvidence {
  const dimension = matrix.length;
  const normInfinity = matrixInfinityNorm(matrix);
  const inverseRowSums = Array<number>(dimension).fill(0);
  let minimumAbsolutePivot = Number.POSITIVE_INFINITY;
  for (let column = 0; column < dimension; column += 1) {
    const basis = Array<number>(dimension).fill(0);
    basis[column] = 1;
    const solved = eliminate(matrix, basis);
    if (!solved) {
      return {
        status: 'singular-or-unresolved',
        normInfinity,
        inverseNormInfinity: null,
        conditionInfinity: null,
        minimumAbsolutePivot: null,
      };
    }
    minimumAbsolutePivot = Math.min(minimumAbsolutePivot, solved.minimumAbsolutePivot);
    for (let row = 0; row < dimension; row += 1) {
      inverseRowSums[row] = inverseRowSums[row]! + Math.abs(solved.solution[row]!);
    }
  }
  const inverseNormInfinity = Math.max(...inverseRowSums);
  const conditionInfinity = normInfinity * inverseNormInfinity;
  if (!Number.isFinite(conditionInfinity)) {
    return {
      status: 'singular-or-unresolved',
      normInfinity,
      inverseNormInfinity: null,
      conditionInfinity: null,
      minimumAbsolutePivot: null,
    };
  }
  return {
    status: 'finite',
    normInfinity,
    inverseNormInfinity,
    conditionInfinity,
    minimumAbsolutePivot,
  };
}

function solveLinear(
  matrix: readonly (readonly number[])[],
  rightHandSide: readonly number[],
): LinearSolution | null {
  const solved = eliminate(matrix, rightHandSide);
  if (!solved) return null;
  return { solution: solved.solution, condition: conditionEvidence(matrix) };
}

function multiply(left: readonly (readonly number[])[], right: readonly (readonly number[])[]) {
  const rows = left.length;
  const columns = right[0]?.length ?? 0;
  const shared = right.length;
  const result = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let value = 0;
      for (let inner = 0; inner < shared; inner += 1) {
        value += left[row]![inner]! * right[inner]![column]!;
      }
      result[row]![column] = value;
    }
  }
  return result;
}

function identity(dimension: number): number[][] {
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (__, column) => (row === column ? 1 : 0)),
  );
}

function householderQr(matrix: readonly (readonly number[])[]) {
  const dimension = matrix.length;
  const r = matrix.map((row) => [...row]);
  const q = identity(dimension);
  for (let column = 0; column < dimension - 1; column += 1) {
    const vector = Array.from(
      { length: dimension - column },
      (_, index) => r[column + index]![column]!,
    );
    const norm = euclideanNorm(vector);
    if (norm <= Number.EPSILON) continue;
    vector[0] = vector[0]! + (vector[0]! >= 0 ? norm : -norm);
    const vectorNorm = euclideanNorm(vector);
    if (vectorNorm <= Number.EPSILON) continue;
    for (let index = 0; index < vector.length; index += 1) vector[index] /= vectorNorm;

    for (let targetColumn = column; targetColumn < dimension; targetColumn += 1) {
      let projection = 0;
      for (let index = 0; index < vector.length; index += 1) {
        projection += vector[index]! * r[column + index]![targetColumn]!;
      }
      for (let index = 0; index < vector.length; index += 1) {
        r[column + index]![targetColumn] -= 2 * vector[index]! * projection;
      }
    }
    for (let row = 0; row < dimension; row += 1) {
      let projection = 0;
      for (let index = 0; index < vector.length; index += 1) {
        projection += q[row]![column + index]! * vector[index]!;
      }
      for (let index = 0; index < vector.length; index += 1) {
        q[row]![column + index] -= 2 * projection * vector[index]!;
      }
    }
  }
  return { q, r };
}

function reduceToUpperHessenberg(matrix: readonly (readonly number[])[]): number[][] {
  const result = matrix.map((row) => [...row]);
  const dimension = result.length;
  for (let column = 0; column < dimension - 2; column += 1) {
    const vector = Array.from(
      { length: dimension - column - 1 },
      (_, index) => result[column + 1 + index]![column]!,
    );
    const norm = euclideanNorm(vector);
    if (norm <= Number.EPSILON) continue;
    vector[0] = vector[0]! + (vector[0]! >= 0 ? norm : -norm);
    const vectorNorm = euclideanNorm(vector);
    if (vectorNorm <= Number.EPSILON) continue;
    for (let index = 0; index < vector.length; index += 1) vector[index] /= vectorNorm;

    for (let targetColumn = column; targetColumn < dimension; targetColumn += 1) {
      let projection = 0;
      for (let index = 0; index < vector.length; index += 1) {
        projection += vector[index]! * result[column + 1 + index]![targetColumn]!;
      }
      for (let index = 0; index < vector.length; index += 1) {
        result[column + 1 + index]![targetColumn] -= 2 * vector[index]! * projection;
      }
    }
    for (let row = 0; row < dimension; row += 1) {
      let projection = 0;
      for (let index = 0; index < vector.length; index += 1) {
        projection += result[row]![column + 1 + index]! * vector[index]!;
      }
      for (let index = 0; index < vector.length; index += 1) {
        result[row]![column + 1 + index] -= 2 * projection * vector[index]!;
      }
    }
  }
  return result;
}

function eigenvaluesOfTwoByTwo(
  a: number,
  b: number,
  c: number,
  d: number,
): [ComplexEigenvalue, ComplexEigenvalue] {
  const trace = a + d;
  const determinant = a * d - b * c;
  const discriminant = trace * trace - 4 * determinant;
  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    return [
      { real: (trace + root) / 2, imaginary: 0 },
      { real: (trace - root) / 2, imaginary: 0 },
    ];
  }
  const imaginary = Math.sqrt(-discriminant) / 2;
  return [
    { real: trace / 2, imaginary },
    { real: trace / 2, imaginary: -imaginary },
  ];
}

function fallbackEigenvalues(
  matrix: readonly (readonly number[])[],
  maximumIterations: number,
): {
  status: 'computed' | 'not-converged';
  method: StabilityEvidence['method'];
  values: ComplexEigenvalue[];
  iterations: number;
  residual: number;
} {
  const dimension = matrix.length;
  if (dimension === 1) {
    return {
      status: 'computed',
      method: 'analytic-1x1',
      values: [{ real: matrix[0]![0]!, imaginary: 0 }],
      iterations: 0,
      residual: 0,
    };
  }
  if (dimension === 2) {
    return {
      status: 'computed',
      method: 'analytic-2x2',
      values: eigenvaluesOfTwoByTwo(matrix[0]![0]!, matrix[0]![1]!, matrix[1]![0]!, matrix[1]![1]!),
      iterations: 0,
      residual: 0,
    };
  }

  const schur = reduceToUpperHessenberg(matrix);
  const scale = Math.max(1, matrixInfinityNorm(schur));
  const tolerance = Number.EPSILON * 512 * scale;
  const values: ComplexEigenvalue[] = [];
  let active = dimension - 1;
  let iterations = 0;
  let maximumDeflationResidual = 0;

  while (active >= 0 && iterations < maximumIterations) {
    if (active === 0) {
      values.push({ real: schur[0]![0]!, imaginary: 0 });
      active -= 1;
      continue;
    }
    const subdiagonal = Math.abs(schur[active]![active - 1]!);
    const localScale =
      Math.abs(schur[active - 1]![active - 1]!) + Math.abs(schur[active]![active]!);
    if (subdiagonal <= tolerance + Number.EPSILON * 64 * localScale) {
      maximumDeflationResidual = Math.max(maximumDeflationResidual, subdiagonal / scale);
      schur[active]![active - 1] = 0;
      values.push({ real: schur[active]![active]!, imaginary: 0 });
      active -= 1;
      continue;
    }
    if (active === 1) {
      values.push(
        ...eigenvaluesOfTwoByTwo(schur[0]![0]!, schur[0]![1]!, schur[1]![0]!, schur[1]![1]!),
      );
      active -= 2;
      continue;
    }
    const precedingSubdiagonal = Math.abs(schur[active - 1]![active - 2]!);
    const precedingScale =
      Math.abs(schur[active - 2]![active - 2]!) + Math.abs(schur[active - 1]![active - 1]!);
    if (precedingSubdiagonal <= tolerance + Number.EPSILON * 64 * precedingScale) {
      maximumDeflationResidual = Math.max(maximumDeflationResidual, precedingSubdiagonal / scale);
      schur[active - 1]![active - 2] = 0;
      values.push(
        ...eigenvaluesOfTwoByTwo(
          schur[active - 1]![active - 1]!,
          schur[active - 1]![active]!,
          schur[active]![active - 1]!,
          schur[active]![active]!,
        ),
      );
      active -= 2;
      continue;
    }

    const trailing = eigenvaluesOfTwoByTwo(
      schur[active - 1]![active - 1]!,
      schur[active - 1]![active]!,
      schur[active]![active - 1]!,
      schur[active]![active]!,
    );
    const realCandidates = trailing.filter((value) => value.imaginary === 0);
    const shift =
      realCandidates.length > 0
        ? realCandidates.reduce((selected, candidate) =>
            Math.abs(candidate.real - schur[active]![active]!) <
            Math.abs(selected.real - schur[active]![active]!)
              ? candidate
              : selected,
          ).real
        : (schur[active - 1]![active - 1]! + schur[active]![active]!) / 2;
    const size = active + 1;
    const shifted = Array.from({ length: size }, (_, row) =>
      Array.from(
        { length: size },
        (__, column) => schur[row]![column]! - (row === column ? shift : 0),
      ),
    );
    const { q, r } = householderQr(shifted);
    const next = multiply(r, q);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        schur[row]![column] = next[row]![column]! + (row === column ? shift : 0);
      }
    }
    iterations += 1;
  }

  if (active >= 0) {
    return {
      status: 'not-converged',
      method: 'bounded-real-schur',
      values: [],
      iterations,
      residual: Math.abs(schur[active]?.[Math.max(0, active - 1)] ?? 0) / scale,
    };
  }
  return {
    status: 'computed',
    method: 'bounded-real-schur',
    values,
    iterations,
    residual: maximumDeflationResidual,
  };
}

function validateOptions(options: ResolvedOptions, dimension: number): void {
  const invalid = (condition: boolean, message: string) => {
    if (condition) throw new ContinuationAbort('invalid-input', message);
  };
  invalid(
    dimension < 1 || dimension > CONTINUATION_BROWSER_LIMITS.maximumDimension,
    `State dimension must be between 1 and ${CONTINUATION_BROWSER_LIMITS.maximumDimension}.`,
  );
  invalid(
    !Number.isInteger(options.pointCount) ||
      options.pointCount < 2 ||
      options.pointCount > CONTINUATION_BROWSER_LIMITS.maximumPoints,
    `pointCount must be an integer between 2 and ${CONTINUATION_BROWSER_LIMITS.maximumPoints}.`,
  );
  invalid(
    !Number.isFinite(options.initialStep) || options.initialStep <= 0,
    'initialStep must be finite and positive.',
  );
  invalid(
    !Number.isFinite(options.minimumStep) || options.minimumStep <= 0,
    'minimumStep must be finite and positive.',
  );
  invalid(
    !Number.isFinite(options.maximumStep) || options.maximumStep < options.minimumStep,
    'maximumStep must be finite and no smaller than minimumStep.',
  );
  invalid(
    options.initialStep < options.minimumStep || options.initialStep > options.maximumStep,
    'initialStep must lie between minimumStep and maximumStep.',
  );
  invalid(
    options.parameterDirection !== -1 && options.parameterDirection !== 1,
    'parameterDirection must be -1 or 1.',
  );
  invalid(
    !Number.isFinite(options.newtonTolerance) || options.newtonTolerance <= 0,
    'newtonTolerance must be finite and positive.',
  );
  invalid(
    !Number.isInteger(options.maximumNewtonIterations) ||
      options.maximumNewtonIterations < 1 ||
      options.maximumNewtonIterations > CONTINUATION_BROWSER_LIMITS.maximumNewtonIterations,
    `maximumNewtonIterations must be between 1 and ${CONTINUATION_BROWSER_LIMITS.maximumNewtonIterations}.`,
  );
  invalid(
    !Number.isFinite(options.finiteDifferenceRelativeStep) ||
      options.finiteDifferenceRelativeStep <= 0,
    'finiteDifferenceRelativeStep must be finite and positive.',
  );
  invalid(
    !Number.isFinite(options.augmentedConditionLimit) || options.augmentedConditionLimit <= 1,
    'augmentedConditionLimit must be finite and greater than one.',
  );
  invalid(
    !Number.isInteger(options.maximumFunctionEvaluations) ||
      options.maximumFunctionEvaluations < 1 ||
      options.maximumFunctionEvaluations > CONTINUATION_BROWSER_LIMITS.maximumFunctionEvaluations,
    `maximumFunctionEvaluations must be between 1 and ${CONTINUATION_BROWSER_LIMITS.maximumFunctionEvaluations}.`,
  );
  invalid(
    !Number.isFinite(options.foldTangentTolerance) || options.foldTangentTolerance < 0,
    'foldTangentTolerance must be finite and nonnegative.',
  );
  invalid(
    !Number.isFinite(options.stabilityTolerance) || options.stabilityTolerance <= 0,
    'stabilityTolerance must be finite and positive.',
  );
  invalid(
    !Number.isInteger(options.maximumEigenIterations) ||
      options.maximumEigenIterations < 1 ||
      options.maximumEigenIterations > CONTINUATION_BROWSER_LIMITS.maximumEigenIterations,
    `maximumEigenIterations must be between 1 and ${CONTINUATION_BROWSER_LIMITS.maximumEigenIterations}.`,
  );
}

function publicDiagnostics(diagnostics: MutableDiagnostics): ContinuationDiagnostics {
  const noAcceptedStep = !Number.isFinite(diagnostics.minimumAcceptedStep);
  return {
    residualEvaluations: diagnostics.residualEvaluations,
    jacobianEvaluations: diagnostics.jacobianEvaluations,
    parameterDerivativeEvaluations: diagnostics.parameterDerivativeEvaluations,
    stabilityEvaluations: diagnostics.stabilityEvaluations,
    rejectedSteps: diagnostics.rejectedSteps,
    adaptedStepRange: noAcceptedStep
      ? [0, 0]
      : [diagnostics.minimumAcceptedStep, diagnostics.maximumAcceptedStep],
    limitations: [
      'Finite-precision pseudo-arclength continuation; no interval enclosure or existence proof is provided.',
      'Fold candidates use tangent turning evidence only; transversality and normal-form coefficients are not tested.',
      'Stability refers to eigenvalues of the supplied equilibrium residual interpreted as a continuous-time vector field.',
    ],
  };
}

function nearestZero(values: readonly ComplexEigenvalue[]): ComplexEigenvalue | null {
  if (values.length === 0) return null;
  const selected = values.reduce((best, value) =>
    Math.hypot(value.real, value.imaginary) < Math.hypot(best.real, best.imaginary) ? value : best,
  );
  return { ...selected };
}

/**
 * Continue an equilibrium branch with a bounded pseudo-arclength
 * predictor/corrector. All callback inputs are copied; the function itself has
 * no random or persistent state. Determinism therefore depends only on the
 * supplied callbacks being deterministic.
 */
export function continueEquilibriumBranch(
  problem: EquilibriumProblem,
  seed: ContinuationSeed,
  suppliedOptions: ContinuationOptions = {},
): ContinuationResult {
  const options = resolveOptions(suppliedOptions);
  const points: ContinuationPoint[] = [];
  const foldCandidates: FoldCandidate[] = [];
  const diagnostics: MutableDiagnostics = {
    residualEvaluations: 0,
    jacobianEvaluations: 0,
    parameterDerivativeEvaluations: 0,
    stabilityEvaluations: 0,
    rejectedSteps: 0,
    minimumAcceptedStep: Number.POSITIVE_INFINITY,
    maximumAcceptedStep: 0,
  };
  let failedStep: number | null = null;

  try {
    const dimension = seed.state.length;
    validateOptions(options, dimension);
    const initialState = validateVector(seed.state, dimension, 'Initial state');
    const initialParameter = finiteNumber(seed.parameter, 'Initial parameter');

    const evaluateResidual = (state: readonly number[], parameter: number): number[] => {
      if (diagnostics.residualEvaluations >= options.maximumFunctionEvaluations) {
        throw new ContinuationAbort(
          'evaluation-limit',
          `Residual evaluation limit ${options.maximumFunctionEvaluations} was reached.`,
        );
      }
      diagnostics.residualEvaluations += 1;
      try {
        return validateVector(
          problem.residual([...state], parameter),
          dimension,
          'Equilibrium residual',
        );
      } catch (error) {
        if (error instanceof ContinuationAbort) throw error;
        throw new ContinuationAbort(
          'evaluation-error',
          `Residual callback failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    const evaluateJacobian = (state: readonly number[], parameter: number): number[][] => {
      diagnostics.jacobianEvaluations += 1;
      if (problem.jacobian) {
        try {
          return validateMatrix(
            problem.jacobian([...state], parameter),
            dimension,
            'State Jacobian',
          );
        } catch (error) {
          if (error instanceof ContinuationAbort) throw error;
          throw new ContinuationAbort(
            'evaluation-error',
            `Jacobian callback failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      const matrix = Array.from({ length: dimension }, () => Array<number>(dimension).fill(0));
      for (let column = 0; column < dimension; column += 1) {
        const step = options.finiteDifferenceRelativeStep * Math.max(1, Math.abs(state[column]!));
        const forwardState = [...state];
        const backwardState = [...state];
        forwardState[column] += step;
        backwardState[column] -= step;
        const forward = evaluateResidual(forwardState, parameter);
        const backward = evaluateResidual(backwardState, parameter);
        for (let row = 0; row < dimension; row += 1) {
          matrix[row]![column] = (forward[row]! - backward[row]!) / (2 * step);
        }
      }
      return validateMatrix(matrix, dimension, 'Finite-difference state Jacobian');
    };

    const evaluateParameterDerivative = (state: readonly number[], parameter: number): number[] => {
      diagnostics.parameterDerivativeEvaluations += 1;
      if (problem.parameterDerivative) {
        try {
          return validateVector(
            problem.parameterDerivative([...state], parameter),
            dimension,
            'Parameter derivative',
          );
        } catch (error) {
          if (error instanceof ContinuationAbort) throw error;
          throw new ContinuationAbort(
            'evaluation-error',
            `Parameter derivative callback failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      const step = options.finiteDifferenceRelativeStep * Math.max(1, Math.abs(parameter));
      const forward = evaluateResidual(state, parameter + step);
      const backward = evaluateResidual(state, parameter - step);
      return forward.map((value, index) => (value - backward[index]!) / (2 * step));
    };

    const stabilityEvidence = (
      state: readonly number[],
      parameter: number,
      jacobian: readonly (readonly number[])[],
    ): StabilityEvidence => {
      diagnostics.stabilityEvaluations += 1;
      let status: StabilityEvidence['status'];
      let method: StabilityEvidence['method'];
      let eigenvalues: ComplexEigenvalue[];
      let iterations: number;
      let residual: number | null;
      if (problem.stabilityEigenvalues) {
        try {
          const supplied = problem.stabilityEigenvalues(
            [...state],
            parameter,
            jacobian.map((row) => [...row]),
          );
          if (supplied.length !== dimension) {
            throw new ContinuationAbort(
              'dimension-mismatch',
              `Stability callback returned ${supplied.length} eigenvalues; expected ${dimension}.`,
            );
          }
          eigenvalues = supplied.map((value, index) => ({
            real: finiteNumber(value.real, `Eigenvalue ${index} real part`),
            imaginary: finiteNumber(value.imaginary, `Eigenvalue ${index} imaginary part`),
          }));
          status = 'computed';
          method = 'caller-supplied';
          iterations = 0;
          residual = null;
        } catch (error) {
          if (error instanceof ContinuationAbort) throw error;
          throw new ContinuationAbort(
            'eigenvalue-evaluation-failed',
            `Stability callback failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        const fallback = fallbackEigenvalues(jacobian, options.maximumEigenIterations);
        status = fallback.status;
        method = fallback.method;
        eigenvalues = fallback.values.map((value, index) => ({
          real: finiteNumber(value.real, `Fallback eigenvalue ${index} real part`),
          imaginary: finiteNumber(value.imaginary, `Fallback eigenvalue ${index} imaginary part`),
        }));
        iterations = fallback.iterations;
        residual = finiteNumber(fallback.residual, 'Fallback eigenvalue residual');
      }
      const spectralAbscissa =
        status === 'computed' ? Math.max(...eigenvalues.map((value) => value.real)) : null;
      const unstableDimension =
        status === 'computed'
          ? eigenvalues.filter((value) => value.real > options.stabilityTolerance).length
          : null;
      const classification =
        spectralAbscissa === null ||
        eigenvalues.some((value) => Math.abs(value.real) <= options.stabilityTolerance)
          ? 'indeterminate'
          : spectralAbscissa < -options.stabilityTolerance
            ? 'stable'
            : 'unstable';
      return {
        status,
        method,
        eigenvalues,
        spectralAbscissa,
        unstableDimension,
        classification,
        tolerance: options.stabilityTolerance,
        iterations,
        residual,
        limitations: [
          'Finite-precision eigenvalue evidence for the state Jacobian; no spectral enclosure is provided.',
          ...(status === 'not-converged'
            ? [
                'The bounded real-Schur iteration did not converge, so no stability classification is made.',
              ]
            : []),
        ],
      };
    };

    const refineSeed = (): {
      state: number[];
      residual: number;
      iterations: number;
      jacobian: number[][];
    } => {
      const state = [...initialState];
      let residual = evaluateResidual(state, initialParameter);
      for (let iteration = 0; iteration <= options.maximumNewtonIterations; iteration += 1) {
        const residualNorm = infinityNorm(residual);
        const jacobian = evaluateJacobian(state, initialParameter);
        if (residualNorm <= options.newtonTolerance) {
          return { state, residual: residualNorm, iterations: iteration, jacobian };
        }
        if (iteration === options.maximumNewtonIterations) break;
        const solved = solveLinear(
          jacobian,
          residual.map((value) => -value),
        );
        if (!solved) {
          throw new ContinuationAbort(
            'singular-linear-system',
            'Initial equilibrium correction encountered a singular state Jacobian.',
          );
        }
        for (let index = 0; index < dimension; index += 1) {
          state[index] += solved.solution[index]!;
          finiteNumber(state[index]!, `Corrected initial state ${index}`);
        }
        residual = evaluateResidual(state, initialParameter);
      }
      throw new ContinuationAbort(
        'newton-nonconvergence',
        `Initial equilibrium did not reach residual tolerance ${options.newtonTolerance}.`,
      );
    };

    const refined = refineSeed();
    const initialParameterDerivative = evaluateParameterDerivative(refined.state, initialParameter);
    let tangent: number[];
    if (seed.tangent) {
      const tangentState = validateVector(seed.tangent.state, dimension, 'Initial tangent state');
      const tangentParameter = finiteNumber(seed.tangent.parameter, 'Initial tangent parameter');
      tangent = [...tangentState, tangentParameter];
      const tangentNorm = euclideanNorm(tangent);
      if (tangentNorm <= Number.EPSILON) {
        throw new ContinuationAbort('invalid-input', 'Initial tangent must be nonzero.');
      }
      tangent = tangent.map((value) => value / tangentNorm);
      const nullResidual = refined.jacobian.map(
        (row, rowIndex) =>
          dot(row, tangent.slice(0, dimension)) +
          initialParameterDerivative[rowIndex]! * tangent[dimension]!,
      );
      if (infinityNorm(nullResidual) > Math.sqrt(options.newtonTolerance)) {
        throw new ContinuationAbort(
          'invalid-input',
          'Initial tangent does not satisfy the augmented Jacobian null equation.',
        );
      }
    } else {
      const tangentState = solveLinear(
        refined.jacobian,
        initialParameterDerivative.map((value) => -value * options.parameterDirection),
      );
      if (!tangentState) {
        throw new ContinuationAbort(
          'singular-linear-system',
          'Cannot construct an initial tangent from the state Jacobian; provide a regular seed or an explicit tangent.',
        );
      }
      tangent = [...tangentState.solution, options.parameterDirection];
      const tangentNorm = euclideanNorm(tangent);
      tangent = tangent.map((value) => value / tangentNorm);
    }

    const initialAugmented = refined.jacobian.map((row, rowIndex) => [
      ...row,
      initialParameterDerivative[rowIndex]!,
    ]);
    initialAugmented.push([...tangent]);
    const initialAugmentedCondition = conditionEvidence(initialAugmented);
    if (
      initialAugmentedCondition.conditionInfinity === null ||
      initialAugmentedCondition.conditionInfinity > options.augmentedConditionLimit
    ) {
      throw new ContinuationAbort(
        'condition-limit',
        'Initial augmented Jacobian is singular or exceeds the declared condition limit.',
      );
    }
    const initialStability = stabilityEvidence(refined.state, initialParameter, refined.jacobian);
    points.push({
      index: 0,
      arclength: 0,
      parameter: initialParameter,
      state: [...refined.state],
      tangent: { state: tangent.slice(0, dimension), parameter: tangent[dimension]! },
      evidence: {
        residualInfinityNorm: refined.residual,
        pseudoArclengthResidual: 0,
        newtonIterations: refined.iterations,
        acceptedPredictorStep: 0,
        rejectedAttemptsBeforeAcceptance: 0,
        stateJacobianSource: problem.jacobian ? 'caller-supplied' : 'finite-difference',
        parameterDerivativeSource: problem.parameterDerivative
          ? 'caller-supplied'
          : 'finite-difference',
        stateJacobianCondition: conditionEvidence(refined.jacobian),
        augmentedJacobianCondition: initialAugmentedCondition,
        stability: initialStability,
      },
    });

    let step = options.initialStep;
    for (let pointIndex = 1; pointIndex < options.pointCount; pointIndex += 1) {
      failedStep = step;
      const previous = points.at(-1)!;
      const previousCombined = [...previous.state, previous.parameter];
      const previousTangent = [...previous.tangent.state, previous.tangent.parameter];
      let attemptStep = step;
      let rejectedBeforeAcceptance = 0;
      let accepted:
        | {
            combined: number[];
            residualNorm: number;
            arclengthResidual: number;
            iterations: number;
            jacobian: number[][];
            parameterDerivative: number[];
            augmentedCondition: MatrixConditionEvidence;
            tangent: number[];
          }
        | undefined;
      let lastRejectionCode: ContinuationFailureCode = 'newton-nonconvergence';
      let lastRejectionMessage = 'Pseudo-arclength Newton corrector did not converge.';

      while (!accepted) {
        const predictor = previousCombined.map(
          (value, index) => value + attemptStep * previousTangent[index]!,
        );
        predictor.forEach((value, index) => finiteNumber(value, `Predictor coordinate ${index}`));
        const corrected = [...predictor];
        let finalJacobian: number[][] | undefined;
        let finalParameterDerivative: number[] | undefined;
        let finalAugmentedCondition: MatrixConditionEvidence | undefined;
        let residualNorm = Number.POSITIVE_INFINITY;
        let arclengthResidual = Number.POSITIVE_INFINITY;
        let iterations = 0;
        let rejectedCode: ContinuationFailureCode | undefined;
        let rejectedMessage: string | undefined;

        for (let iteration = 0; iteration <= options.maximumNewtonIterations; iteration += 1) {
          const state = corrected.slice(0, dimension);
          const parameter = corrected[dimension]!;
          const residual = evaluateResidual(state, parameter);
          residualNorm = infinityNorm(residual);
          arclengthResidual = dot(
            previousTangent,
            corrected.map((value, index) => value - predictor[index]!),
          );
          const jacobian = evaluateJacobian(state, parameter);
          const parameterDerivative = evaluateParameterDerivative(state, parameter);
          const augmented = jacobian.map((row, rowIndex) => [
            ...row,
            parameterDerivative[rowIndex]!,
          ]);
          augmented.push([...previousTangent]);
          const augmentedCondition = conditionEvidence(augmented);
          finalJacobian = jacobian;
          finalParameterDerivative = parameterDerivative;
          finalAugmentedCondition = augmentedCondition;
          iterations = iteration;

          if (
            residualNorm <= options.newtonTolerance &&
            Math.abs(arclengthResidual) <= options.newtonTolerance
          ) {
            break;
          }
          if (iteration === options.maximumNewtonIterations) {
            rejectedCode = 'newton-nonconvergence';
            rejectedMessage = `Corrector exceeded ${options.maximumNewtonIterations} Newton iterations.`;
            break;
          }
          if (
            augmentedCondition.conditionInfinity === null ||
            augmentedCondition.conditionInfinity > options.augmentedConditionLimit
          ) {
            rejectedCode = 'condition-limit';
            rejectedMessage = 'Augmented Newton Jacobian exceeded the declared condition limit.';
            break;
          }
          const solved = solveLinear(augmented, [
            ...residual.map((value) => -value),
            -arclengthResidual,
          ]);
          if (!solved) {
            rejectedCode = 'singular-linear-system';
            rejectedMessage = 'Augmented Newton Jacobian was singular.';
            break;
          }
          for (let index = 0; index < corrected.length; index += 1) {
            corrected[index] += solved.solution[index]!;
            finiteNumber(corrected[index]!, `Newton coordinate ${index}`);
          }
        }

        if (!rejectedCode && finalJacobian && finalParameterDerivative && finalAugmentedCondition) {
          const tangentMatrix = finalJacobian.map((row, rowIndex) => [
            ...row,
            finalParameterDerivative[rowIndex]!,
          ]);
          tangentMatrix.push([...previousTangent]);
          const tangentRightHandSide = [...Array<number>(dimension).fill(0), 1];
          const solvedTangent = solveLinear(tangentMatrix, tangentRightHandSide);
          if (!solvedTangent) {
            rejectedCode = 'singular-linear-system';
            rejectedMessage = 'The oriented tangent system was singular after correction.';
          } else if (
            solvedTangent.condition.conditionInfinity === null ||
            solvedTangent.condition.conditionInfinity > options.augmentedConditionLimit
          ) {
            rejectedCode = 'condition-limit';
            rejectedMessage = 'The oriented tangent system exceeded the declared condition limit.';
          } else {
            let nextTangent = solvedTangent.solution;
            const tangentNorm = euclideanNorm(nextTangent);
            if (!Number.isFinite(tangentNorm) || tangentNorm <= Number.EPSILON) {
              rejectedCode = 'singular-linear-system';
              rejectedMessage = 'The oriented tangent has zero or non-finite norm.';
            } else {
              nextTangent = nextTangent.map((value) => value / tangentNorm);
              if (dot(nextTangent, previousTangent) < 0) {
                nextTangent = nextTangent.map((value) => -value);
              }
              accepted = {
                combined: corrected,
                residualNorm,
                arclengthResidual,
                iterations,
                jacobian: finalJacobian,
                parameterDerivative: finalParameterDerivative,
                augmentedCondition: solvedTangent.condition,
                tangent: nextTangent,
              };
              break;
            }
          }
        }

        lastRejectionCode = rejectedCode ?? 'newton-nonconvergence';
        lastRejectionMessage = rejectedMessage ?? lastRejectionMessage;
        diagnostics.rejectedSteps += 1;
        rejectedBeforeAcceptance += 1;
        const reducedStep = attemptStep * 0.5;
        if (reducedStep < options.minimumStep) {
          throw new ContinuationAbort(
            lastRejectionCode,
            `${lastRejectionMessage} Step reduction would pass minimumStep ${options.minimumStep}.`,
          );
        }
        attemptStep = reducedStep;
      }

      const acceptedState = accepted.combined.slice(0, dimension);
      const acceptedParameter = accepted.combined[dimension]!;
      const displacement = accepted.combined.map(
        (value, index) => value - previousCombined[index]!,
      );
      const actualArclength = euclideanNorm(displacement);
      const stability = stabilityEvidence(acceptedState, acceptedParameter, accepted.jacobian);
      const point: ContinuationPoint = {
        index: pointIndex,
        arclength: previous.arclength + actualArclength,
        parameter: acceptedParameter,
        state: acceptedState,
        tangent: {
          state: accepted.tangent.slice(0, dimension),
          parameter: accepted.tangent[dimension]!,
        },
        evidence: {
          residualInfinityNorm: accepted.residualNorm,
          pseudoArclengthResidual: Math.abs(accepted.arclengthResidual),
          newtonIterations: accepted.iterations,
          acceptedPredictorStep: attemptStep,
          rejectedAttemptsBeforeAcceptance: rejectedBeforeAcceptance,
          stateJacobianSource: problem.jacobian ? 'caller-supplied' : 'finite-difference',
          parameterDerivativeSource: problem.parameterDerivative
            ? 'caller-supplied'
            : 'finite-difference',
          stateJacobianCondition: conditionEvidence(accepted.jacobian),
          augmentedJacobianCondition: accepted.augmentedCondition,
          stability,
        },
      };
      points.push(point);
      diagnostics.minimumAcceptedStep = Math.min(diagnostics.minimumAcceptedStep, attemptStep);
      diagnostics.maximumAcceptedStep = Math.max(diagnostics.maximumAcceptedStep, attemptStep);

      const before = previous.tangent.parameter;
      const after = point.tangent.parameter;
      const signChange = before * after < 0;
      const nearTurning =
        Math.min(Math.abs(before), Math.abs(after)) <= options.foldTangentTolerance;
      if (signChange || nearTurning) {
        const denominator = Math.abs(before) + Math.abs(after);
        const fraction = denominator <= Number.EPSILON ? 0.5 : Math.abs(before) / denominator;
        const stateEstimate = previous.state.map(
          (value, index) => value + fraction * (point.state[index]! - value),
        );
        const parameterEstimate =
          previous.parameter + fraction * (point.parameter - previous.parameter);
        const previousCandidate = foldCandidates.at(-1);
        if (previousCandidate?.betweenPointIndices[1] !== pointIndex - 1) {
          foldCandidates.push({
            kind: 'fold-candidate',
            betweenPointIndices: [pointIndex - 1, pointIndex],
            arclengthEstimate:
              previous.arclength + fraction * (point.arclength - previous.arclength),
            parameterEstimate,
            stateEstimate,
            evidence: {
              tangentParameterBefore: before,
              tangentParameterAfter: after,
              eigenvalueNearestZeroBefore: nearestZero(previous.evidence.stability.eigenvalues),
              eigenvalueNearestZeroAfter: nearestZero(point.evidence.stability.eigenvalues),
            },
            limitations: [
              'Candidate from a parameter-tangent turning point in a finite-precision branch.',
              'No interval enclosure, transversality test, or saddle-node normal-form coefficient is supplied.',
            ],
          });
        }
      }

      step =
        accepted.iterations <= 3
          ? Math.min(options.maximumStep, attemptStep * 1.35)
          : accepted.iterations >= Math.max(5, options.maximumNewtonIterations - 2)
            ? Math.max(options.minimumStep, attemptStep * 0.7)
            : attemptStep;
      failedStep = null;
    }

    return {
      ok: true,
      points,
      foldCandidates,
      diagnostics: publicDiagnostics(diagnostics),
    };
  } catch (error) {
    const failure =
      error instanceof ContinuationAbort
        ? error
        : new ContinuationAbort(
            'evaluation-error',
            error instanceof Error ? error.message : String(error),
          );
    return {
      ok: false,
      code: failure.code,
      message: failure.message,
      partialPoints: points,
      failedStep,
      diagnostics: publicDiagnostics(diagnostics),
    };
  }
}
