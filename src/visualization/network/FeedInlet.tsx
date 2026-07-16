import { useMemo } from 'react';
import { evaluateProfile } from '../../model/input-profiles.ts';
import type { InputProfile } from '../../model/schema.ts';
import { formatAmount } from '../../lib/formatting/format.ts';
import type { NetworkGeometry } from './geometry.ts';

interface Props {
  geom: NonNullable<NetworkGeometry['feed']>;
  profile: InputProfile;
  duration: number;
  time: number;
  currentRate: number;
  unit: string;
}

/**
 * The external feed source: a small profile sparkline showing u(t) over the
 * whole run, with a marker at the current time, above the feed pipe.
 */
export function FeedInlet({ geom, profile, duration, time, currentRate, unit }: Props) {
  const w = 118;
  const h = 34;
  const x = geom.x1 + 6;
  const y = geom.y1 - 78;

  const { path, max } = useMemo(() => {
    const n = 80;
    let max = 0;
    const values: number[] = [];
    for (let i = 0; i <= n; i++) {
      const v = evaluateProfile(profile, (i / n) * duration);
      values.push(v);
      if (v > max) max = v;
    }
    const scale = max > 0 ? max : 1;
    const pts = values.map((v, i) => `${x + (i / n) * w},${y + h - 3 - (v / scale) * (h - 8)}`);
    return { path: `M ${pts.join(' L ')}`, max };
  }, [profile, duration, x, y]);

  const markerX = x + (Math.min(time, duration) / duration) * w;
  const markerV = evaluateProfile(profile, Math.min(time, duration));
  const markerY = y + h - 3 - (max > 0 ? (markerV / max) * (h - 8) : 0);

  return (
    <g className="feed" aria-hidden="true">
      <text className="t-label feed-title" x={x} y={y - 8}>
        Feed
      </text>
      <rect className="feed-spark-frame" x={x - 6} y={y - 4} width={w + 12} height={h + 8} rx={6} />
      <path className="feed-spark" d={path} />
      <circle className="feed-spark-dot" cx={markerX} cy={markerY} r={3} />
      <text
        className="channel-rate t-num"
        x={(geom.x1 + geom.x2) / 2}
        y={geom.y1 + 22}
        textAnchor="middle"
      >
        {formatAmount(currentRate)} {unit}/s
      </text>
    </g>
  );
}
