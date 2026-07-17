import { PauseIcon, PlayIcon, RestartIcon } from '../../design-system/icons/index.tsx';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './controls.css';

const SPEEDS = [0.5, 1, 2, 4];

/**
 * Bottom-left transport cluster: restart, play/pause, speed, and the
 * Parameters drawer trigger. The scrubber itself lives in TimeAxis, sharing
 * the same x-scale as the trace strips.
 */
export function TransportBar() {
  const playing = useSimulationStore((s) => s.playing);
  const speed = useSimulationStore((s) => s.speed);
  const inspectorOpen = useSimulationStore((s) => s.inspectorOpen);
  const duration = useSimulationStore((s) => s.trajectory?.duration ?? null);
  const { togglePlay, restart, setSpeed, setInspectorOpen } = useSimulationStore.getState();

  // Rendered only for a valid simulation (see App.tsx).
  if (duration === null) return null;

  return (
    <div className="transport" data-testid="transport">
      <button
        type="button"
        className="ghost-icon"
        onClick={restart}
        aria-label="Restart from the beginning"
        title="Restart"
      >
        <RestartIcon />
      </button>
      <button
        type="button"
        className="ghost-icon"
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        data-testid="play-toggle"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="ghost-group speed-group" role="group" aria-label="Playback speed">
        {SPEEDS.map((v) => (
          <button
            key={v}
            type="button"
            className={`ghost-tab ghost-tab-sm${speed === v ? ' is-active' : ''}`}
            aria-pressed={speed === v}
            onClick={() => setSpeed(v)}
          >
            {v}×
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`ghost-tab${inspectorOpen ? ' is-active' : ''}`}
        aria-pressed={inspectorOpen}
        aria-haspopup="dialog"
        data-testid="inspector-toggle"
        onClick={() => setInspectorOpen(!inspectorOpen)}
      >
        Parameters
      </button>
    </div>
  );
}
