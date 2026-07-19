/**
 * Scientific contracts for the museum runtime.
 *
 * These types deliberately describe established mathematical objects and
 * numerical evidence. They are not a new taxonomy of dynamical systems.
 * Screen-space geometry and decorative composition do not belong here.
 */

export type ContentHash = {
  algorithm: 'sha256';
  value: string;
};

export type TimeDomain =
  { kind: 'continuous'; unit: string } | { kind: 'discrete'; stepUnit: string };

export type CoordinateSpec = {
  id: string;
  label: string;
  unit: string;
};

export type StateSpace =
  | { kind: 'euclidean'; dimension: number; coordinates: CoordinateSpec[] }
  | {
      kind: 'field';
      domainDimension: 1 | 2;
      components: CoordinateSpec[];
      boundary: 'periodic' | 'no-flux' | 'fixed' | 'open';
    }
  | {
      kind: 'product';
      factors: Array<'circle' | 'euclidean'>;
      dimension: number;
      coordinates: CoordinateSpec[];
    }
  | {
      kind: 'finite-configurations';
      siteCount: number;
      values: number[];
      coordinates: CoordinateSpec[];
    };

export type FormalClass = {
  character: 'deterministic' | 'stochastic' | 'hybrid' | 'stochastic-hybrid';
  stateSpace: StateSpace;
  evolution:
    | {
        kind: 'flow' | 'semiflow' | 'process';
        time: Extract<TimeDomain, { kind: 'continuous' }>;
        autonomous: boolean;
        lawRef: string;
      }
    | {
        kind: 'map';
        time: Extract<TimeDomain, { kind: 'discrete' }>;
        lawRef: string;
      }
    | {
        kind: 'markov-chain';
        time: Extract<TimeDomain, { kind: 'discrete' }>;
        transitionLawRef: string;
        invariantLawRef?: string;
      };
};

export type Representation =
  | 'governing-law-execution'
  | 'closed-form-solution'
  | 'reduced-model'
  | 'data-derived'
  | 'illustrative-surrogate';

export type Maturity = 'M0' | 'M1' | 'M2' | 'M3' | 'M4';

export type PortraitCapability =
  | 'local-stability'
  | 'recurrence'
  | 'empirical-measure'
  | 'conservation'
  | 'flux'
  | 'frequency'
  | 'decay-rate'
  | 'spectral-mode'
  | 'spatial-field'
  | 'interface'
  | 'persistent-homology'
  | 'coherent-structure'
  | 'ensemble'
  | 'uncertainty'
  | 'bifurcation';

export type ValidationRequirementId =
  | 'finite-output'
  | 'deterministic-replay'
  | 'dimension-consistency'
  | 'parameter-bounds'
  | 'step-halving'
  | 'grid-refinement'
  | 'positivity'
  | 'mass-balance'
  | 'energy-residual'
  | 'equilibrium-residual'
  | 'order-parameter-bounds'
  | 'reference-statistic'
  | 'seeded-replay'
  | 'cfl-condition'
  | 'boundary-residual';

export type ScientificObjectKind =
  | 'orbit-segment'
  | 'fixed-point'
  | 'periodic-orbit'
  | 'quasiperiodic-set'
  | 'chaotic-attractor-candidate'
  | 'transient-segment'
  | 'recurrent-set'
  | 'attractor'
  | 'repeller'
  | 'morse-set'
  | 'morse-graph'
  | 'invariant-manifold'
  | 'basin'
  | 'separatrix'
  | 'empirical-measure'
  | 'invariant-measure'
  | 'recurrence'
  | 'entropy'
  | 'mixing'
  | 'koopman-mode'
  | 'dmd-mode'
  | 'frequency'
  | 'decay-rate'
  | 'bifurcation'
  | 'uncertainty'
  | 'ensemble'
  | 'conservation'
  | 'flux'
  | 'spatial-field'
  | 'interface'
  | 'defect'
  | 'coherent-structure';

export interface ParameterRegimeSpec {
  id: string;
  presetIds: string[];
  parameterDomain: Record<string, readonly [number, number]>;
  note: string;
}

export interface PrimaryClaimSpec {
  id: string;
  appliesToRegimeIds: string[];
  statement: string;
  objectKind: ScientificObjectKind;
  observableIds: string[];
  limitations: string[];
  targetMaturity: Maturity;
}

export type RuntimeKindV2 =
  'ode' | 'map' | 'field' | 'stochastic' | 'hybrid' | 'analytic' | 'surrogate';

export interface RuntimeSpec {
  kind: RuntimeKindV2;
  kernel: string;
  definitionRef: string;
  definitionHash: ContentHash;
  executionProfile: string;
  output: 'trajectory' | 'field-trajectory' | 'ensemble';
}

export type MarkKind =
  'point' | 'path' | 'region' | 'field-raster' | 'contour-line' | 'glyph' | 'particle' | 'fill';

export type VisualChannel =
  | 'position-x'
  | 'position-y'
  | 'luminance'
  | 'hue'
  | 'opacity'
  | 'stroke-width'
  | 'area'
  | 'orientation'
  | 'direction'
  | 'event-frequency'
  | 'phase';

export interface ChannelBinding {
  quantityRef: string;
  channel: VisualChannel;
  scale: 'linear' | 'sqrt' | 'log' | 'symlog' | 'categorical' | 'cyclic';
  domain: readonly [number, number] | string[];
  unit?: string;
  zero?: number;
  /** Integrated amount represented by one event particle. Required for event-frequency. */
  eventQuantum?: number;
  /** Precomputed cumulative amount that advances event phase. */
  eventAccumulatorRef?: string;
  outOfDomain: 'overflow-indicator' | 'clip-with-indicator' | 'wrap-cyclic';
  uncertaintyRef?: string;
}

