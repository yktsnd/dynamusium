import { useSyncExternalStore } from 'react';
import { useSimulationStore } from '../../state/simulation-store.ts';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/**
 * Effective reduced-motion flag: the in-app toggle overrides the OS setting;
 * otherwise the OS `prefers-reduced-motion` value applies.
 */
export function useReducedMotion(): boolean {
  const system = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const override = useSimulationStore((s) => s.reducedMotionOverride);
  return override ?? system;
}
