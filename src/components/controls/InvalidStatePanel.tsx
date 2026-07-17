import { formatTime } from '../../lib/formatting/format.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './invalid-state.css';

/**
 * Shown in place of the network view when the solver reports an invalid
 * result. role="alert" announces the failure to screen readers; the only
 * escape hatches are fixing the inputs or resetting the preset.
 */
export function InvalidStatePanel() {
  const error = useSimulationStore((s) => s.error);
  const diagnostics = useSimulationStore((s) => s.diagnostics);
  const resetToPresetDefaults = useSimulationStore((s) => s.resetToPresetDefaults);

  if (!error) return null;

  return (
    <div className="invalid-panel" role="alert" data-testid="invalid-panel">
      <p className="t-label invalid-panel-kicker">Simulation invalid</p>
      <h2 className="invalid-panel-title t-display">
        The current inputs produced an unusable solution
      </h2>
      <p className="invalid-panel-message">{error.message}</p>
      <dl className="invalid-panel-details t-num">
        <div>
          <dt>Failure</dt>
          <dd>{error.kind}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{error.stateId}</dd>
        </div>
        <div>
          <dt>Time / step</dt>
          <dd>
            {formatTime(error.time)} / {error.step}
          </dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{error.value.toExponential(3)}</dd>
        </div>
        <div>
          <dt>Tolerance</dt>
          <dd>{error.tolerance.toExponential(0)}</dd>
        </div>
        <div>
          <dt>Steps completed</dt>
          <dd>{diagnostics.stepsCompleted}</dd>
        </div>
      </dl>
      <p className="invalid-panel-hint">
        Playback is stopped and charts are hidden — the failed run is never displayed as if it were
        a solution. Adjust the parameters below, or restore the preset.
      </p>
      <button
        type="button"
        className="btn"
        data-testid="invalid-reset"
        onClick={resetToPresetDefaults}
      >
        Reset preset defaults
      </button>
    </div>
  );
}
