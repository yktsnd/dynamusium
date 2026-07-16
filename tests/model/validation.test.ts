import { describe, expect, it } from 'vitest';
import { demonstrationModel } from '../../src/model/demonstration-model.ts';
import type { ModelDefinition } from '../../src/model/schema.ts';
import {
  clampParameterValue,
  defaultParameterValues,
  validateModel,
} from '../../src/model/validation.ts';

function clone(): ModelDefinition {
  return structuredClone(demonstrationModel);
}

describe('validateModel', () => {
  it('returns no errors for the demonstration model', () => {
    expect(validateModel(demonstrationModel)).toEqual([]);
  });

  it('flags a process referencing an unknown species', () => {
    const model = clone();
    const ab = model.processes.find((p) => p.id === 'ab');
    if (!ab || ab.kind !== 'conversion') throw new Error('fixture assumption broken');
    ab.from = 'nonexistent-species';
    const errors = validateModel(model);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some((e) => e.includes('unknown species') && e.includes('nonexistent-species')),
    ).toBe(true);
  });

  it('flags a process referencing an unknown parameter', () => {
    const model = clone();
    const ab = model.processes.find((p) => p.id === 'ab');
    if (!ab || ab.kind !== 'conversion') throw new Error('fixture assumption broken');
    ab.forwardParam = 'nonexistent-param';
    const errors = validateModel(model);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some((e) => e.includes('unknown parameter') && e.includes('nonexistent-param')),
    ).toBe(true);
  });

  it('flags a species with a negative initial quantity', () => {
    const model = clone();
    model.species[0].initial = -1;
    const errors = validateModel(model);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('negative initial quantity'))).toBe(true);
  });

  it('flags a parameter whose min exceeds its max', () => {
    const model = clone();
    model.parameters[0].min = 2;
    model.parameters[0].max = 1;
    const errors = validateModel(model);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('min > max'))).toBe(true);
  });

  it('flags a nonpositive dt', () => {
    const model = clone();
    model.config.dt = 0;
    const errors = validateModel(model);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('config.dt must be positive'))).toBe(true);
  });
});

describe('clampParameterValue', () => {
  it('clamps a value below the minimum up to the minimum', () => {
    expect(clampParameterValue(demonstrationModel, 'kf', -5)).toBe(0);
  });

  it('clamps a value above the maximum down to the maximum', () => {
    expect(clampParameterValue(demonstrationModel, 'kf', 100)).toBe(2);
  });

  it('falls back to the parameter default for NaN', () => {
    expect(clampParameterValue(demonstrationModel, 'kf', NaN)).toBe(0.5);
  });
});

describe('defaultParameterValues', () => {
  it('returns an entry for every declared parameter', () => {
    const defaults = defaultParameterValues(demonstrationModel);
    const ids = demonstrationModel.parameters.map((p) => p.id);
    expect(Object.keys(defaults).sort()).toEqual([...ids].sort());
    for (const p of demonstrationModel.parameters) {
      expect(defaults[p.id]).toBe(p.default);
    }
  });
});
