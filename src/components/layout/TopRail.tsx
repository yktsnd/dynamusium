import {
  BrandMark,
  ExhibitIcon,
  MotionIcon,
  QuestionIcon,
} from '../../design-system/icons/index.tsx';
import { useReducedMotion } from '../../lib/accessibility/useReducedMotion.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import { PresetSwitcher } from '../controls/PresetSwitcher.tsx';
import { RateViewToggle } from '../controls/RateViewToggle.tsx';
import './layout.css';

interface Props {
  exhibitMode: boolean;
  onToggleExhibit: () => void;
}

/**
 * Single-row top rail: brand mark, preset picker, rate-view toggle, and the
 * small set of global icon toggles. Chrome recedes — everything here reads
 * as plain text on the field, never as a card or toolbar.
 */
export function TopRail({ exhibitMode, onToggleExhibit }: Props) {
  const legendOpen = useSimulationStore((s) => s.legendOpen);
  const setLegendOpen = useSimulationStore((s) => s.setLegendOpen);
  const setReducedMotionOverride = useSimulationStore((s) => s.setReducedMotionOverride);
  const reduced = useReducedMotion();

  return (
    <header className="rail">
      <a
        className="rail-brand"
        href="https://github.com/yktsnd/dynamusium"
        aria-label="DynaMusium on GitHub"
      >
        <BrandMark size={18} />
        <span className="rail-word t-display">
          Kineti<span className="brand-word-accent">Flux</span>
        </span>
      </a>
      <div className="rail-right">
        <PresetSwitcher />
        <span className="rail-sep" aria-hidden="true" />
        <RateViewToggle />
        <span className="rail-sep" aria-hidden="true" />
        <button
          type="button"
          className={`ghost-icon${reduced ? ' is-active' : ''}`}
          aria-pressed={reduced}
          aria-label={reduced ? 'Motion reduced — click to enable motion' : 'Reduce motion'}
          title={reduced ? 'Motion reduced' : 'Reduce motion'}
          onClick={() => setReducedMotionOverride(!reduced)}
        >
          <MotionIcon />
        </button>
        <button
          type="button"
          className={`ghost-icon${legendOpen ? ' is-active' : ''}`}
          aria-pressed={legendOpen}
          aria-label="How to read this view"
          title="How to read"
          data-testid="legend-toggle"
          onClick={() => setLegendOpen(!legendOpen)}
        >
          <QuestionIcon />
        </button>
        <button
          type="button"
          className={`ghost-icon${exhibitMode ? ' is-active' : ''}`}
          aria-pressed={exhibitMode}
          aria-label="Exhibition mode"
          title="Exhibition mode (e)"
          data-testid="exhibit-toggle"
          onClick={onToggleExhibit}
        >
          <ExhibitIcon />
        </button>
      </div>
    </header>
  );
}
