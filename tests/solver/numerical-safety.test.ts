import { beforeEach, describe, expect, it } from 'vitest';
import { demonstrationModel } from '../../src/model/demonstration-model.ts';
import type { ModelDefinition, ParameterValues } from '../../src/model/schema.ts';
import { defaultParameterValues } from '../../src/model/validation.ts';
import { presets } from '../../src/features/presets/presets.ts';
import { integrate } from '../../src/solver/integrate.ts';
import { NONNEGATIVE_TOLERANCE } from '../../src/solver/numerical-tolerance.ts';
import type { NumericalErrorKind } from '../../src/solver/simulation-result.ts';
import { useSimulationStore } from '../../src/state/simulation-store.ts';

const DEFINED_KINDS: NumericalErrorKind[] = [
  'negative-quantity',
  'reservoir-decrease',
  'non-finite',
];

describe('numerical safety: healthy default run', () => {
  it('is valid with all-zero-or-nonnegative diagnostics for the demonstration model', () => {
    const result = integrate({
      model: demonstrationModel,
      params: defaultParameterValues(demonstrationModel),
      profile: { kind: 'constant', rate: 0.8 },
    });

    expect(result.status).toBe('valid');
    expect(result.diagnostics.smallClampCount).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.reservoirCorrectionCount).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.stepsCompleted).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.diagnostics.smallClampCount)).toBe(true);
    expect(Number.isFinite(result.diagnostics.reservoirCorrectionCount)).toBe(true);
    expect(Number.isFinite(result.diagnostics.stepsCompleted)).toBe(true);
  });
});

describe('numerical safety: genuine instability is classified as invalid', () => {
  // A single species with a large outflow rate constant, chosen so that
  // k * dt exceeds RK4's real-axis linear stability bound (~2.785). This is
  // a test-only model (never referenced from src/); it exists purely to
  // exercise integrate()'s failure path deterministically.
  const unstableModel: ModelDefinition = {
    id: 'unstable-single-species-test-fixture',
    name: 'Unstable single species (test fixture)',
    description:
      'Single species with an outflow rate constant far beyond the RK4 stability bound, used to exercise the numerical-failure path.',
    timeUnit: 's',
    quantityUnit: 'mol',
    species: [
      {
        id: 's',
        label: 'S',
        symbol: 'S',
        description: 'Test species.',
        initial: 1,
        displayCapacity: 2,
        colorVar: '--species-a',
        layout: { x: 50, y: 50 },
      },
    ],
    processes: [{ kind: 'outflow', id: 'drain', label: 'S → output', from: 's', rateParam: 'k' }],
    parameters: [
      { id: 'k', label: 'Rate constant', unit: '1/s', default: 2000, min: 0, max: 3000, step: 1 },
    ],
    reservoir: {
      label: 'Output',
      description: 'Cumulative output.',
      colorVar: '--reservoir',
      displayCapacity: 2,
      layout: { x: 90, y: 50 },
    },
    config: { duration: 2, dt: 0.02 },
  };

  it('reports status invalid with a well-formed NumericalError', () => {
    const result = integrate({
      model: unstableModel,
      params: defaultParameterValues(unstableModel),
      profile: { kind: 'none' },
    });

    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('expected invalid');

    const { error, diagnostics } = result;
    expect(DEFINED_KINDS).toContain(error.kind);
    expect(['s', 'reservoir']).toContain(error.stateId);
    expect(error.step).toBeGreaterThan(0);
    expect(error.time).toBeGreaterThan(0);
    expect(typeof error.value).toBe('number');
    expect(error.tolerance).toBe(NONNEGATIVE_TOLERANCE);

    const steps = Math.round(unstableModel.config.duration / unstableModel.config.dt);
    expect(diagnostics.stepsCompleted).toBeLessThan(steps);
  });
});

describe('numerical safety: all presets remain valid', () => {
  for (const preset of presets) {
    it(`preset "${preset.id}" is valid with zero smallClampCount`, () => {
      const params = {
        ...defaultParameterValues(demonstrationModel),
        ...preset.paramOverrides,
      } as ParameterValues;
      const profile = structuredClone(preset.profile);
      const initialOverrides = { ...preset.initialOverrides };

      const result = integrate({ model: demonstrationModel, params, profile, initialOverrides });

      expect(result.status).toBe('valid');
      if (result.status !== 'valid') throw new Error('expected valid: ' + result.error.message);
      expect(result.diagnostics.smallClampCount).toBe(0);
    });
  }
});

describe('numerical safety: store propagation of invalid results', () => {
  beforeEach(() => {
    useSimulationStore.getState().selectPreset('steady-feed');
  });

  it('halts playback and freezes time/trajectory once status becomes invalid', () => {
    useSimulationStore.setState({
      status: 'invalid',
      trajectory: null,
      error: {
        kind: 'negative-quantity',
        message: 'test',
        time: 1,
        step: 50,
        stateIndex: 0,
        stateId: 'a',
        value: -1,
        tolerance: 1e-9,
      },
      playing: false,
      time: 0,
    });

    useSimulationStore.getState().play();
    expect(useSimulationStore.getState().playing).toBe(false);

    useSimulationStore.getState().setTime(5);
    expect(useSimulationStore.getState().time).toBe(0);

    useSimulationStore.getState().restart();
    expect(useSimulationStore.getState().time).toBe(0);
    expect(useSimulationStore.getState().playing).toBe(false);

    useSimulationStore.getState().advance(0.1);
    expect(useSimulationStore.getState().time).toBe(0);
  });

  it('recovers to a valid, playable state via resetToPresetDefaults', () => {
    useSimulationStore.setState({
      status: 'invalid',
      trajectory: null,
      error: {
        kind: 'negative-quantity',
        message: 'test',
        time: 1,
        step: 50,
        stateIndex: 0,
        stateId: 'a',
        value: -1,
        tolerance: 1e-9,
      },
      playing: false,
      time: 0,
    });

    useSimulationStore.getState().resetToPresetDefaults();

    const state = useSimulationStore.getState();
    expect(state.status).toBe('valid');
    expect(state.trajectory).not.toBeNull();
    expect(state.playing).toBe(true);
  });
});

describe('numerical safety: reservoir honesty', () => {
  it('produces a nondecreasing reservoir series with zero reservoir corrections for the default run', () => {
    const result = integrate({
      model: demonstrationModel,
      params: defaultParameterValues(demonstrationModel),
      profile: { kind: 'constant', rate: 0.8 },
    });

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') throw new Error('expected valid: ' + result.error.message);

    const { reservoir } = result.trajectory;
    for (let i = 1; i < reservoir.length; i++) {
      expect(reservoir[i]).toBeGreaterThanOrEqual(reservoir[i - 1]);
    }
    expect(result.diagnostics.reservoirCorrectionCount).toBe(0);
  });
});