export interface SemanticVisualLayer {
  id: string;
  objectId: string;
  appliesToRegimeIds: string[];
  mark: MarkKind;
  bindings: ChannelBinding[];
  projection?: {
    coordinateRefs: string[];
    method: 'identity' | 'selected-coordinates' | 'pca' | 'mode';
    aspect: 'physical' | 'equal-data-units' | 'declared-distortion';
  };
  scientificTime?: {
    quantityRef: string;
    mode: 'frame' | 'cursor' | 'phase';
    interpolation: 'none' | 'linear' | 'declared-method';
  };
  reducedMotion: {
    strategy: 'semantic-static' | 'accumulated-density' | 'keyframes' | 'small-multiples';
    dataRef?: string;
    preserves: string[];
  };
}

/** Composition may style or stage reviewed layers, but cannot change bindings. */
export interface CompositionSpec {
  layerIds: string[];
  focalLayerId: string;
  negativeSpace: number;
  camera: 'none' | 'bounded-slow-pan' | 'bounded-slow-zoom';
  atmosphere?: {
    assetRef: string;
    decorativeSeed?: string;
    nonSemantic: true;
    ariaHidden: true;
  };
}

export interface PortraitManifestExtension {
  formal: FormalClass;
  definition: {
    definitionRef: string;
    expectedHash: ContentHash;
    explanation: string;
  };
  parameterRegimes: ParameterRegimeSpec[];
  primaryClaims: PrimaryClaimSpec[];
  science: {
    representation: Representation;
    capabilities: PortraitCapability[];
    validations: ValidationRequirementId[];
    reviewedMaturity: Maturity;
  };
  runtime: RuntimeSpec;
  visualMappings: SemanticVisualLayer[];
  composition: CompositionSpec;
}

export interface RunIdentity {
  requestId: string;
  runId: string;
  workSlug: string;
  schemaVersion: 2;
  manifestHash: ContentHash;
  inputHash: ContentHash;
  resolvedPresetId?: string;
  resolvedParameters: Record<string, number>;
}

export interface EvidenceMetric {
  id: string;
  value: number;
  unit?: string;
  norm?: 'absolute' | 'relative' | 'l1' | 'l2' | 'linf';
  tolerance?: number;
  referenceValue?: number;
  referenceId?: string;
}

export interface RunCheckResult {
  id: ValidationRequirementId | string;
  status: 'passed' | 'failed' | 'not-run';
  severity: 'hard' | 'claim';
  metrics: EvidenceMetric[];
  message: string;
}

export interface RunProvenance {
  kernel: { id: string; version: string; definitionHash: ContentHash };
  execution: {
    kind: 'numerical-solver' | 'analytic-evaluator' | 'surrogate-evaluator' | 'sampler';
    id: string;
    version: string;
    precision: 'float64' | 'float32';
    fixedStep?: number;
    iterations?: number;
  };
  interval: readonly [number, number];
  initialCondition: Record<string, number> | { ref: string };
  boundaryConditions?: Array<{ axis: string; kind: string; value?: number }>;
  grid?: { shape: number[]; spacing: number[] };
  random?: {
    algorithm: string;
    version: string;
    seed: string;
    sampleSchedule: string;
    ensembleSize?: number;
  };
}

export interface ObservableSeriesV2 {
  id: string;
  label: string;
  unit: string;
  values: number[];
}

export interface FieldFrameV2 {
  time: number;
  shape: readonly [number, number];
  components: Record<string, number[]>;
  coordinates: { names: string[]; spacing: number[] };
}

export type RunPayload =
  | {
      kind: 'trajectory';
      times: number[];
      state?: number[];
      stateShape?: readonly [number, number];
      stateCoordinateIds?: string[];
      observables: ObservableSeriesV2[];
    }
  | {
      kind: 'field-trajectory';
      times: number[];
      frames: FieldFrameV2[];
      observables: ObservableSeriesV2[];
    }
  | {
      kind: 'ensemble';
      members: Array<{
        memberId: string;
        weight: number;
        payload: Exclude<RunPayload, { kind: 'ensemble' }>;
      }>;
      observables: ObservableSeriesV2[];
    };

export interface ScientificObject {
  id: string;
  kind: ScientificObjectKind;
  dataRefs: string[];
  evidenceCheckIds: string[];
  qualifier?: string;
  limitations: string[];
  artifact?: {
    kind: 'histogram' | 'morse-graph' | 'spectrum' | 'interface-summary';
    data: Record<string, unknown>;
  };
}

export interface DynamicalPortrait {
  runId: string;
  inputHash: ContentHash;
  regimeId: string;
  primaryClaimId: string;
  primaryObjectId: string;
  maturityAssessment: {
    attained: Maturity;
    derivedFromCheckIds: string[];
    reviewed: boolean;
  };
  objects: ScientificObject[];
}

export type WorkRunResult =
  | {
      status: 'valid';
      identity: RunIdentity;
      payload: RunPayload;
      provenance: RunProvenance;
      hardChecks: RunCheckResult[];
      claimAssessments: RunCheckResult[];
      portrait: DynamicalPortrait;
    }
  | {
      status: 'invalid';
      identity: RunIdentity;
      provenance: RunProvenance;
      failure: {
        kind:
          | 'non-finite'
          | 'divergence'
          | 'hard-constraint-violation'
          | 'dimension-mismatch'
          | 'step-underflow'
          | 'event-failure'
          | 'runtime-mismatch';
        message: string;
        time?: number;
        stateIndex?: number;
      };
      lastAcceptedTime?: number;
    };
