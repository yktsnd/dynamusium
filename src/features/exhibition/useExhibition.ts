import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../lib/accessibility/useReducedMotion.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import { presets } from '../presets/presets.ts';

/** Wall-clock durations for the exhibition scene-transition sequence. */
const HOLD_MS = 6000;
const FADE_MS = 400;
const CAPTION_MS = 4000;
const RECESS_IDLE_MS = 4000;

export type ExhibitPhase = 'idle' | 'holding' | 'fading-out' | 'caption' | 'fading-in';

/**
 * Drives exhibition (kiosk) mode: best-effort fullscreen, auto-advancing
 * through presets when a trajectory finishes playing, and UI recession
 * after a period of no input. The playback loop itself is untouched — this
 * hook only ever calls the same `selectPreset` action a user click would,
 * so every displayed state is a real simulated state; the fade between
 * presets is a scene transition, never interpolated dynamics.
 */
export function useExhibition() {
  const exhibitMode = useSimulationStore((s) => s.exhibitMode);
  const setExhibitMode = useSimulationStore((s) => s.setExhibitMode);
  const reducedMotion = useReducedMotion();
  const [uiRecessed, setUiRecessed] = useState(false);
  const [phase, setPhase] = useState<ExhibitPhase>('idle');

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const advancing = useRef(false);

  const clearPhaseTimers = () => {
    for (const t of phaseTimers.current) clearTimeout(t);
    phaseTimers.current = [];
  };
  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(fn, ms);
    phaseTimers.current.push(id);
  };

  const enable = useCallback(() => {
    setExhibitMode(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
    // Release focus from whatever triggered entry (typically the rail's own
    // toggle button) — otherwise `:focus-within` would hold that control's
    // container permanently revealed, defeating UI recession entirely.
    (document.activeElement as HTMLElement | null)?.blur();
  }, [setExhibitMode]);

  const disable = useCallback(() => {
    setExhibitMode(false);
    setUiRecessed(false);
    setPhase('idle');
    advancing.current = false;
    clearPhaseTimers();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, [setExhibitMode]);

  const toggle = useCallback(() => {
    if (useSimulationStore.getState().exhibitMode) disable();
    else enable();
  }, [enable, disable]);

  // URL ?exhibit=1 enables exhibition mode on load.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('exhibit') === '1') enable();
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: "e" toggles, Escape exits (both ignored while typing in a field).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (typing) return;
      if (e.key === 'e' || e.key === 'E') {
        toggle();
      } else if (e.key === 'Escape' && useSimulationStore.getState().exhibitMode) {
        disable();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, disable]);

  // UI recession after a period without pointer/keyboard/focus activity.
  // (Exposed `uiRecessed` below is gated on exhibitMode, so no reset-on-exit
  // setState is needed here — avoids setting state synchronously in the
  // effect body.)
  useEffect(() => {
    if (!exhibitMode) return;
    const scheduleRecess = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setUiRecessed(true), RECESS_IDLE_MS);
    };
    const reset = () => {
      setUiRecessed(false);
      scheduleRecess();
    };
    scheduleRecess();
    window.addEventListener('pointermove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('focusin', reset);
    return () => {
      window.removeEventListener('pointermove', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('focusin', reset);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [exhibitMode]);

  // Auto-advance: when a trajectory finishes playing under exhibition mode,
  // hold the final state, fade out, select the next preset (cyclic), show
  // its caption, then fade back in. Reduced motion skips the 400ms fades
  // (instant) but keeps the hold and caption interstitial.
  useEffect(() => {
    if (!exhibitMode) return;
    let prevPlaying = useSimulationStore.getState().playing;
    const unsubscribe = useSimulationStore.subscribe((state) => {
      const traj = state.trajectory;
      const reachedEnd =
        prevPlaying && !state.playing && traj !== null && state.time >= traj.duration - 1e-9;
      prevPlaying = state.playing;
      if (!reachedEnd || advancing.current) return;

      advancing.current = true;
      const fadeMs = reducedMotion ? 0 : FADE_MS;
      setPhase('holding');
      after(HOLD_MS, () => {
        setPhase('fading-out');
        after(fadeMs, () => {
          const { presetId, selectPreset } = useSimulationStore.getState();
          const idx = presets.findIndex((p) => p.id === presetId);
          const next = presets[(idx + 1) % presets.length];
          selectPreset(next.id);
          setPhase('caption');
          after(CAPTION_MS, () => {
            setPhase('fading-in');
            after(fadeMs, () => {
              setPhase('idle');
              advancing.current = false;
            });
          });
        });
      });
    });
    return () => {
      unsubscribe();
      clearPhaseTimers();
      advancing.current = false;
    };
  }, [exhibitMode, reducedMotion]);

  return { exhibitMode, toggle, enable, disable, uiRecessed: exhibitMode && uiRecessed, phase };
}
