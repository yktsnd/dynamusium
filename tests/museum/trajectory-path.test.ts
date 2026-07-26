import { describe, expect, it } from 'vitest';
import {
  overflowExcursionStarts,
  visibleTrajectoryPath,
} from '../../src/museum/trajectory-path.ts';

describe('trajectory path clipping', () => {
  it('breaks the path around out-of-domain excursions instead of drawing a boundary plateau', () => {
    const points = [
      { x: 10, y: 20, outsideDomain: false },
      { x: 20, y: 25, outsideDomain: false },
      { x: 30, y: 0, outsideDomain: true },
      { x: 40, y: 0, outsideDomain: true },
      { x: 50, y: 30, outsideDomain: false },
      { x: 60, y: 35, outsideDomain: false },
    ];

    expect(visibleTrajectoryPath(points)).toBe('M10.0,20.0 L20.0,25.0 M50.0,30.0 L60.0,35.0');
    expect(visibleTrajectoryPath(points)).not.toContain('L30.0,0.0');
  });

  it('returns one explicit marker per overflow excursion', () => {
    const points = [
      { x: 0, y: 0, outsideDomain: true },
      { x: 1, y: 0, outsideDomain: true },
      { x: 2, y: 2, outsideDomain: false },
      { x: 3, y: 3, outsideDomain: true },
      { x: 4, y: 4, outsideDomain: false },
    ];

    expect(overflowExcursionStarts(points)).toEqual([points[0], points[3]]);
  });
});
