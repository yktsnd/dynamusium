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
});
