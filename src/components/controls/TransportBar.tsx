import { PauseIcon, PlayIcon, RestartIcon } from '../../design-system/icons/index.tsx';
import { formatTime } from '../../lib/formatting/format.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './controls.css';

const SPEEDS = [0.5, 1, 2, 4];

/**
 * Playback transport: restart, play/pause, speed, and the timeline scrubber.
 * The scrubber is a real range input — fully keyboard operable — and only
 * selects a time inside the precomputed trajectory.
 */
export function TransportBar() {
  const time = useSimulationStore((s) => s.time);
  const playing = useSimulationStore((s) => s.playing);
  const speed = useSimulationStore((s) => s.speed);
  const duration = useSimulationStore((s) => s.trajectory?.duration ?? null);
  const dt = useSimulationStore((s) => s.trajectory?.dt ?? null);
  const { togglePlay, restart, setSpeed, setTime, setHoverTime } = useSimulationStore.getState();

  // Rendered only for a valid simulation (see App.tsx).
  if (duration === null || dt === null) return null;

  return (
    <div className="transport" data-testid="transport">
      <button
        type="button"
        className="btn btn-icon"
        onClick={restart}
        aria-label="Restart from the beginning"
        title="Restart"
      >
        <RestartIcon />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-primary"
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        data-testid="play-toggle"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <label className="timeline">
        <span className="visually-hidden">Simulation time</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={dt * 5}
          value={time}
          data-testid="timeline"
          onChange={(e) => setTime(Number(e.target.value))}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const u = (e.clientX - rect.left) / rect.width;
            setHoverTime(Math.min(duration, Math.max(0, u * duration)));
          }}
          onPointerLeave={() => setHoverTime(null)}
        />
      </label>

      <span className="transport-time t-num" data-testid="time-readout">
        {formatTime(time)}
        <span className="transport-time-total"> / {formatTime(duration)}</span>
      </span>

      <div className="speed-group" role="group" aria-label="Playback speed">
        {SPEEDS.map((v) => (
          <button
            key={v}
            type="button"
            className={`btn btn-seg${speed === v ? ' is-active' : ''}`}
            aria-pressed={speed === v}
            onClick={() => setSpeed(v)}
          >
            {v}×
          </button>
        ))}
      </div>
    </div>
  );
}
