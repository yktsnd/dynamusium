import { presets } from '../../features/presets/presets.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './controls.css';

/** Preset scenarios as plain ghost text buttons in the top rail. */
export function PresetSwitcher() {
  const presetId = useSimulationStore((s) => s.presetId);
  const selectPreset = useSimulationStore((s) => s.selectPreset);

  return (
    <div className="ghost-group" role="group" aria-label="Preset scenarios">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`ghost-tab${p.id === presetId ? ' is-active' : ''}`}
          aria-pressed={p.id === presetId}
          data-testid={`preset-${p.id}`}
          onClick={() => selectPreset(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
