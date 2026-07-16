import { create } from 'zustand';
import { demonstrationModel } from '../model/demonstration-model.ts';
import type { InputProfile, ModelDefinition, ParameterValues, SpeciesId } from '../model/schema.ts';
import { clampParameterValue, defaultParameterValues } from '../model/validation.ts';
import { integrate } from '../solver/integrate.ts';
import type { Trajectory } from '../solver/trajectory.ts';
import { defaultPresetId, presets, type Preset } from '../features/presets/presets.ts';

/**
 * Single source of truth for the running application.
 *
 * Numerical truth lives in `trajectory`, recomputed synchronously whenever
 * parameters, profile, or preset change. Playback state only selects a time
 * within it — it never mutates it.
 */

export type RateView = 'net' | 'directional';

export interface SimulationState {
  model: ModelDefinition;
  presetId: string;
  params: ParameterValues;
  profile: InputProfile;
  initialOverrides: Partial<Record<SpeciesId, number>>;
  trajectory: Trajectory;

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
}

function presetById(id: string): Preset {
  return presets.find((p) => p.id === id) ?? presets[0];
}

function computeTrajectory(
  model: ModelDefinition,
  params: ParameterValues,
  profile: InputProfile,
  initialOverrides: Partial<Record<SpeciesId, number>>,
): Trajectory {
  return integrate({ model, params, profile, initialOverrides });
}

function presetScenario(model: ModelDefinition, preset: Preset) {
  const params = { ...defaultParameterValues(model), ...preset.paramOverrides };
  const profile = structuredClone(preset.profile);
  const initialOverrides = { ...preset.initialOverrides };
  return { params, profile, initialOverrides };
}

const initialPreset = presetById(defaultPresetId);
const initialScenario = presetScenario(demonstrationModel, initialPreset);

export const useSimulationStore = create<SimulationState>((set, get) => ({
  model: demonstrationModel,
  presetId: initialPreset.id,
  ...initialScenario,
  trajectory: computeTrajectory(
    demonstrationModel,
    initialScenario.params,
    initialScenario.profile,
    initialScenario.initialOverrides,
  ),

  time: 0,
  playing: true,
  speed: 1,

  selection: null,
  rateView: 'directional',
  legendOpen: true,
  inspectorOpen: false,
  hoverTime: null,
  reducedMotionOverride: null,

  selectPreset: (id) => {
    const { model } = get();
    const scenario = presetScenario(model, presetById(id));
    set({
      presetId: id,
      ...scenario,
      trajectory: computeTrajectory(
        model,
        scenario.params,
        scenario.profile,
        scenario.initialOverrides,
      ),
      time: 0,
      playing: true,
    });
  },

  setParam: (id, value) => {
    const { model, params, profile, initialOverrides, time } = get();
    const next = { ...params, [id]: clampParameterValue(model, id, value) };
    const trajectory = computeTrajectory(model, next, profile, initialOverrides);
    set({ params: next, trajectory, time: Math.min(time, trajectory.duration) });
  },

  setProfileKind: (kind) => {
    const { model, params, initialOverrides, profile } = get();
    if (kind === profile.kind) return;
    const defaults: Record<InputProfile['kind'], InputProfile> = {
      none: { kind: 'none' },
      constant: { kind: 'constant', rate: 0.8 },
      pulse: { kind: 'pulse', amplitude: 2.6, center: 8, width: 2.2 },
      sine: { kind: 'sine', base: 0.7, amplitude: 0.6, period: 18 },
    };
    const next = defaults[kind];
    set({
      profile: next,
      trajectory: computeTrajectory(model, params, next, initialOverrides),
    });
  },

  setProfileField: (key, value) => {
    const { model, params, initialOverrides, profile } = get();
    if (profile.kind === 'none' || Number.isNaN(value)) return;
    const next = { ...profile, [key]: value } as InputProfile;
    set({
      profile: next,
      trajectory: computeTrajectory(model, params, next, initialOverrides),
    });
  },

  resetToPresetDefaults: () => {
    const { presetId, selectPreset } = get();
    selectPreset(presetId);
  },

  play: () => {
    const { time, trajectory } = get();
    // Play from the start again if we are parked at the end.
    set({ playing: true, time: time >= trajectory.duration ? 0 : time });
  },
  pause: () => set({ playing: false }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  restart: () => set({ time: 0, playing: true }),

  setTime: (t) => {
    const { trajectory } = get();
    set({ time: Math.min(trajectory.duration, Math.max(0, t)) });
  },

  advance: (dtWall) => {
    const { time, speed, trajectory, playing } = get();
    if (!playing) return;
    const next = time + dtWall * speed;
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
}));
