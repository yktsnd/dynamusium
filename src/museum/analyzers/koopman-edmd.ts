/**
 * Finite-sample Extended Dynamic Mode Decomposition (EDMD).
 *
 * This module estimates a dictionary-dependent, finite-dimensional operator
 * from one-step trajectory pairs. Its eigenpairs are numerical EDMD modes;
 * they are not a claim about the complete Koopman spectrum, continuous
 * spectrum, or invariant subspaces of the underlying dynamical system.
 */

export const EDMD_BROWSER_LIMITS = Object.freeze({
  maximumSnapshots: 8_192,
  maximumObservables: 32,
  maximumDictionaryTerms: 12,
  minimumHoldoutPairs: 8,
  maximumEigenIterations: 600,
});

export interface EdmdObservable {
  id: string;
  label: string;
  unit: string;
  values: readonly number[];
}

export interface EdmdDictionaryTerm {
  id: string;
  /** Human-readable mathematical definition, for example `q` or `q^2 + p^2`. */
  definition: string;
  /** Stable source or review reference. Use `declared-inline` when appropriate. */
  source: string;
  evaluate: (snapshot: Readonly<Record<string, number>>) => number;
}

export interface EdmdOptions {
  /** Number of final one-step pairs reserved strictly for validation. */
  holdoutPairs?: number;
  /** Dimensionless Tikhonov parameter applied after feature RMS scaling. */
  ridge?: number;
  /** Relative cutoff used to determine the unregularized numerical rank. */
  rankTolerance?: number;
  /** Relative tolerance for departure from a constant sampling interval. */
  sampleIntervalTolerance?: number;
}

export interface EdmdRequest {
  times: readonly number[];
  observables: readonly EdmdObservable[];
  dictionary: readonly EdmdDictionaryTerm[];
  options?: EdmdOptions;
}

export interface ComplexValue {
  real: number;
  imaginary: number;
}

export interface EdmdMode {
  id: string;
  /** Eigenvalue of the finite-dimensional one-step EDMD operator. */
  discreteEigenvalue: ComplexValue;
  eigenfunctionCoefficients: Array<{
    dictionaryTermId: string;
    value: ComplexValue;
  }>;
  relativeEigenResidual: number;
  /** Principal-branch log-magnitude divided by sample interval. */
  decayRate: number | null;
  /** Principal-branch argument divided by sample interval, in radians per model time. */
  angularFrequency: number | null;
  /** Principal-branch angular frequency divided by 2 pi. */
  cyclicFrequency: number | null;
  continuousRateStatus: 'finite-principal-branch' | 'undefined-zero-eigenvalue';
}

export interface EdmdSuccess {
  ok: true;
  method: 'finite-sample-ridge-edmd';
  interpretation: string;
  sampleInterval: number;
  trainingPairs: number;
  holdoutPairs: number;
  trainingResidual: number;
  holdoutResidual: number;
  conditioning: {
    numericalRank: number;
    dictionaryDimension: number;
    snapshotConditionNumber: number;
    gramConditionNumber: number;
    gramEigenvalues: number[];
    featureScales: number[];
    ridge: number;
    rankTolerance: number;
  };
  operator: {
    /** Coefficient-space EDMD matrix in the RMS-scaled dictionary basis. */
    matrix: number[][];
    orientation: 'coefficient-action';
  };
  modes: EdmdMode[];
  provenance: {
    observableOrder: Array<{ id: string; label: string; unit: string }>;
    dictionaryOrder: Array<{ id: string; definition: string; source: string }>;
    firstSampleTime: number;
    lastSampleTime: number;
    trainingPairRange: readonly [number, number];
    holdoutPairRange: readonly [number, number];
  };
}

export type EdmdFailureCode =
  | 'invalid-input'
  | 'browser-limit-exceeded'
  | 'insufficient-samples'
  | 'insufficient-holdout'
  | 'non-uniform-sampling'
  | 'non-finite-input'
  | 'dictionary-evaluation-failure'
  | 'non-finite-dictionary'
  | 'rank-deficient'
  | 'numerical-failure'
  | 'eigensolver-failure';

export interface EdmdFailure {
  ok: false;
  code: EdmdFailureCode;
  message: string;
  details: Record<string, number | string>;
}

export type EdmdResult = EdmdSuccess | EdmdFailure;

interface Complex {
  real: number;
  imaginary: number;
}

interface SymmetricEigenResult {
  values: number[];
  vectors: number[][];
  converged: boolean;
}

const ZERO: Complex = { real: 0, imaginary: 0 };

