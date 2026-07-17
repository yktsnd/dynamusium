import type { ProcessRates } from '../../model/schema.ts';
import { formatSigned } from '../../lib/formatting/format.ts';
import { INACTIVE_RATE_FRACTION, rateToWidth } from '../visual-scales.ts';
import type { ChannelGeom, LaneGeom } from '../network/geometry.ts';
import type { RateView } from '../../state/simulation-store.ts';

interface Props {
  geom: ChannelGeom;
  rates: ProcessRates;
  rateScale: number;
  rateView: RateView;
  /** CSS color for the channel (destination-node color). */
  forwardColor: string;
  reverseColor: string;
  unit: string;
  selected: boolean;
  onSelect: () => void;
  showRateLabel: boolean;
}

function laneRate(lane: LaneGeom, rates: ProcessRates, view: RateView): number {
  if (view === 'directional') return lane.dir === 'forward' ? rates.forward : rates.reverse;
  return lane.dir === 'forward' ? Math.max(0, rates.net) : Math.max(0, -rates.net);
}

function Chevrons({ lane }: { lane: LaneGeom }) {
  const dir = lane.x2 >= lane.x1 ? 1 : -1;
  const midX = (lane.x1 + lane.x2) / 2;
  const y = lane.y1;
  return (
    <g className="chevrons">
      <path d={`M ${midX - 3.5 * dir} ${y - 4} l ${7 * dir} 4 l ${-7 * dir} 4`} fill="none" />
    </g>
  );
}

/**
 * A transfer channel. A permanent hairline shows the structural connection at
 * all times; a rate band (stroke width encodes |rate|, sqrt scale) layers on
 * top only while active. One chevron per lane encodes direction regardless of
 * activity. In directional view a reversible channel shows both lanes; in net
 * view a single lane shows the signed net rate.
 */
export function Channel({
  geom,
  rates,
  rateScale,
  rateView,
  forwardColor,
  reverseColor,
  unit,
  selected,
  onSelect,
  showRateLabel,
}: Props) {
  const lanes = rateView === 'directional' ? geom.lanes : netLanes(geom, rates);
  // Keep short-channel labels clear of the node/basin bodies on either side.
  const lo = Math.min(geom.center.x1, geom.center.x2);
  const hi = Math.max(geom.center.x1, geom.center.x2);
  const midX = Math.min(hi - 40, Math.max(lo + 2, (lo + hi) / 2));
  const labelY = geom.center.y1 + (geom.reversible && rateView === 'directional' ? 30 : 22);

  return (
    <g
      className={`channel${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${geom.process.label}: net rate ${formatSigned(rates.net)} ${unit} per second`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* generous invisible hit area */}
      <line
        className="channel-hit"
        x1={Math.min(geom.center.x1, geom.center.x2)}
        x2={Math.max(geom.center.x1, geom.center.x2)}
        y1={geom.center.y1}
        y2={geom.center.y2}
      />
      {lanes.map((lane) => {
        const r = laneRate(lane, rates, rateView);
        const active = r > rateScale * INACTIVE_RATE_FRACTION;
        const color = lane.dir === 'forward' ? forwardColor : reverseColor;
        return (
          <g key={lane.dir}>
            {/* Permanent structural hairline: visible even at zero rate. */}
            <line
              className="channel-hairline"
              x1={lane.x1}
              y1={lane.y1}
              x2={lane.x2}
              y2={lane.y2}
            />
            {active && (
              <line
                className="channel-lane"
                x1={lane.x1}
                y1={lane.y1}
                x2={lane.x2}
                y2={lane.y2}
                stroke={color}
                strokeWidth={rateToWidth(r, rateScale)}
                strokeOpacity={0.3}
              />
            )}
            <Chevrons lane={lane} />
          </g>
        );
      })}
      {showRateLabel && (
        <text className="channel-rate t-num" x={midX} y={labelY} textAnchor="middle">
          {formatSigned(rates.net)} {unit}/s
        </text>
      )}
    </g>
  );
}

/** Net view: one lane, oriented by the sign of the net rate. */
function netLanes(geom: ChannelGeom, rates: ProcessRates): LaneGeom[] {
  if (!geom.reversible || rates.net >= 0) return [geom.center];
  const c = geom.center;
  return [{ dir: 'reverse', x1: c.x2, y1: c.y2, x2: c.x1, y2: c.y1 }];
}
