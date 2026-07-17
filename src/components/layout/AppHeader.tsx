import { BrandMark, MotionIcon, QuestionIcon } from '../../design-system/icons/index.tsx';
import { useReducedMotion } from '../../lib/accessibility/useReducedMotion.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import { PresetSwitcher } from '../controls/PresetSwitcher.tsx';
import './layout.css';

export function AppHeader() {
  const legendOpen = useSimulationStore((s) => s.legendOpen);
  const setLegendOpen = useSimulationStore((s) => s.setLegendOpen);
  const setReducedMotionOverride = useSimulationStore((s) => s.setReducedMotionOverride);
  const reduced = useReducedMotion();

  return (
    <header className="header">
      <a
        className="brand"
        href="https://github.com/yktsnd/kinetiflux"
        aria-label="KinetiFlux on GitHub"
      >
        <BrandMark />
        <span className="brand-word t-display">
          Kineti<span className="brand-word-accent">Flux</span>
        </span>
      </a>
      <div className="header-presets">
        <PresetSwitcher />
      </div>
      <div className="header-actions">
        <button
          type="button"
          className={`btn btn-icon${reduced ? ' is-active' : ''}`}
          aria-pressed={reduced}
          aria-label={reduced ? 'Motion reduced — click to enable motion' : 'Reduce motion'}
          title={reduced ? 'Motion reduced' : 'Reduce motion'}
          onClick={() => setReducedMotionOverride(!reduced)}
        >
          <MotionIcon />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-pressed={legendOpen}
          aria-label="How to read this view"
          title="How to read"
          data-testid="legend-toggle"
          onClick={() => setLegendOpen(!legendOpen)}
        >
          <QuestionIcon />
        </button>
      </div>
    </header>
  );
}
