import type { ReservoirDef } from '../../model/schema.ts';
import { formatAmount } from '../../lib/formatting/format.ts';
import { quantityToFill } from '../visual-scales.ts';
import type { NetworkGeometry } from '../network/geometry.ts';

interface Props {
  reservoir: ReservoirDef;
  geom: NetworkGeometry['basin'];
  amount: number;
  unit: string;
}

/**
 * The collected-output basin. Its fill only ever rises (cumulative output is
 * nondecreasing); a broader, shorter silhouette distinguishes it from the
 * species vessels.
 */
export function ReservoirBasin({ reservoir, geom, amount, unit }: Props) {
  const fill = quantityToFill(amount, reservoir.displayCapacity);
  const fillH = fill * (geom.h - 10);
  const color = `var(${reservoir.colorVar})`;
  const bright = 'var(--reservoir-bright)';

  return (
    <g
      className="basin"
      role="img"
      aria-label={`${reservoir.label}: ${formatAmount(amount)} ${unit} collected`}
    >
      <path
        className="basin-body"
        d={`M ${geom.x} ${geom.y} V ${geom.y + geom.h - 14} Q ${geom.x} ${geom.y + geom.h} ${geom.x + 14} ${geom.y + geom.h} H ${geom.x + geom.w - 14} Q ${geom.x + geom.w} ${geom.y + geom.h} ${geom.x + geom.w} ${geom.y + geom.h - 14} V ${geom.y}`}
      />
      {fillH > 0.5 && (
        <>
          <rect
            x={geom.x + 5}
            y={geom.y + geom.h - 5 - fillH}
            width={geom.w - 10}
            height={fillH}
            rx={4}
            fill={color}
            opacity={0.5}
          />
          <line
            x1={geom.x + 5}
            x2={geom.x + geom.w - 5}
            y1={geom.y + geom.h - 5 - fillH}
            y2={geom.y + geom.h - 5 - fillH}
            stroke={bright}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </>
      )}
      <text className="vessel-label" x={geom.cx} y={geom.y + geom.h + 24} textAnchor="middle">
        {reservoir.label}
      </text>
      <text className="vessel-value t-num" x={geom.cx} y={geom.y + geom.h + 46} textAnchor="middle">
        {formatAmount(amount)} {unit}
      </text>
    </g>
  );
}
