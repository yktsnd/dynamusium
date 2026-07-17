import { useSimulationStore } from '../../state/simulation-store.ts';
import './invalid-state.css';

/**
 * Shown in place of the network view when the solver reports an invalid
 * result. role="alert" announces the failure to screen readers; the only
 * escape hatches are fixing the inputs or resetting the preset.
 */
export function InvalidStatePanel() {
  const error = useSimulationStore((s) => s.error);
  const resetToPresetDefaults = useSimulationStore((s) => s.resetToPresetDefaults);

  if (!error) return null;

  const detailLine = [
    error.kind,
    `state ${error.stateId}`,
    `t ${error.time.toFixed(2)} s`,
    `step ${error.step}`,
    `value ${error.value.toExponential(3)}`,
    `tol ${error.tolerance.toExponential(0)}`,
  ].join(' · ');

  return (
    <div className="invalid-panel" role="alert" data-testid="invalid-panel">
      <p className="t-label invalid-panel-kicker">Simulation invalid</p>
      <h2 className="invalid-panel-title t-display">
        The current inputs produced an unusable solution
      </h2>
      <p className="invalid-panel-message">{error.message}</p>
      <p className="invalid-panel-details t-num">{detailLine}</p>
      <p className="invalid-panel-hint">
        Playback is stopped and charts are hidden — the failed run is never displayed as if it were
        a solution. Adjust the parameters below, or restore the preset.
      </p>
      <button
        type="button"
        className="invalid-reset-btn"
        data-testid="invalid-reset"
        onClick={resetToPresetDefaults}
      >
        Reset preset defaults
      </button>
    </div>
  );
}
