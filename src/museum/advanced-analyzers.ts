/**
 * Public authoring/build-time entry points for advanced portrait evidence.
 *
 * The live museum invokes only reviewed, capability-gated adapters. Work
 * authors may use these pure bounded routines to produce numerical artifacts,
 * then submit their residuals, provenance, limitations, and semantic mapping
 * for scientific review.
 */

export {
  CONTINUATION_BROWSER_LIMITS,
  continueEquilibriumBranch,
  type ComplexEigenvalue,
  type ContinuationDiagnostics,
  type ContinuationFailure,
  type ContinuationFailureCode,
  type ContinuationOptions,
  type ContinuationPoint,
  type ContinuationResult,
  type ContinuationSeed,
  type ContinuationSuccess,
  type EquilibriumProblem,
  type FoldCandidate,
  type MatrixConditionEvidence,
  type StabilityEvidence,
} from './analyzers/continuation.ts';

export {
  analyzeFiniteEdmd,
  EDMD_BROWSER_LIMITS,
  type ComplexValue,
  type EdmdDictionaryTerm,
  type EdmdFailure,
  type EdmdFailureCode,
  type EdmdMode,
  type EdmdObservable,
  type EdmdOptions,
  type EdmdRequest,
  type EdmdResult,
  type EdmdSuccess,
} from './analyzers/koopman-edmd.ts';

export {
  analyzeFiniteTransitionEnclosure,
  analyzeZeroDimensionalPersistence,
  MAX_TOPOLOGY_CELLS,
  MAX_TRANSITION_EDGES,
  type ArtifactDigest,
  type FiniteConleyAnalysis,
  type FiniteConleyResult,
  type FiniteMorseSet,
  type FiniteTransitionEnclosure,
  type Persistence0Analysis,
  type Persistence0Result,
  type PersistencePair0,
  type ScalarGridFiltrationInput,
  type TopologyFailure,
  type TopologyFailureCode,
} from './analyzers/topology-conley.ts';
