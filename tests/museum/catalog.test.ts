import { describe, expect, it } from 'vitest';
import { galleries, works } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';
import { simulateWork } from '../../src/museum/simulation.ts';

describe('DynaMusium catalog', () => {
  it('contains exactly thirty uniquely addressable works across five galleries', () => {
    expect(works).toHaveLength(30);
    expect(new Set(works.map((work) => work.slug)).size).toBe(30);
    for (const gallery of galleries) {
      expect(works.filter((work) => work.gallery === gallery.id)).toHaveLength(6);
    }
  });

  it('has six flagship works and complete registration metadata', () => {
    expect(works.filter((work) => work.tier === 'flagship')).toHaveLength(6);
    for (const work of works) {
      expect(work.parameters.length).toBeGreaterThanOrEqual(2);
      expect(work.presets).toHaveLength(3);
      expect(work.citations[0]?.url).toMatch(/^https:\/\//);
      expect(work.equation.length).toBeGreaterThan(5);
    }
  });

  it('runs every canonical work deterministically without non-finite output', () => {
    for (const work of works) {
      const first = simulateWork(work, {});
      const second = simulateWork(work, {});
      expect(first.series.length, work.slug).toBeGreaterThan(0);
      expect(new Set(first.series.map((series) => series.id)).size, work.slug).toBe(
        first.series.length,
      );
      expect(first.points.length, work.slug).toBeGreaterThan(10);
      expect(first.series.map((series) => series.values.slice(0, 8))).toEqual(
        second.series.map((series) => series.values.slice(0, 8)),
      );
      for (const series of first.series) {
        expect(series.values.every(Number.isFinite), `${work.slug}/${series.id}`).toBe(true);
      }
      if (first.field) {
        expect(first.field.values.every(Number.isFinite), `${work.slug}/field`).toBe(true);
      }
    }
  }, 60_000);

  it('keeps every preset and parameter boundary finite or surfaces a declared event', () => {
    for (const work of works) {
      const inputs = [
        ...work.presets.map((preset) => preset.values),
        ...work.parameters.flatMap((parameter) => [
          { [parameter.id]: parameter.min },
          { [parameter.id]: parameter.max },
        ]),
      ];
      for (const values of inputs) {
        const execution = executeWork(work, values, `catalog-boundary-${work.slug}`);
        if (execution.run.status === 'invalid') {
          expect(work.slug, JSON.stringify(execution.run.failure)).toBe('restricted-three-body');
          expect(execution.display).toBeNull();
          expect(execution.run.failure.kind).toBe('event-failure');
          expect(execution.run.failure.message).toMatch(/declared .* exclusion radius/i);
          continue;
        }
        const result = execution.display;
        expect(result).not.toBeNull();
        if (!result) continue;
        expect(result.series.length, work.slug).toBeGreaterThan(0);
        for (const series of result.series) {
          expect(series.values.every(Number.isFinite), `${work.slug}/${series.id}`).toBe(true);
        }
        if (result.field) {
          expect(result.field.values.every(Number.isFinite), `${work.slug}/field`).toBe(true);
        }
      }
    }
  }, 180_000);

  it('uses live primary-source links for the repaired historical works', () => {
    expect(works.find((work) => work.slug === 'wave-equation')?.citations[0]?.url).toBe(
      'https://epiphymaths.univ-fcomte.fr/1t1m/d_alembert-recherches_sur_la_courbe_que_forme_une_corde_tendue_mise_en_vibration-1747.pdf',
    );
    expect(works.find((work) => work.slug === 'kepler-orbit')?.citations[0]?.url).toBe(
      'https://doi.org/10.5479/sil.126675.39088002685477',
    );
  });

  it('declares fixed constants and reduced laws used by scientific kernels', () => {
    const bySlug = new Map(works.map((work) => [work.slug, work]));
    const nBody = bySlug.get('n-body-system');
    expect(nBody?.equation).toContain('ε=0.12');
    expect(nBody?.equation).toContain('+ε²');
    expect(bySlug.get('standard-map')?.equation.match(/mod 2π/g)).toHaveLength(2);
    expect(
      bySlug.get('heat-diffusion')?.parameters.find((item) => item.id === 'sources')?.label,
    ).toBe('Initial Fourier modes');
    expect(bySlug.get('schrodinger-wave-packet')?.equation).toContain('V=0');
    expect(bySlug.get('oregonator')?.equation).toContain('ż=0.3');
    expect(bySlug.get('stommel-box')?.equation).toContain('|q|');
    expect(bySlug.get('daisyworld')?.equation).toContain('max(0');
    expect(bySlug.get('carbon-cycle')?.equation).toContain('0.22T');
    expect(bySlug.get('shallow-water')?.equation).toContain('∂ₜη=−H');
    expect(bySlug.get('exoplanet-transit')?.equation).toContain('A_overlap');
  });
});
