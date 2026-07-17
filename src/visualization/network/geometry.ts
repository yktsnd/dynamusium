import type { ModelDefinition, ProcessDef } from '../../model/schema.ts';

/**
 * Computes all network geometry in one place, from model layout metadata.
 * The SVG uses a fixed 1000 x 400 internal coordinate space and scales
 * responsively via viewBox.
 */

export const VIEW_W = 1000;
export const VIEW_H = 400;

export const VESSEL_W = 64;
export const VESSEL_H = 230;
export const BASIN_W = 150;
export const BASIN_H = 110;

/** Vertical offset between the two lanes of a reversible channel. */
export const LANE_OFFSET = 9;

export interface VesselGeom {
  speciesId: string;
  cx: number;
  cy: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaneGeom {
  /** 'forward' runs from -> to; 'reverse' runs to -> from. */
  dir: 'forward' | 'reverse';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ChannelGeom {
  process: ProcessDef;
  /** Lane at offset 0 used in net view. */
  center: LaneGeom;
  /** Offset lanes used in directional view (reverse lane only if reversible). */
  lanes: LaneGeom[];
  reversible: boolean;
}

export interface NetworkGeometry {
  vessels: Map<string, VesselGeom>;
  channels: ChannelGeom[];
  basin: { x: number; y: number; w: number; h: number; cx: number };
  /** Feed pipe endpoint geometry (points at the first inflow target). */
  feed: { x1: number; y1: number; x2: number; y2: number } | null;
}

const px = (x: number) => (x / 100) * VIEW_W;
const py = (y: number) => (y / 100) * VIEW_H;

export function computeGeometry(model: ModelDefinition): NetworkGeometry {
  const vessels = new Map<string, VesselGeom>();
  for (const s of model.species) {
    const cx = px(s.layout.x);
    const cy = py(s.layout.y);
    vessels.set(s.id, {
      speciesId: s.id,
      cx,
      cy,
      x: cx - VESSEL_W / 2,
      y: cy - VESSEL_H / 2,
      w: VESSEL_W,
      h: VESSEL_H,
    });
  }

  const basinCx = px(model.reservoir.layout.x);
  const basinCy = py(model.reservoir.layout.y);
  const vesselBottom = [...vessels.values()][0]?.y + VESSEL_H || basinCy;
  const basin = {
    x: basinCx - BASIN_W / 2,
    y: vesselBottom - BASIN_H,
    w: BASIN_W,
    h: BASIN_H,
    cx: basinCx,
  };

  const lane = (x1: number, x2: number, y: number, dir: 'forward' | 'reverse'): LaneGeom =>
    dir === 'forward' ? { dir, x1, y1: y, x2, y2: y } : { dir, x1: x2, y1: y, x2: x1, y2: y };

  const channels: ChannelGeom[] = [];
  let feed: NetworkGeometry['feed'] = null;

  for (const proc of model.processes) {
    if (proc.kind === 'inflow') {
      const v = vessels.get(proc.to)!;
      feed = { x1: Math.max(18, v.x - 168), y1: v.cy, x2: v.x, y2: v.cy };
      channels.push({
        process: proc,
        center: { dir: 'forward', x1: feed.x1, y1: feed.y1, x2: feed.x2, y2: feed.y2 },
        lanes: [{ dir: 'forward', x1: feed.x1, y1: feed.y1, x2: feed.x2, y2: feed.y2 }],
        reversible: false,
      });
    } else if (proc.kind === 'conversion') {
      const a = vessels.get(proc.from)!;
      const b = vessels.get(proc.to)!;
      const [left, right] = a.cx < b.cx ? [a, b] : [b, a];
      const x1 = left.x + left.w;
      const x2 = right.x;
      const y = a.cy;
      const forwardLtr = a.cx < b.cx;
      const reversible = proc.reverseParam !== undefined;
      const mk = (yy: number, dir: 'forward' | 'reverse') =>
        forwardLtr === (dir === 'forward')
          ? { dir, x1, y1: yy, x2, y2: yy }
          : { dir, x1: x2, y1: yy, x2: x1, y2: yy };
      channels.push({
        process: proc,
        center: mk(y, 'forward'),
        lanes: reversible
          ? [mk(y - LANE_OFFSET, 'forward'), mk(y + LANE_OFFSET, 'reverse')]
          : [mk(y, 'forward')],
        reversible,
      });
    } else {
      const v = vessels.get(proc.from)!;
      const x1 = v.x + v.w;
      const x2 = basin.x;
      channels.push({
        process: proc,
        center: lane(x1, x2, v.cy, 'forward'),
        lanes: [lane(x1, x2, v.cy, 'forward')],
        reversible: false,
      });
    }
  }

  return { vessels, channels, basin, feed };
}