function failure(
  code: EdmdFailureCode,
  message: string,
  details: Record<string, number | string> = {},
): EdmdFailure {
  return { ok: false, code, message, details };
}

function identity(size: number): number[][] {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0)),
  );
}

function zeroMatrix(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
}

function matrixMultiply(left: readonly number[][], right: readonly number[][]): number[][] {
  const rows = left.length;
  const shared = left[0]?.length ?? 0;
  const columns = right[0]?.length ?? 0;
  const output = zeroMatrix(rows, columns);
  for (let row = 0; row < rows; row += 1) {
    for (let inner = 0; inner < shared; inner += 1) {
      const leftValue = left[row]?.[inner];
      if (leftValue === undefined) throw new Error('Matrix row is incomplete.');
      for (let column = 0; column < columns; column += 1) {
        const rightValue = right[inner]?.[column];
        const previous = output[row]?.[column];
        if (rightValue === undefined || previous === undefined) {
          throw new Error('Matrix dimensions are inconsistent.');
        }
        output[row]![column] = previous + leftValue * rightValue;
      }
    }
  }
  return output;
}

/** Deterministic Jacobi diagonalization for the small symmetric Gram matrix. */
function symmetricEigen(matrix: readonly number[][]): SymmetricEigenResult {
  const size = matrix.length;
  const values = matrix.map((row) => [...row]);
  const vectors = identity(size);
  const scale = Math.max(1, ...values.flatMap((row) => row.map((value) => Math.abs(value))));
  const tolerance = 64 * Number.EPSILON * scale;
  const iterations = Math.max(1, 80 * size * size);
  let converged = size <= 1;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let pivotRow = 0;
    let pivotColumn = 0;
    let largest = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = row + 1; column < size; column += 1) {
        const candidate = Math.abs(values[row]?.[column] ?? Number.NaN);
        if (candidate > largest) {
          largest = candidate;
          pivotRow = row;
          pivotColumn = column;
        }
      }
    }
    if (largest <= tolerance) {
      converged = true;
      break;
    }

    const app = values[pivotRow]?.[pivotRow];
    const aqq = values[pivotColumn]?.[pivotColumn];
    const apq = values[pivotRow]?.[pivotColumn];
    if (app === undefined || aqq === undefined || apq === undefined || apq === 0) {
      return { values: [], vectors: [], converged: false };
    }
    const tau = (aqq - app) / (2 * apq);
    const tangent = tau === 0 ? 1 : Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent);
    const sine = tangent * cosine;

    for (let index = 0; index < size; index += 1) {
      if (index === pivotRow || index === pivotColumn) continue;
      const aip = values[index]?.[pivotRow];
      const aiq = values[index]?.[pivotColumn];
      if (aip === undefined || aiq === undefined) {
        return { values: [], vectors: [], converged: false };
      }
      const rotatedP = cosine * aip - sine * aiq;
      const rotatedQ = sine * aip + cosine * aiq;
      values[index]![pivotRow] = rotatedP;
      values[pivotRow]![index] = rotatedP;
      values[index]![pivotColumn] = rotatedQ;
      values[pivotColumn]![index] = rotatedQ;
    }
    values[pivotRow]![pivotRow] =
      cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    values[pivotColumn]![pivotColumn] =
      sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    values[pivotRow]![pivotColumn] = 0;
    values[pivotColumn]![pivotRow] = 0;

    for (let row = 0; row < size; row += 1) {
      const vip = vectors[row]?.[pivotRow];
      const viq = vectors[row]?.[pivotColumn];
      if (vip === undefined || viq === undefined) {
        return { values: [], vectors: [], converged: false };
      }
      vectors[row]![pivotRow] = cosine * vip - sine * viq;
      vectors[row]![pivotColumn] = sine * vip + cosine * viq;
    }
  }

  const ordering = Array.from({ length: size }, (_, index) => index).sort(
    (left, right) => (values[right]?.[right] ?? 0) - (values[left]?.[left] ?? 0),
  );
  return {
    values: ordering.map((index) => values[index]?.[index] ?? Number.NaN),
    vectors: vectors.map((row) => ordering.map((index) => row[index] ?? Number.NaN)),
    converged,
  };
}

function complex(real: number, imaginary = 0): Complex {
  return { real, imaginary };
}

function add(left: Complex, right: Complex): Complex {
  return complex(left.real + right.real, left.imaginary + right.imaginary);
}

function subtract(left: Complex, right: Complex): Complex {
  return complex(left.real - right.real, left.imaginary - right.imaginary);
}

