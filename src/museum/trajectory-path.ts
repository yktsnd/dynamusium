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

/** Reduce path detail while retaining every transition into or out of a clipped run. */
export function decimateTrajectoryPoints(
  points: readonly ScreenTrajectoryPoint[],
  maximumPoints: number,
): ScreenTrajectoryPoint[] {
  if (!Number.isInteger(maximumPoints) || maximumPoints < 2) {
    throw new Error('Trajectory sampling needs a point limit of at least two.');
  }
  if (points.length <= maximumPoints) return [...points];

  const selected = new Set<number>();
  const stride = Math.ceil(points.length / maximumPoints);
  for (let index = 0; index < points.length; index += stride) selected.add(index);
  selected.add(points.length - 1);

  points.forEach((point, index) => {
    assertScreenPoint(point, index);
    const previous = points[index - 1];
    if (previous && point.outsideDomain !== previous.outsideDomain) {
      selected.add(index - 1);
      selected.add(index);
    }
  });

  return [...selected].sort((left, right) => left - right).map((index) => points[index]!);
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
