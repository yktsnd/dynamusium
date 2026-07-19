import { describe, expect, it } from 'vitest';
import { works } from '../../src/museum/catalog.ts';
import type { ChannelBinding } from '../../src/museum/portrait-types.ts';
import { validatePortraitExtension } from '../../src/museum/portrait-validation.ts';
import {
  encodeNumericValue,
  findVisualBinding,
  numericDomain,
  normalizedZero,
  requireVisualBinding,
  visualLayers,
} from '../../src/museum/semantic-visual.ts';
import { simulateWork } from '../../src/museum/simulation.ts';
import type { WorkManifest, WorkResult } from '../../src/museum/types.ts';

function numericBinding(
  scale: Extract<ChannelBinding['scale'], 'linear' | 'sqrt' | 'log' | 'symlog' | 'cyclic'>,
  domain: readonly [number, number],
  outOfDomain: ChannelBinding['outOfDomain'] = 'overflow-indicator',
): ChannelBinding {
  return {
    quantityRef: 'test-quantity',
    channel: 'luminance',
    scale,
    domain,
    outOfDomain,
  };
}

function resolvedParameters(work: WorkManifest): Record<string, number> {
  return Object.fromEntries(work.parameters.map((parameter) => [parameter.id, parameter.default]));
}

const resultCache = new Map<string, WorkResult>();

function resultFor(work: WorkManifest): WorkResult {
  const cached = resultCache.get(work.slug);
  if (cached) return cached;
  const result = simulateWork(work, resolvedParameters(work));
  resultCache.set(work.slug, result);
  return result;
}

function availableQuantityRefs(result: WorkResult): Set<string> {
  const refs = new Set(result.series.map((series) => series.id));
  for (const coordinateId of result.numerical?.state?.coordinateIds ?? []) {
    refs.add(coordinateId);
  }
  for (const frame of result.numerical?.fieldFrames ?? []) {
    for (const componentId of Object.keys(frame.components)) refs.add(componentId);
  }
  if (result.field?.componentId) refs.add(result.field.componentId);
  return refs;
}

describe('semantic visual value encoding', () => {
  it.each([
    ['linear', numericBinding('linear', [0, 10]), 2.5, 0.25],
    ['sqrt', numericBinding('sqrt', [0, 100]), 25, 0.5],
    ['log', numericBinding('log', [1, 100]), 10, 0.5],
    ['symlog', numericBinding('symlog', [-9, 9]), 0, 0.5],
  ] as const)(
    '%s uses its declared transform and fixed domain',
    (_name, binding, value, expected) => {
      expect(encodeNumericValue(value, binding)).toEqual({
        normalized: expected,
        encodedValue: value,
        outsideDomain: false,
      });
    },
  );

  it('wraps cyclic values without changing the declared period', () => {
    const binding = numericBinding('cyclic', [0, Math.PI * 2], 'wrap-cyclic');
    const encoded = encodeNumericValue(Math.PI * 2.5, binding);
    expect(encoded.normalized).toBeCloseTo(0.25, 12);
    expect(encoded.encodedValue).toBeCloseTo(Math.PI / 2, 12);
    expect(encoded.outsideDomain).toBe(true);
  });

  it('keeps categorical values out of the numeric encoding path', () => {
    const categorical: ChannelBinding = {
      quantityRef: 'direction',
      channel: 'direction',
      scale: 'categorical',
      domain: ['forward', 'reverse'],
      outOfDomain: 'overflow-indicator',
    };
    expect(() => numericDomain(categorical)).toThrow(/numeric domain/);
    expect(() => encodeNumericValue(0, categorical)).toThrow(/not numeric/);
  });

  it('never silently accepts non-finite scientific values', () => {
    const binding = numericBinding('linear', [0, 1]);
    expect(() => encodeNumericValue(Number.NaN, binding)).toThrow(/non-finite/);
    expect(() => encodeNumericValue(Number.POSITIVE_INFINITY, binding)).toThrow(/non-finite/);
  });

  it('flags overflow while preserving the underlying value for Study evidence', () => {
    for (const outOfDomain of ['overflow-indicator', 'clip-with-indicator'] as const) {
      const encoded = encodeNumericValue(12, numericBinding('linear', [0, 10], outOfDomain));
      expect(encoded).toEqual({ normalized: 1, encodedValue: 12, outsideDomain: true });
    }
  });

  it('applies wrap-cyclic as an explicit out-of-domain policy', () => {
    const encoded = encodeNumericValue(12, numericBinding('linear', [0, 10], 'wrap-cyclic'));
    expect(encoded).toEqual({ normalized: 0.2, encodedValue: 2, outsideDomain: true });
  });

  it('resolves and validates an explicit scientific zero baseline', () => {
    const binding = { ...numericBinding('symlog', [-9, 9]), zero: 0 };
    expect(normalizedZero(binding)).toBe(0.5);
    expect(() => normalizedZero({ ...binding, zero: 10 })).toThrow(/outside its numeric domain/);

    const work = works[0];
    expect(work?.schemaVersion).toBe(2);
    if (!work || work.schemaVersion !== 2) return;
    const altered = structuredClone(work.portrait);
    const firstBinding = altered.visualMappings[0]?.bindings[0];
    if (!firstBinding || typeof firstBinding.domain[0] !== 'number') return;
    firstBinding.zero = Number(firstBinding.domain[1]) + 1;
    expect(validatePortraitExtension(altered)).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: expect.stringMatching(/\/zero$/) })]),
    );
  });
});

