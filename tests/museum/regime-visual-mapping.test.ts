import { describe, expect, it } from 'vitest';
import { workBySlug } from '../../src/museum/catalog.ts';
import { numericDomain } from '../../src/museum/semantic-visual.ts';
import { simulateWork } from '../../src/museum/simulation.ts';

describe('reviewed regime visual mappings', () => {
  it.each(['lorenz-atmosphere', 'lotka-volterra'])(
    '%s resolves one fixed path scale per preset',
    (slug) => {
      const work = workBySlug.get(slug);
      if (!work || work.schemaVersion !== 2) throw new Error(`Missing v2 work ${slug}.`);

      for (const preset of work.presets) {
        const regime = work.portrait.parameterRegimes.find((candidate) =>
          candidate.presetIds.includes(preset.id),
        );
        if (!regime) throw new Error(`${slug}/${preset.id} has no reviewed regime.`);
        const layers = work.portrait.visualMappings.filter(
          (layer) => layer.mark === 'path' && layer.appliesToRegimeIds.includes(regime.id),
        );
        expect(layers, `${slug}/${preset.id}`).toHaveLength(1);
        const layer = layers[0];
        const xBinding = layer?.bindings.find((binding) => binding.channel === 'position-x');
        const yBinding = layer?.bindings.find((binding) => binding.channel === 'position-y');
        if (!xBinding || !yBinding) throw new Error(`${slug}/${preset.id} lacks x/y bindings.`);
        const result = simulateWork(work, preset.values);
        const x = result.series.find((candidate) => candidate.id === xBinding.quantityRef);
        const y = result.series.find((candidate) => candidate.id === yBinding.quantityRef);
        if (!x || !y) throw new Error(`${slug}/${preset.id} lacks projected series.`);
        const [xMinimum, xMaximum] = numericDomain(xBinding);
        const [yMinimum, yMaximum] = numericDomain(yBinding);
        expect(Math.min(...x.values), `${slug}/${preset.id}/x minimum`).toBeGreaterThanOrEqual(
          xMinimum,
        );
        expect(Math.max(...x.values), `${slug}/${preset.id}/x maximum`).toBeLessThanOrEqual(
          xMaximum,
        );
        expect(Math.min(...y.values), `${slug}/${preset.id}/y minimum`).toBeGreaterThanOrEqual(
          yMinimum,
        );
        expect(Math.max(...y.values), `${slug}/${preset.id}/y maximum`).toBeLessThanOrEqual(
          yMaximum,
        );
      }
    },
  );
});
