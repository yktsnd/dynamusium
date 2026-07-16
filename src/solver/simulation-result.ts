import type { Trajectory } from './trajectory.ts';

/**
 * Typed outcome of an integration run.
 *
 * Small numerical noise (a quantity dipping below zero by no more than
 * NONNEGATIVE_TOLERANCE, or the reservoir dipping by no more than that)
 * is corrected and counted in `diagnostics`. Anything larger is a genuine
 * numerical failure: integration stops, no trajectory is returned, and the
 * error must surface to the user instead of being clamped away.
 */

export type NumericalErrorKind = 'negative-quantity' | 'reservoir-decrease' | 'non-finite';

export interface NumericalError {
  kind: NumericalErrorKind;
  /** Human-readable one-line summary (shown in the UI). */
  message: string;
  /** Simulated time at which integration failed. */
  time: number;
  /** Integration step index at which integration failed. */
  step: number;
  /** Index of the offending variable in the state vector. */
  stateIndex: number;
  /** Species id, or 'reservoir'. */
  stateId: string;
  /** The offending value. */
  value: number;
  /** The tolerance that was exceeded. */
  tolerance: number;
}

export interface Diagnostics {
  /** Negative excursions within tolerance that were corrected to zero. */
  smallClampCount: number;
  /** Reservoir micro-decreases within tolerance that were corrected. */
  reservoirCorrectionCount: number;
  /** Steps actually integrated (== configured steps when valid). */
  stepsCompleted: number;
}

export type SimulationResult =
  | { status: 'valid'; trajectory: Trajectory; diagnostics: Diagnostics }
  | { status: 'invalid'; error: NumericalError; diagnostics: Diagnostics };
