import type { SpeciesDef } from '../../model/schema.ts';
import { formatAmount } from '../../lib/formatting/format.ts';
import { quantityToFill } from '../visual-scales.ts';
import type { VesselGeom } from '../network/geometry.ts';

interface Props {
  species: SpeciesDef;
  geom: VesselGeom;
  quantity: number;
  unit: string;
  selected: boolean;
  onSelect: () => void;
}

/**
 * A species vessel. Fill height encodes quantity (linear vs displayCapacity);
 * the symbol letter and label carry identity so color is never alone.
 */
export function NodeVessel({ species, geom, quantity, unit, selected, onSelect }: Props) {
  const fill = quantityToFill(quantity, species.displayCapacity);
  const fillH = fill * (geom.h - 12);
  const fillY = geom.y + geom.h - 6 - fillH;
  const color = `var(${species.colorVar})`;

  return (
    <g
      className={`vessel${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${species.label}: ${formatAmount(quantity)} ${unit}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Open-top instrument column: left/right hairlines + baseline, no top edge. */}
      <line
        className="vessel-edge"
        x1={geom.x}
        y1={geom.y}
        x2={geom.x}
        y2={geom.y + geom.h}
      />
      <line
        className="vessel-edge"
        x1={geom.x + geom.w}
        y1={geom.y}
        x2={geom.x + geom.w}
        y2={geom.y + geom.h}
      />
      <line
        className="vessel-edge"
        x1={geom.x}
        y1={geom.y + geom.h}
        x2={geom.x + geom.w}
        y2={geom.y + geom.h}
      />
      {/* gauge ticks at 25/50/75%, touching only the left hairline */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          className="vessel-tick"
          x1={geom.x}
          x2={geom.x + 8}
          y1={geom.y + geom.h - 6 - f * (geom.h - 12)}
          y2={geom.y + geom.h - 6 - f * (geom.h - 12)}
        />
      ))}
      {fillH > 0.5 && (
        <>
          <rect
            x={geom.x + 5}
            y={fillY}
            width={geom.w - 10}
            height={fillH}
            rx={5}
            fill={color}
            opacity={0.22}
          />
          <line
            x1={geom.x + 5}
            x2={geom.x + geom.w - 5}
            y1={fillY}
            y2={fillY}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </>
      )}
      <text className="vessel-symbol" x={geom.cx} y={geom.y - 12} textAnchor="middle">
        {species.symbol}
      </text>
      <text className="vessel-label" x={geom.cx} y={geom.y + geom.h + 24} textAnchor="middle">
        {species.label}
      </text>
      <text className="vessel-value t-num" x={geom.cx} y={geom.y + geom.h + 46} textAnchor="middle">
        {formatAmount(quantity)} {unit}
      </text>
    </g>
  );
}