describe('permanent collection semantic visual contract', () => {
  it('resolves every scientific visual reference against computed output', () => {
    const issues: string[] = [];
    expect(works).toHaveLength(30);

    for (const work of works) {
      expect(work.schemaVersion, work.slug).toBe(2);
      if (work.schemaVersion !== 2) continue;
      const available = availableQuantityRefs(resultFor(work));
      for (const layer of visualLayers(work)) {
        for (const binding of layer.bindings) {
          if (!available.has(binding.quantityRef)) {
            issues.push(`${work.slug}/${layer.id}: unresolved quantityRef ${binding.quantityRef}`);
          }
          if (binding.uncertaintyRef && !available.has(binding.uncertaintyRef)) {
            issues.push(
              `${work.slug}/${layer.id}: unresolved uncertaintyRef ${binding.uncertaintyRef}`,
            );
          }
          if (binding.eventAccumulatorRef && !available.has(binding.eventAccumulatorRef)) {
            issues.push(
              `${work.slug}/${layer.id}: unresolved eventAccumulatorRef ${binding.eventAccumulatorRef}`,
            );
          }
        }
      }
    }

    expect(issues).toEqual([]);
  }, 60_000);

  it('binds each field raster component and value domain to the displayed WorkResult field', () => {
    const fieldWorks = works.filter((work) => work.render === 'field');
    expect(fieldWorks.length).toBeGreaterThan(0);

    for (const work of fieldWorks) {
      expect(work.schemaVersion, work.slug).toBe(2);
      if (work.schemaVersion !== 2) continue;
      const result = resultFor(work);
      const field = result.field;
      expect(field, `${work.slug} did not expose a display field`).toBeDefined();
      if (!field?.componentId || !field.valueDomain) continue;

      const binding = requireVisualBinding(work, field.componentId, 'luminance');
      expect(numericDomain(binding), `${work.slug} field scale drifted`).toEqual(field.valueDomain);
      expect(
        result.numerical?.fieldFrames?.every(
          (frame) => frame.components[field.componentId!] !== undefined,
        ),
        `${work.slug} field frames omit ${field.componentId}`,
      ).toBe(true);
    }
  }, 60_000);

  it('keeps every path projection aligned with its reviewed x and y quantities', () => {
    for (const work of works) {
      expect(work.schemaVersion, work.slug).toBe(2);
      if (work.schemaVersion !== 2) continue;
      const result = resultFor(work);
      const byId = new Map(result.series.map((series) => [series.id, series]));

      for (const layer of visualLayers(work).filter((candidate) => candidate.mark === 'path')) {
        const xBinding = layer.bindings.find((binding) => binding.channel === 'position-x');
        const yBinding = layer.bindings.find((binding) => binding.channel === 'position-y');
        expect(xBinding, `${work.slug}/${layer.id} has no x binding`).toBeDefined();
        expect(yBinding, `${work.slug}/${layer.id} has no y binding`).toBeDefined();
        if (!xBinding || !yBinding) continue;

        expect(layer.projection?.coordinateRefs, `${work.slug}/${layer.id}`).toEqual([
          xBinding.quantityRef,
          yBinding.quantityRef,
        ]);
        const xSeries = byId.get(xBinding.quantityRef);
        const ySeries = byId.get(yBinding.quantityRef);
        expect(xSeries, `${work.slug} omits ${xBinding.quantityRef}`).toBeDefined();
        expect(ySeries, `${work.slug} omits ${yBinding.quantityRef}`).toBeDefined();
        if (!xSeries || !ySeries) continue;

        expect(result.points).toHaveLength(result.times.length);
        const sampleIndices = [0, Math.floor(result.times.length / 2), result.times.length - 1];
        for (const index of sampleIndices) {
          expect(result.points[index]?.x, `${work.slug} x sample ${index}`).toBe(
            xSeries.values[index],
          );
          expect(result.points[index]?.y, `${work.slug} y sample ${index}`).toBe(
            ySeries.values[index],
          );
        }
      }
    }
  }, 60_000);

  it('requires event frequency to name both a positive quantum and computed accumulator', () => {
    const eventBindings: Array<{ work: WorkManifest; binding: ChannelBinding }> = [];
    for (const work of works) {
      for (const layer of visualLayers(work)) {
        for (const binding of layer.bindings) {
          if (binding.channel === 'event-frequency') eventBindings.push({ work, binding });
        }
      }
    }
    expect(eventBindings).toHaveLength(3);

    for (const { work, binding } of eventBindings) {
      expect(binding.eventQuantum, `${work.slug}/${binding.quantityRef}`).toBeGreaterThan(0);
      expect(binding.eventAccumulatorRef, `${work.slug}/${binding.quantityRef}`).toBeTruthy();
      expect(availableQuantityRefs(resultFor(work))).toContain(binding.eventAccumulatorRef);
      expect(findVisualBinding(work, binding.quantityRef, 'event-frequency')).toBe(binding);
    }

    const fed = works.find((work) => work.kernel === 'reaction-chain');
    if (!fed || fed.schemaVersion !== 2) throw new Error('Fed Reaction Chain portrait missing.');
    const altered = structuredClone(fed.portrait);
    const event = altered.visualMappings
      .flatMap((layer) => layer.bindings)
      .find((binding) => binding.channel === 'event-frequency');
    if (!event) throw new Error('Fed Reaction Chain event binding missing.');
    delete event.eventAccumulatorRef;
    expect(validatePortraitExtension(altered)).toContainEqual({
      path: expect.stringMatching(/\/eventQuantum$/),
      message: expect.stringMatching(/precomputed event accumulator/),
    });
  });
});
