import { describe, expect, it } from 'vitest';
import { galleries, works } from '../../src/museum/catalog.ts';
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
  });

  it('keeps every preset and parameter boundary finite', () => {
    for (const work of works) {
      const inputs = [
        ...work.presets.map((preset) => preset.values),
        ...work.parameters.flatMap((parameter) => [
          { [parameter.id]: parameter.min },
          { [parameter.id]: parameter.max },
        ]),
      ];
      for (const values of inputs) {
        const result = simulateWork(work, values);
        expect(result.series.length, work.slug).toBeGreaterThan(0);
        for (const series of result.series) {
          expect(series.values.every(Number.isFinite), `${work.slug}/${series.id}`).toBe(true);
        }
        if (result.field) {
          expect(result.field.values.every(Number.isFinite), `${work.slug}/field`).toBe(true);
        }
      }
    }
  });

  it('uses live primary-source links for the repaired historical works', () => {
    expect(works.find((work) => work.slug === 'wave-equation')?.citations[0]?.url).toBe(
      'https://epiphymaths.univ-fcomte.fr/1t1m/d_alembert-recherches_sur_la_courbe_que_forme_une_corde_tendue_mise_en_vibration-1747.pdf',
    );
    expect(works.find((work) => work.slug === 'kepler-orbit')?.citations[0]?.url).toBe(
      'https://doi.org/10.5479/sil.126675.39088002685477',
    );
  });
});