function multiply(left: Complex, right: Complex): Complex {
  return complex(
    left.real * right.real - left.imaginary * right.imaginary,
    left.real * right.imaginary + left.imaginary * right.real,
  );
}

function divide(left: Complex, right: Complex): Complex {
  const denominator = right.real * right.real + right.imaginary * right.imaginary;
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    return complex(Number.NaN, Number.NaN);
  }
  return complex(
    (left.real * right.real + left.imaginary * right.imaginary) / denominator,
    (left.imaginary * right.real - left.real * right.imaginary) / denominator,
  );
}

function magnitude(value: Complex): number {
  return Math.hypot(value.real, value.imaginary);
}

function complexSquareRoot(value: Complex): Complex {
  const radius = magnitude(value);
  const real = Math.sqrt(Math.max(0, (radius + value.real) / 2));
  const imaginaryMagnitude = Math.sqrt(Math.max(0, (radius - value.real) / 2));
  const imaginary = value.imaginary < 0 ? -imaginaryMagnitude : imaginaryMagnitude;
  return complex(real, imaginary);
}

function polynomialValue(coefficients: readonly number[], point: Complex): Complex {
  let value = complex(coefficients[0] ?? 0);
  for (let index = 1; index < coefficients.length; index += 1) {
    value = add(multiply(value, point), complex(coefficients[index] ?? Number.NaN));
  }
  return value;
}

function polynomialAndDerivative(
  coefficients: readonly number[],
  point: Complex,
): { value: Complex; derivative: Complex } {
  let value = complex(coefficients[0] ?? 0);
  let derivative = ZERO;
  for (let index = 1; index < coefficients.length; index += 1) {
    derivative = add(multiply(derivative, point), value);
    value = add(multiply(value, point), complex(coefficients[index] ?? Number.NaN));
  }
  return { value, derivative };
}

function characteristicPolynomial(matrix: readonly number[][]): number[] {
  const size = matrix.length;
  const coefficients = [1];
  let accumulator = identity(size);
  for (let order = 1; order <= size; order += 1) {
    const product = matrixMultiply(matrix, accumulator);
    let trace = 0;
    for (let index = 0; index < size; index += 1) trace += product[index]?.[index] ?? 0;
    const coefficient = -trace / order;
    coefficients.push(coefficient);
    accumulator = product;
    for (let index = 0; index < size; index += 1) {
      const diagonal = accumulator[index]?.[index];
      if (diagonal === undefined) throw new Error('Characteristic matrix is incomplete.');
      accumulator[index]![index] = diagonal + coefficient;
    }
  }
  return coefficients;
}

function analyticEigenvalues(matrix: readonly number[][]): Complex[] | null {
  const size = matrix.length;
  if (size === 1) return [complex(matrix[0]?.[0] ?? Number.NaN)];
  if (size !== 2) return null;
  const a = matrix[0]?.[0];
  const b = matrix[0]?.[1];
  const c = matrix[1]?.[0];
  const d = matrix[1]?.[1];
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  const trace = a + d;
  const discriminant = complex(trace * trace - 4 * (a * d - b * c));
  const root = complexSquareRoot(discriminant);
  return [
    complex((trace + root.real) / 2, root.imaginary / 2),
    complex((trace - root.real) / 2, -root.imaginary / 2),
  ];
}

