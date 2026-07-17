import type { PointerEvent } from 'react';
import { useSimulationStore } from '../state/simulation-store.ts';

/**
 * Shared time cursor across both charts and the timeline.
 *
 * - Hovering any chart sets `hoverTime`, which every chart renders as a
 *   preview cursor and the readouts use for values.
 * - Clicking (or dragging) seeks playback to that time — scrubbing reads the
 *   existing trajectory and never recomputes it.
 */
export function useSharedCursor(duration: number, plotLeft: number, plotWidth: number) {
  const setHoverTime = useSimulationStore((s) => s.setHoverTime);
  const setTime = useSimulationStore((s) => s.setTime);

  const timeFromEvent = (e: PointerEvent<SVGSVGElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width / e.currentTarget.viewBox.baseVal.width;
    const x = (e.clientX - rect.left) / scale - plotLeft;
    return Math.min(duration, Math.max(0, (x / plotWidth) * duration));
  };

  return {
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      const t = timeFromEvent(e);
      setHoverTime(t);
      if (e.buttons === 1) setTime(t);
    },
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setTime(timeFromEvent(e));
    },
    onPointerLeave: () => setHoverTime(null),
  };
}
