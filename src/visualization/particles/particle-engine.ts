/**
 * Deterministic particle emission driven by integrated rates.
 *
 * Each channel direction owns an accumulator. During playback the accumulator
 * gains `rate * dtSim` (simulated amount transferred); every time it crosses
 * `quantum`, one particle is emitted. Total emitted quanta therefore tracks
 * the integral of the rate along the played path — particle frequency IS the
 * rate encoding. Particle travel time is a fixed wall-clock duration and
 * carries no meaning.
 *
 * Pure data + pure step function so the engine is testable without a DOM.
 */

export interface Particle {
  id: number;
  /** 0 at channel start, 1 at channel end. */
  progress: number;
}

export interface LaneState {
  accumulator: number;
  particles: Particle[];
  emittedQuanta: number;
  nextId: number;
}

export function createLane(): LaneState {
  return { accumulator: 0, particles: [], emittedQuanta: 0, nextId: 1 };
}

export interface LaneStepInput {
  /** Nonnegative directional rate (amount / sim time) at the current moment. */
  rate: number;
  /** Simulated time elapsed since last step (already includes playback speed). */
  dtSim: number;
  /** Wall-clock seconds elapsed since last step (drives travel animation). */
  dtWall: number;
  /** Amount represented by one particle. */
  quantum: number;
  /** Wall-clock seconds a particle takes to traverse the channel. */
  travelSeconds: number;
  /** Cap on live particles per lane to keep the scene calm at high speeds. */
  maxParticles: number;
}

/** Advance a lane in place. Returns the number of particles emitted. */
export function stepLane(lane: LaneState, input: LaneStepInput): number {
  const { rate, dtSim, dtWall, quantum, travelSeconds, maxParticles } = input;

  // Move existing particles by wall-clock time; drop arrivals.
  const advance = dtWall / travelSeconds;
  for (const p of lane.particles) p.progress += advance;
  lane.particles = lane.particles.filter((p) => p.progress < 1);

  if (rate > 0 && dtSim > 0 && quantum > 0) {
    lane.accumulator += rate * dtSim;
  }

  let emitted = 0;
  while (lane.accumulator >= quantum) {
    lane.accumulator -= quantum;
    lane.emittedQuanta += quantum;
    emitted++;
    if (lane.particles.length < maxParticles) {
      // Stagger multiple emissions within one step so they do not overlap.
      lane.particles.push({ id: lane.nextId++, progress: (emitted - 1) * 0.04 });
    }
  }
  return emitted;
}

/** Discard live particles and pending accumulation (used when scrubbing). */
export function resetLane(lane: LaneState): void {
  lane.accumulator = 0;
  lane.particles = [];
}
