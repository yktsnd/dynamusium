/**
 * Motion constants shared by the animated layers. Every animated element in
 * the network derives from model behavior — decorative motion is not added.
 */

/** Wall-clock seconds a particle takes to traverse a channel (not a rate encoding). */
export const PARTICLE_TRAVEL_SECONDS = 1.1;

/** Cap on live particles per lane; keeps fast scenarios calm and legible. */
export const MAX_PARTICLES_PER_LANE = 14;

/** Amount of substance represented by one particle (model quantity units). */
export const PARTICLE_QUANTUM = 0.12;

/** A scrub jump larger than this (in sim seconds) clears in-flight particles. */
export const SCRUB_RESET_THRESHOLD = 0.5;