/** Aberth iteration on the characteristic polynomial for dimensions 3--12. */
function polynomialEigenvalues(matrix: readonly number[][]): Complex[] | null {
  const analytic = analyticEigenvalues(matrix);
  if (analytic) return analytic;
  const coefficients = characteristicPolynomial(matrix);
  if (!coefficients.every(Number.isFinite)) return null;
  const degree = matrix.length;
  let radius = 1;
  for (let order = 1; order <= degree; order += 1) {
    const coefficient = Math.abs(coefficients[order] ?? 0);
    if (coefficient > 0) radius = Math.max(radius, 2 * coefficient ** (1 / order));
  }
  let roots = Array.from({ length: degree }, (_, index) => {
    const angle = (2 * Math.PI * (index + 0.375)) / degree;
    const stagger = 1 + (0.025 * index) / degree;
    return complex(radius * stagger * Math.cos(angle), radius * stagger * Math.sin(angle));
  });
  const tolerance = 2e-12;
  let converged = false;

  for (let iteration = 0; iteration < EDMD_BROWSER_LIMITS.maximumEigenIterations; iteration += 1) {
    let largestCorrection = 0;
    const next = roots.map((root, rootIndex) => {
      const evaluated = polynomialAndDerivative(coefficients, root);
      if (magnitude(evaluated.derivative) <= Number.EPSILON) {
        const perturbation = 1e-10 * (rootIndex + 1);
        return add(root, complex(perturbation, -perturbation));
      }
      const newton = divide(evaluated.value, evaluated.derivative);
      let repulsion = ZERO;
      for (let comparison = 0; comparison < roots.length; comparison += 1) {
        if (comparison === rootIndex) continue;
        const separation = subtract(root, roots[comparison] ?? ZERO);
        if (magnitude(separation) <= Number.EPSILON) continue;
        repulsion = add(repulsion, divide(complex(1), separation));
      }
      const correction = divide(newton, subtract(complex(1), multiply(newton, repulsion)));
      largestCorrection = Math.max(largestCorrection, magnitude(correction));
      return subtract(root, correction);
    });
    roots = next;
    if (largestCorrection <= tolerance * Math.max(1, ...roots.map(magnitude))) {
      converged = true;
      break;
    }
  }
  if (!converged || roots.some((root) => !Number.isFinite(root.real + root.imaginary))) {
    return null;
  }
  const coefficientScale = coefficients.reduce((sum, value) => sum + Math.abs(value), 0);
  for (const root of roots) {
    const residual = magnitude(polynomialValue(coefficients, root));
    const scale = Math.max(1, coefficientScale * Math.max(1, magnitude(root)) ** degree);
    if (residual / scale > 1e-8) return null;
  }
  return roots.sort((left, right) => right.real - left.real || right.imaginary - left.imaginary);
}

function solveComplex(matrix: readonly Complex[][], vector: readonly Complex[]): Complex[] | null {
  const size = matrix.length;
  const values = matrix.map((row) => row.map((value) => ({ ...value })));
  const right = vector.map((value) => ({ ...value }));
  const scale = Math.max(1, ...values.flatMap((row) => row.map(magnitude)));
  const pivotTolerance = 1e-14 * scale;

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    let pivotMagnitude = magnitude(values[pivot]?.[pivot] ?? ZERO);
    for (let row = pivot + 1; row < size; row += 1) {
      const candidate = magnitude(values[row]?.[pivot] ?? ZERO);
      if (candidate > pivotMagnitude) {
        pivotMagnitude = candidate;
        pivotRow = row;
      }
    }
    if (pivotMagnitude <= pivotTolerance) return null;
    if (pivotRow !== pivot) {
      [values[pivot], values[pivotRow]] = [values[pivotRow]!, values[pivot]!];
      [right[pivot], right[pivotRow]] = [right[pivotRow]!, right[pivot]!];
    }
    const diagonal = values[pivot]?.[pivot];
    if (!diagonal) return null;
    for (let row = pivot + 1; row < size; row += 1) {
      const entry = values[row]?.[pivot];
      if (!entry) return null;
      const factor = divide(entry, diagonal);
      for (let column = pivot; column < size; column += 1) {
        const current = values[row]?.[column];
        const source = values[pivot]?.[column];
        if (!current || !source) return null;
        values[row]![column] = subtract(current, multiply(factor, source));
      }
      const rightValue = right[row];
      const pivotValue = right[pivot];
      if (!rightValue || !pivotValue) return null;
      right[row] = subtract(rightValue, multiply(factor, pivotValue));
    }
  }

  const solution = Array.from({ length: size }, () => ZERO);
  for (let row = size - 1; row >= 0; row -= 1) {
    let remainder = right[row];
    if (!remainder) return null;
    for (let column = row + 1; column < size; column += 1) {
      const coefficient = values[row]?.[column];
      const known = solution[column];
      if (!coefficient || !known) return null;
      remainder = subtract(remainder, multiply(coefficient, known));
    }
    const diagonal = values[row]?.[row];
    if (!diagonal) return null;
    solution[row] = divide(remainder, diagonal);
  }
  return solution;
}

function normalizeComplexVector(vector: readonly Complex[]): Complex[] | null {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + magnitude(value) ** 2, 0));
  if (!(norm > 0) || !Number.isFinite(norm)) return null;
  let normalized = vector.map((value) => complex(value.real / norm, value.imaginary / norm));
  let anchor = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    if (magnitude(normalized[index] ?? ZERO) > magnitude(normalized[anchor] ?? ZERO))
      anchor = index;
  }
  const anchorValue = normalized[anchor] ?? ZERO;
  const phase = Math.atan2(anchorValue.imaginary, anchorValue.real);
  const rotation = complex(Math.cos(-phase), Math.sin(-phase));
  normalized = normalized.map((value) => multiply(value, rotation));
  if ((normalized[anchor]?.real ?? 0) < 0) {
    normalized = normalized.map((value) => complex(-value.real, -value.imaginary));
  }
  return normalized;
}

