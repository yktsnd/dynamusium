import type { Frame } from '../model/schema.ts';
import { frameAt } from '../solver/trajectory.ts';
import type { SimulationState } from './simulation-store.ts';

/** System state at the current playback time. */
export function selectCurrentFrame(s: SimulationState): Frame {
  return frameAt(s.trajectory, s.time);
}

/** System state at the hovered chart/timeline time, if any. */
export function selectHoverFrame(s: SimulationState): Frame | null {
  return s.hoverTime === null ? null : frameAt(s.trajectory, s.hoverTime);
}

/** Frame the readouts should display: hover preview wins over playback. */
export function selectReadoutFrame(s: SimulationState): Frame {
  return selectHoverFrame(s) ?? selectCurrentFrame(s);
}
