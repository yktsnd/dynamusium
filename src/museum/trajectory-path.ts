export interface ScreenTrajectoryPoint {
  x: number;
  y: number;
  outsideDomain: boolean;
}

function assertScreenPoint(point: ScreenTrajectoryPoint, index: number): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`Trajectory screen point ${index} is non-finite.`);
  }
}

/**
 * Build only the portions supported by the declared visual domain. A clipped
 * run is split into separate subpaths, so out-of-domain samples can never be
 * turned into a false plateau along the viewport boundary.
 */
export function visibleTrajectoryPath(points: readonly ScreenTrajectoryPoint[]): string {
  const commands: string[] = [];
  let segmentOpen = false;
  points.forEach((point, index) => {
    assertScreenPoint(point, index);
    if (point.outsideDomain) {
      segmentOpen = false;
      return;
    }
    commands.push(`${segmentOpen ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`);
    segmentOpen = true;
  });
  return commands.join(' ');
}

/** One marker per excursion is sufficient evidence without drawing a border stripe. */
export function overflowExcursionStarts(
  points: readonly ScreenTrajectoryPoint[],
): ScreenTrajectoryPoint[] {
  const starts: ScreenTrajectoryPoint[] = [];
  points.forEach((point, index) => {
    assertScreenPoint(point, index);
    if (point.outsideDomain && (index === 0 || !points[index - 1]?.outsideDomain)) {
      starts.push(point);
    }
  });
  return starts;
}
