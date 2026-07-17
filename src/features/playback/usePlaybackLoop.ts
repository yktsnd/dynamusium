import { useEffect } from 'react';
import { useSimulationStore } from '../../state/simulation-store.ts';

/**
 * Drives playback with requestAnimationFrame. Advances simulated time by
 * wall-clock delta x speed; the trajectory itself is never touched.
 */
export function usePlaybackLoop(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dtWall = Math.min(0.1, (now - last) / 1000);
      last = now;
      useSimulationStore.getState().advance(dtWall);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
