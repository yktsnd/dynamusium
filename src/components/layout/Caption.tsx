import { presets } from '../../features/presets/presets.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './layout.css';

/**
 * Museum-caption block: the model name (kicker) and the active preset's
 * one-line tagline. This is the first-impression text — it replaces the old
 * in-card stage title. In exhibition mode, `prominent` renders it as a
 * centered interstitial between auto-advanced presets.
 */
export function Caption({ prominent = false }: { prominent?: boolean }) {
  const model = useSimulationStore((s) => s.model);
  const presetId = useSimulationStore((s) => s.presetId);
  const active = presets.find((p) => p.id === presetId);

  return (
    <div className={`caption${prominent ? ' is-prominent' : ''}`}>
      <p className="caption-kicker t-label">{model.name}</p>
      {active && <p className="caption-tagline">{active.tagline}</p>}
    </div>
  );
}