function analyticEigenvector(matrix: readonly number[][], eigenvalue: Complex): Complex[] | null {
  if (matrix.length === 1) return [complex(1)];
  if (matrix.length !== 2) return null;
  const a = matrix[0]?.[0];
  const b = matrix[0]?.[1];
  const c = matrix[1]?.[0];
  const d = matrix[1]?.[1];
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  const first = [complex(b), subtract(eigenvalue, complex(a))];
  const second = [subtract(eigenvalue, complex(d)), complex(c)];
  const firstNorm = first.reduce((sum, value) => sum + magnitude(value) ** 2, 0);
  const secondNorm = second.reduce((sum, value) => sum + magnitude(value) ** 2, 0);
  return normalizeComplexVector(firstNorm >= secondNorm ? first : second);
}

function inverseIterationEigenvector(
  matrix: readonly number[][],
  eigenvalue: Complex,
  modeIndex: number,
): Complex[] | null {
  const analytic = analyticEigenvector(matrix, eigenvalue);
  if (analytic) return analytic;
  const size = matrix.length;
  const matrixScale = Math.max(1, ...matrix.flatMap((row) => row.map(Math.abs)));
  const offset = 1e-9 * matrixScale;
  const shifted = matrix.map((row, rowIndex) =>
    row.map((value, columnIndex) =>
      rowIndex === columnIndex
        ? subtract(complex(value), add(eigenvalue, complex(offset, 0.317 * offset)))
        : complex(value),
    ),
  );
  let vector = Array.from({ length: size }, (_, index) =>
    complex(
      Math.cos((index + 1) * (modeIndex + 1)),
      Math.sin((index + 1) * (modeIndex + 1) * 0.73),
    ),
  );
  vector = normalizeComplexVector(vector) ?? vector;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const solved = solveComplex(shifted, vector);
    if (!solved) return null;
    const normalized = normalizeComplexVector(solved);
    if (!normalized) return null;
    vector = normalized;
  }
  return vector;
}

function relativeEigenResidual(
  matrix: readonly number[][],
  eigenvalue: Complex,
  vector: readonly Complex[],
): number {
  let squaredResidual = 0;
  let squaredScale = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    let action = ZERO;
    for (let column = 0; column < matrix.length; column += 1) {
      action = add(
        action,
        multiply(complex(matrix[row]?.[column] ?? Number.NaN), vector[column] ?? ZERO),
      );
    }
    const expected = multiply(eigenvalue, vector[row] ?? ZERO);
    squaredResidual += magnitude(subtract(action, expected)) ** 2;
    squaredScale += magnitude(action) ** 2 + magnitude(expected) ** 2;
  }
  return Math.sqrt(squaredResidual / Math.max(Number.EPSILON, squaredScale));
}

function predictionResidual(
  features: readonly number[][],
  scales: readonly number[],
  operator: readonly number[][],
  firstPair: number,
  pairCount: number,
): number {
  let squaredError = 0;
  let squaredScale = 0;
  for (let pair = firstPair; pair < firstPair + pairCount; pair += 1) {
    for (let output = 0; output < operator.length; output += 1) {
      const actual = (features[pair + 1]?.[output] ?? Number.NaN) / (scales[output] ?? Number.NaN);
      let predicted = 0;
      for (let input = 0; input < operator.length; input += 1) {
        const feature = (features[pair]?.[input] ?? Number.NaN) / (scales[input] ?? Number.NaN);
        predicted += (operator[input]?.[output] ?? Number.NaN) * feature;
      }
      const error = actual - predicted;
      squaredError += error * error;
      squaredScale += actual * actual;
    }
  }
  return Math.sqrt(squaredError / Math.max(Number.EPSILON, squaredScale));
}

function uniqueNonempty(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0) && new Set(values).size === values.length;
}

/**
 * Estimate a finite-dimensional EDMD operator from an explicitly supplied
 * dictionary and a strictly uniform, finite trajectory. All rejected inputs
 * return typed failures; the implementation never downsamples or repairs data.
 */
