import { useMemo } from 'react';
import { TRACE_LEFT_FRACTION, TRACE_RIGHT_FRACTION } from '../../charts/trace-layout.ts';
import { formatTime } from '../../lib/formatting/format.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './layout.css';

/**
 * The time axis doubles as the playback scrubber: a hairline track with
 * faint 10-second ticks, using the same left/right fractions as the trace
 * strips above it so the thumb lines up with the playback cursor hairline.
 */
export function TimeAxis() {
  const time = useSimulationStore((s) => s.time);
  const duration = useSimulationStore((s) => s.trajectory?.duration ?? null);
  const dt = useSimulationStore((s) => s.trajectory?.dt ?? null);
  const { setTime, setHoverTime } = useSimulationStore.getState();

  const ticks = useMemo(() => {
    if (duration === null) return [];
    const out: number[] = [];
    for (let t = 0; t <= duration + 1e-6; t += 10) out.push(t);
    return out;
  }, [duration]);

  if (duration === null || dt === null) return null;

  return (
    <div className="axis">
      <div className="axis-track-wrap" style={{ flexBasis: `${TRACE_LEFT_FRACTION * 100}%` }} />
      <div className="axis-track">
        <div className="axis-hairline" aria-hidden="true" />
        <div className="axis-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="axis-tick" style={{ left: `${(t / duration) * 100}%` }} />
          ))}
        </div>
        <div className="axis-tick-labels t-num" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="axis-tick-label" style={{ left: `${(t / duration) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <input
          type="range"
          className="axis-range"
          min={0}
          max={duration}
          step={dt * 5}
          value={time}
          data-testid="timeline"
          aria-label="Simulation time"
          onChange={(e) => setTime(Number(e.target.value))}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const u = (e.clientX - rect.left) / rect.width;
            setHoverTime(Math.min(duration, Math.max(0, u * duration)));
          }}
          onPointerLeave={() => setHoverTime(null)}
        />
      </div>
      <span
        className="axis-readout t-num"
        data-testid="time-readout"
        style={{ flexBasis: `${TRACE_RIGHT_FRACTION * 100}%` }}
      >
        {formatTime(time)}
        <span className="axis-readout-total"> / {formatTime(duration)}</span>
      </span>
    </div>
  );
}
