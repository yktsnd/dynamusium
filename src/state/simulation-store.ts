import { create } from 'zustand';
import { demonstrationModel } from '../model/demonstration-model.ts';
import type { InputProfile, ModelDefinition, ParameterValues, SpeciesId } from '../model/schema.ts';
import { clampParameterValue, defaultParameterValues } from '../model/validation.ts';
import { integrate } from '../solver/integrate.ts';
import type { Diagnostics, NumericalError, SimulationResult } from '../solver/simulation-result.ts';
import type { Trajectory } from '../solver/trajectory.ts';
import { defaultPresetId, presets, type Preset } from '../features/presets/presets.ts';

/**
 * Single source of truth for the running application.
 *
 * Numerical truth lives in the solver's SimulationResult, recomputed
 * synchronously whenever parameters, profile, or preset change. A valid
 * result carries the immutable trajectory playback indexes into; an invalid
 * result carries the error instead — there is no trajectory to play, playback
 * halts, and the UI must show the failure until the user resets or changes
 * inputs.
 */

export type RateView = 'net' | 'directional';
export type SimulationStatus = SimulationResult['status'];

export interface SimulationState {
  model: ModelDefinition;
  presetId: string;
  params: ParameterValues;
  profile: InputProfile;
  initialOverrides: Partial<Record<SpeciesId, number>>;

  status: SimulationStatus;
  /** Present only when status === 'valid'. */
  trajectory: Trajectory | null;
  /** Present only when status === 'invalid'. */
  error: NumericalError | null;
  diagnostics: Diagnostics;

  time: number;
  playing: boolean;
  speed: number;

  selection: string | null;
  rateView: RateView;
  legendOpen: boolean;
  inspectorOpen: boolean;
  hoverTime: number | null;
  /** null = follow the OS prefers-reduced-motion setting. */
  reducedMotionOverride: boolean | null;
  /** Exhibition (kiosk) mode: auto-advancing presets, receded UI chrome. */
  exhibitMode: boolean;

  selectPreset: (id: string) => void;
  setParam: (id: string, value: number) => void;
  setProfileKind: (kind: InputProfile['kind']) => void;
  setProfileField: (key: string, value: number) => void;
  resetToPresetDefaults: () => void;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  restart: () => void;
  setTime: (t: number) => void;
  advance: (dtWall: number) => void;
  setSpeed: (speed: number) => void;

  select: (id: string | null) => void;
  setRateView: (view: RateView) => void;
  setLegendOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setHoverTime: (t: number | null) => void;
  setReducedMotionOverride: (value: boolean | null) => void;
  setExhibitMode: (value: boolean) => void;
}

function presetById(id: string): Preset {
  return presets.find((p) => p.id === id) ?? presets[0];
}

function computeResult(
  model: ModelDefinition,
  params: ParameterValues,
  profile: InputProfile,
  initialOverrides: Partial<Record<SpeciesId, number>>,
): SimulationResult {
  return integrate({ model, params, profile, initialOverrides });
}

/** Store fields derived from a fresh SimulationResult. Halts playback on failure. */
function applyResult(result: SimulationResult, previousTime = 0) {
  if (result.status === 'valid') {
    return {
      status: 'valid' as const,
      trajectory: result.trajectory,
      error: null,
      diagnostics: result.diagnostics,
      time: Math.min(previousTime, result.trajectory.duration),
    };
  }
  return {
    status: 'invalid' as const,
    trajectory: null,
    error: result.error,
    diagnostics: result.diagnostics,
    time: 0,
    playing: false,
  };
}

function presetScenario(model: ModelDefinition, preset: Preset) {
  const params = { ...defaultParameterValues(model), ...preset.paramOverrides };
  const profile = structuredClone(preset.profile);
  const initialOverrides = { ...preset.initialOverrides };
  return { params, profile, initialOverrides };
}

