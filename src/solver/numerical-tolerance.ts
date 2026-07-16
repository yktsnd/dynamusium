/**
 * Central numerical tolerances. Tests and runtime clamping must use these —
 * do not scatter magic epsilons elsewhere.
 */

/** Quantities below zero by at most this much are clamped to zero silently. */
export const NONNEGATIVE_TOLERANCE = 1e-9;

/** Allowed relative drift in closed-system mass-balance checks. */
export const MASS_BALANCE_RELATIVE_TOLERANCE = 1e-8;

/** Allowed backward step in the cumulative reservoir series. */
export const MONOTONICITY_TOLERANCE = 1e-12;