export function analyzeFiniteEdmd(request: EdmdRequest): EdmdResult {
  const { times, observables, dictionary } = request;
  if (times.length > EDMD_BROWSER_LIMITS.maximumSnapshots) {
    return failure('browser-limit-exceeded', 'EDMD snapshot count exceeds the browser budget.', {
      actual: times.length,
      maximum: EDMD_BROWSER_LIMITS.maximumSnapshots,
    });
  }
  if (observables.length > EDMD_BROWSER_LIMITS.maximumObservables) {
    return failure('browser-limit-exceeded', 'EDMD observable count exceeds the browser budget.', {
      actual: observables.length,
      maximum: EDMD_BROWSER_LIMITS.maximumObservables,
    });
  }
  if (dictionary.length > EDMD_BROWSER_LIMITS.maximumDictionaryTerms) {
    return failure('browser-limit-exceeded', 'EDMD dictionary size exceeds the browser budget.', {
      actual: dictionary.length,
      maximum: EDMD_BROWSER_LIMITS.maximumDictionaryTerms,
    });
  }
  if (observables.length === 0 || dictionary.length === 0) {
    return failure(
      'invalid-input',
      'EDMD requires at least one observable and one dictionary term.',
    );
  }
  if (!uniqueNonempty(observables.map((observable) => observable.id))) {
    return failure('invalid-input', 'Observable identifiers must be nonempty and unique.');
  }
  if (
    !uniqueNonempty(dictionary.map((term) => term.id)) ||
    dictionary.some((term) => term.definition.trim() === '' || term.source.trim() === '')
  ) {
    return failure(
      'invalid-input',
      'Dictionary identifiers must be unique, and definitions and sources must be nonempty.',
    );
  }
  if (times.length < 3) {
    return failure('insufficient-samples', 'EDMD requires at least three trajectory snapshots.', {
      snapshots: times.length,
    });
  }
  if (!times.every(Number.isFinite)) {
    return failure('non-finite-input', 'Trajectory times contain a non-finite value.');
  }
  for (let index = 1; index < times.length; index += 1) {
    if (!((times[index] ?? Number.NaN) > (times[index - 1] ?? Number.NaN))) {
      return failure('invalid-input', 'Trajectory times must be strictly increasing.', { index });
    }
  }
  for (const observable of observables) {
    if (observable.values.length !== times.length) {
      return failure('invalid-input', 'Observable length does not match the time array.', {
        observable: observable.id,
        values: observable.values.length,
        times: times.length,
      });
    }
    const nonfinite = observable.values.findIndex((value) => !Number.isFinite(value));
    if (nonfinite >= 0) {
      return failure('non-finite-input', 'Observable contains a non-finite value.', {
        observable: observable.id,
        index: nonfinite,
      });
    }
  }

  const intervals = times.slice(1).map((time, index) => time - (times[index] ?? Number.NaN));
  const sampleInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const intervalTolerance = request.options?.sampleIntervalTolerance ?? 1e-8;
  if (!(intervalTolerance > 0) || !Number.isFinite(intervalTolerance)) {
    return failure('invalid-input', 'Sample interval tolerance must be finite and positive.');
  }
  const maximumIntervalDeviation = Math.max(
    ...intervals.map((interval) => Math.abs(interval - sampleInterval)),
  );
  if (maximumIntervalDeviation > intervalTolerance * Math.max(1, Math.abs(sampleInterval))) {
    return failure(
      'non-uniform-sampling',
      'EDMD frequency and decay estimates require a constant one-step interval.',
      { sampleInterval, maximumIntervalDeviation, intervalTolerance },
    );
  }

  const totalPairs = times.length - 1;
  const minimumHoldout = Math.max(EDMD_BROWSER_LIMITS.minimumHoldoutPairs, dictionary.length + 2);
  const holdoutPairs =
    request.options?.holdoutPairs ?? Math.max(minimumHoldout, Math.ceil(totalPairs * 0.2));
  if (!Number.isInteger(holdoutPairs) || holdoutPairs < minimumHoldout) {
    return failure('insufficient-holdout', 'The declared holdout is too small for an EDMD claim.', {
      holdoutPairs,
      minimumHoldout,
    });
  }
  const trainingPairs = totalPairs - holdoutPairs;
  const minimumTrainingPairs = Math.max(8, 2 * dictionary.length);
  if (trainingPairs < minimumTrainingPairs) {
    return failure(
      'insufficient-samples',
      'Too few training pairs remain after reserving holdout data.',
      {
        trainingPairs,
        minimumTrainingPairs,
        holdoutPairs,
      },
    );
  }
  const ridge = request.options?.ridge ?? 1e-10;
  const rankTolerance = request.options?.rankTolerance ?? 1e-10;
  if (
    !(ridge >= 0) ||
    !Number.isFinite(ridge) ||
    !(rankTolerance > 0) ||
    !Number.isFinite(rankTolerance)
  ) {
    return failure(
      'invalid-input',
      'Ridge and rank tolerance must be finite and nonnegative/positive.',
    );
  }

  const features: number[][] = [];
  for (let sample = 0; sample < times.length; sample += 1) {
    const snapshot: Record<string, number> = {};
    for (const observable of observables) {
      snapshot[observable.id] = observable.values[sample] ?? Number.NaN;
    }
    Object.freeze(snapshot);
    const row: number[] = [];
    for (const term of dictionary) {
      let value: number;
      try {
        value = term.evaluate(snapshot);
      } catch (error) {
        return failure(
          'dictionary-evaluation-failure',
          'A dictionary evaluator threw an exception.',
          {
            term: term.id,
            sample,
            reason: error instanceof Error ? error.message : 'unknown exception',
          },
        );
      }
      if (!Number.isFinite(value)) {
        return failure(
          'non-finite-dictionary',
          'A dictionary evaluator returned a non-finite value.',
          {
            term: term.id,
            sample,
          },
        );
      }
      row.push(value);
    }
    features.push(row);
  }

  const dimension = dictionary.length;
  const scales = Array.from({ length: dimension }, (_, term) => {
    let squared = 0;
    for (let pair = 0; pair < trainingPairs; pair += 1) {
      const value = features[pair]?.[term] ?? Number.NaN;
      squared += value * value;
    }
    return Math.sqrt(squared / trainingPairs);
  });
  if (scales.some((scale) => !(scale > 0) || !Number.isFinite(scale))) {
    const term = scales.findIndex((scale) => !(scale > 0) || !Number.isFinite(scale));
    return failure('rank-deficient', 'A dictionary term is zero on every training snapshot.', {
      term: dictionary[term]?.id ?? term,
      numericalRank: 0,
      dictionaryDimension: dimension,
    });
  }

  const gram = zeroMatrix(dimension, dimension);
  const cross = zeroMatrix(dimension, dimension);
  for (let pair = 0; pair < trainingPairs; pair += 1) {
    for (let row = 0; row < dimension; row += 1) {
      const xRow = (features[pair]?.[row] ?? Number.NaN) / (scales[row] ?? Number.NaN);
      for (let column = 0; column < dimension; column += 1) {
        const xColumn = (features[pair]?.[column] ?? Number.NaN) / (scales[column] ?? Number.NaN);
        const yColumn =
          (features[pair + 1]?.[column] ?? Number.NaN) / (scales[column] ?? Number.NaN);
        gram[row]![column] = (gram[row]?.[column] ?? 0) + (xRow * xColumn) / trainingPairs;
        cross[row]![column] = (cross[row]?.[column] ?? 0) + (xRow * yColumn) / trainingPairs;
      }
    }
  }
  const gramEigen = symmetricEigen(gram);
  if (!gramEigen.converged || !gramEigen.values.every(Number.isFinite)) {
    return failure(
      'numerical-failure',
      'Symmetric eigensolver did not converge for the EDMD Gram matrix.',
    );
  }
  const maximumGramEigenvalue = gramEigen.values[0] ?? 0;
  const negativeTolerance = 256 * Number.EPSILON * Math.max(1, maximumGramEigenvalue);
  if (
    !(maximumGramEigenvalue > 0) ||
    gramEigen.values.some((value) => value < -negativeTolerance)
  ) {
    return failure(
      'numerical-failure',
      'The computed Gram spectrum is not positive semidefinite.',
      {
        maximumGramEigenvalue,
        minimumGramEigenvalue: gramEigen.values.at(-1) ?? Number.NaN,
      },
    );
  }
  const rankCutoff = maximumGramEigenvalue * rankTolerance;
  const numericalRank = gramEigen.values.filter((value) => value > rankCutoff).length;
  if (numericalRank < dimension) {
    return failure(
      'rank-deficient',
      'The declared dictionary is rank deficient on the training data.',
      {
        numericalRank,
        dictionaryDimension: dimension,
        rankCutoff,
        minimumGramEigenvalue: gramEigen.values.at(-1) ?? 0,
        maximumGramEigenvalue,
      },
    );
  }
  const minimumGramEigenvalue = gramEigen.values.at(-1) ?? Number.NaN;
  const inverse = zeroMatrix(dimension, dimension);
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      let value = 0;
      for (let mode = 0; mode < dimension; mode += 1) {
        const left = gramEigen.vectors[row]?.[mode] ?? Number.NaN;
        const right = gramEigen.vectors[column]?.[mode] ?? Number.NaN;
        const eigenvalue = gramEigen.values[mode] ?? Number.NaN;
        value += (left * right) / (eigenvalue + ridge);
      }
      inverse[row]![column] = value;
    }
  }
  const operator = matrixMultiply(inverse, cross);
  if (!operator.flat().every(Number.isFinite)) {
    return failure(
      'numerical-failure',
      'The regularized EDMD operator contains a non-finite value.',
    );
  }
  const trainingResidual = predictionResidual(features, scales, operator, 0, trainingPairs);
  const holdoutResidual = predictionResidual(
    features,
    scales,
    operator,
    trainingPairs,
    holdoutPairs,
  );
  if (!Number.isFinite(trainingResidual) || !Number.isFinite(holdoutResidual)) {
    return failure('numerical-failure', 'An EDMD prediction residual is non-finite.');
  }

  const eigenvalues = polynomialEigenvalues(operator);
  if (!eigenvalues || eigenvalues.length !== dimension) {
    return failure('eigensolver-failure', 'The finite EDMD eigensolver did not converge.', {
      dictionaryDimension: dimension,
    });
  }
  const modes: EdmdMode[] = [];
  for (let index = 0; index < eigenvalues.length; index += 1) {
    const eigenvalue = eigenvalues[index] ?? ZERO;
    const scaledVector = inverseIterationEigenvector(operator, eigenvalue, index);
    if (!scaledVector) {
      return failure('eigensolver-failure', 'An EDMD eigenfunction coefficient solve failed.', {
        mode: index,
      });
    }
    const eigenResidual = relativeEigenResidual(operator, eigenvalue, scaledVector);
    if (!Number.isFinite(eigenResidual) || eigenResidual > 1e-6) {
      return failure('eigensolver-failure', 'An EDMD eigenpair failed its residual check.', {
        mode: index,
        relativeEigenResidual: eigenResidual,
      });
    }
    const unscaled = normalizeComplexVector(
      scaledVector.map((coefficient, term) =>
        divide(coefficient, complex(scales[term] ?? Number.NaN)),
      ),
    );
    if (!unscaled) {
      return failure('eigensolver-failure', 'An EDMD eigenfunction could not be normalized.', {
        mode: index,
      });
    }
    const modulus = magnitude(eigenvalue);
    const continuousFinite = modulus > Number.EPSILON;
    const angularFrequency = continuousFinite
      ? Math.atan2(eigenvalue.imaginary, eigenvalue.real) / sampleInterval
      : null;
    const decayRate = continuousFinite ? Math.log(modulus) / sampleInterval : null;
    modes.push({
      id: `finite-edmd-mode-${index + 1}`,
      discreteEigenvalue: { ...eigenvalue },
      eigenfunctionCoefficients: unscaled.map((coefficient, term) => ({
        dictionaryTermId: dictionary[term]?.id ?? `missing-term-${term}`,
        value: { ...coefficient },
      })),
      relativeEigenResidual: eigenResidual,
      decayRate,
      angularFrequency,
      cyclicFrequency: angularFrequency === null ? null : angularFrequency / (2 * Math.PI),
      continuousRateStatus: continuousFinite
        ? 'finite-principal-branch'
        : 'undefined-zero-eigenvalue',
    });
  }

  const firstTime = times[0];
  const lastTime = times.at(-1);
  if (firstTime === undefined || lastTime === undefined) {
    return failure('insufficient-samples', 'Trajectory endpoints are missing.');
  }
  return {
    ok: true,
    method: 'finite-sample-ridge-edmd',
    interpretation:
      'Dictionary-dependent finite-sample EDMD approximation with chronological holdout; not the complete or continuous Koopman spectrum.',
    sampleInterval,
    trainingPairs,
    holdoutPairs,
    trainingResidual,
    holdoutResidual,
    conditioning: {
      numericalRank,
      dictionaryDimension: dimension,
      snapshotConditionNumber: Math.sqrt(maximumGramEigenvalue / minimumGramEigenvalue),
      gramConditionNumber: maximumGramEigenvalue / minimumGramEigenvalue,
      gramEigenvalues: [...gramEigen.values],
      featureScales: scales,
      ridge,
      rankTolerance,
    },
    operator: { matrix: operator, orientation: 'coefficient-action' },
    modes,
    provenance: {
      observableOrder: observables.map(({ id, label, unit }) => ({ id, label, unit })),
      dictionaryOrder: dictionary.map(({ id, definition, source }) => ({
        id,
        definition,
        source,
      })),
      firstSampleTime: firstTime,
      lastSampleTime: lastTime,
      trainingPairRange: [0, trainingPairs - 1],
      holdoutPairRange: [trainingPairs, totalPairs - 1],
    },
  };
}