const initialPreset = presetById(defaultPresetId);
const initialScenario = presetScenario(demonstrationModel, initialPreset);
const initialResult = computeResult(
  demonstrationModel,
  initialScenario.params,
  initialScenario.profile,
  initialScenario.initialOverrides,
);

export const useSimulationStore = create<SimulationState>((set, get) => ({
  model: demonstrationModel,
  presetId: initialPreset.id,
  ...initialScenario,
  ...applyResult(initialResult),

  playing: initialResult.status === 'valid',
  speed: 1,

  selection: null,
  rateView: 'directional',
  // The museum caption carries the first impression; the legend is opt-in.
  legendOpen: false,
  inspectorOpen: false,
  hoverTime: null,
  reducedMotionOverride: null,
  exhibitMode: false,

  selectPreset: (id) => {
    const { model } = get();
    const scenario = presetScenario(model, presetById(id));
    const result = computeResult(
      model,
      scenario.params,
      scenario.profile,
      scenario.initialOverrides,
    );
    set({
      presetId: id,
      ...scenario,
      ...applyResult(result),
      playing: result.status === 'valid',
    });
  },

  setParam: (id, value) => {
    const { model, params, profile, initialOverrides, time } = get();
    const next = { ...params, [id]: clampParameterValue(model, id, value) };
    const result = computeResult(model, next, profile, initialOverrides);
    set({ params: next, ...applyResult(result, time) });
  },

  setProfileKind: (kind) => {
    const { model, params, initialOverrides, profile, time } = get();
    if (kind === profile.kind) return;
    const defaults: Record<InputProfile['kind'], InputProfile> = {
      none: { kind: 'none' },
      constant: { kind: 'constant', rate: 0.8 },
      pulse: { kind: 'pulse', amplitude: 2.6, center: 8, width: 2.2 },
      sine: { kind: 'sine', base: 0.7, amplitude: 0.6, period: 18 },
    };
    const next = defaults[kind];
    const result = computeResult(model, params, next, initialOverrides);
    set({ profile: next, ...applyResult(result, time) });
  },

  setProfileField: (key, value) => {
    const { model, params, initialOverrides, profile, time } = get();
    if (profile.kind === 'none' || Number.isNaN(value)) return;
    const next = { ...profile, [key]: value } as InputProfile;
    const result = computeResult(model, params, next, initialOverrides);
    set({ profile: next, ...applyResult(result, time) });
  },

  resetToPresetDefaults: () => {
    const { presetId, selectPreset } = get();
    selectPreset(presetId);
  },

  play: () => {
    const { time, trajectory } = get();
    if (!trajectory) return;
    // Play from the start again if we are parked at the end.
    set({ playing: true, time: time >= trajectory.duration ? 0 : time });
  },
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  restart: () => {
    if (!get().trajectory) return;
    set({ time: 0, playing: true });
  },

  setTime: (t) => {
    const { trajectory } = get();
    if (!trajectory) return;
    set({ time: Math.min(trajectory.duration, Math.max(0, t)) });
  },

  advance: (dtWall) => {
    const { time, speed, trajectory, playing } = get();
    if (!playing || !trajectory) return;
    // Clamp at 0: a browser's very first rAF callback timestamp can occasionally
    // precede the wall-clock reference captured when the loop started, producing
    // a momentary negative dtWall — never let displayed time go negative.
    const next = Math.max(0, time + dtWall * speed);
    if (next >= trajectory.duration) {
      set({ time: trajectory.duration, playing: false });
    } else {
      set({ time: next });
    }
  },

  setSpeed: (speed) => set({ speed }),

  select: (id) => set({ selection: id }),
  setRateView: (view) => set({ rateView: view }),
  setLegendOpen: (open) => set({ legendOpen: open }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setHoverTime: (t) => set({ hoverTime: t }),
  setReducedMotionOverride: (value) => set({ reducedMotionOverride: value }),
  setExhibitMode: (value) => set({ exhibitMode: value }),
}));
