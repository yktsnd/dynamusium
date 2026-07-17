import { presets } from '../../features/presets/presets.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './controls.css';

/** Preset scenarios as a segmented control; the tagline explains the pick. */
export function PresetSwitcher() {
  const presetId = useSimulationStore((s) => s.presetId);
  const selectPreset = useSimulationStore((s) => s.selectPreset);
  const active = presets.find((p) => p.id === presetId);

  return (
    <div className="presets">
      <div className="seg-group" role="group" aria-label="Preset scenarios">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn btn-seg${p.id === presetId ? ' is-active' : ''}`}
            aria-pressed={p.id === presetId}
            data-testid={`preset-${p.id}`}
            onClick={() => selectPreset(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
      {active && <p className="presets-tagline">{active.tagline}</p>}
    </div>
  );
}
