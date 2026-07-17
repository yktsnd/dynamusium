import type { Frame } from '../model/schema.ts';
import { frameAt } from '../solver/trajectory.ts';
import type { SimulationState } from './simulation-store.ts';

/** System state at the current playback time; null while the simulation is invalid. */
export function selectCurrentFrame(s: SimulationState): Frame | null {
  return s.trajectory ? frameAt(s.trajectory, s.time) : null;
}

/** System state at the hovered chart/timeline time, if any. */
export function selectHoverFrame(s: SimulationState): Frame | null {
  return s.trajectory && s.hoverTime !== null ? frameAt(s.trajectory, s.hoverTime) : null;
}

/** Frame the readouts should display: hover preview wins over playback. */
export function selectReadoutFrame(s: SimulationState): Frame | null {
  return selectHoverFrame(s) ?? selectCurrentFrame(s);
}
