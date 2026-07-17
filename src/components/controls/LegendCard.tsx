import { CloseIcon } from '../../design-system/icons/index.tsx';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './legend.css';

/**
 * "How to read" card explaining the visual encoding used across the network
 * view and charts. Purely explanatory — dismissing it only hides the card.
 */
export function LegendCard() {
  const legendOpen = useSimulationStore((s) => s.legendOpen);
  const setLegendOpen = useSimulationStore((s) => s.setLegendOpen);

  if (!legendOpen) return null;

  return (
    <div className="legend-card" data-testid="legend-card">
      <div className="legend-header">
        <span className="t-label">How to read</span>
        <button
          type="button"
          className="btn btn-icon legend-close"
          aria-label="Dismiss legend"
          data-testid="legend-close"
          onClick={() => setLegendOpen(false)}
        >
          <CloseIcon />
        </button>
      </div>
      <ul className="legend-list">
        <li>
          <svg
            className="legend-glyph"
            width="26"
            height="16"
            viewBox="0 0 26 16"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="10"
              height="14"
              rx="2"
              fill="none"
              stroke="var(--text-2)"
              strokeWidth="1.2"
            />
            <rect x="2.5" y="7" width="7" height="6.5" rx="1" fill="var(--species-a)" />
          </svg>
          <span>vessel fill = current quantity</span>
        </li>
        <li>
          <svg
            className="legend-glyph"
            width="26"
            height="16"
            viewBox="0 0 26 16"
            aria-hidden="true"
          >
            <line
              x1="1"
              y1="5"
              x2="25"
              y2="5"
              stroke="var(--species-b)"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <line
              x1="1"
              y1="11"
              x2="25"
              y2="11"
              stroke="var(--species-b)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
          <span>channel width = transfer rate</span>
        </li>
        <li>
          <svg
            className="legend-glyph"
            width="26"
            height="16"
            viewBox="0 0 26 16"
            aria-hidden="true"
          >
            <circle cx="5" cy="8" r="2" fill="var(--species-b)" />
            <circle cx="13" cy="8" r="2" fill="var(--species-b)" />
            <circle cx="21" cy="8" r="2" fill="var(--species-b)" />
          </svg>
          <span>particle frequency = amount moved; each dot is one fixed quantum</span>
        </li>
        <li>
          <svg
            className="legend-glyph"
            width="26"
            height="16"
            viewBox="0 0 26 16"
            aria-hidden="true"
          >
            <path
              d="M9 3 16 8 9 13"
              fill="none"
              stroke="var(--text-2)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>direction = chevrons and particle travel</span>
        </li>
        <li>
          <svg
            className="legend-glyph"
            width="26"
            height="16"
            viewBox="0 0 26 16"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="24"
              height="14"
              rx="2"
              fill="none"
              stroke="var(--text-2)"
              strokeWidth="1.2"
            />
            <rect x="2.5" y="2.5" width="21" height="11" rx="1" fill="var(--reservoir-bright)" />
          </svg>
          <span>basin = cumulative collected output, only ever rises</span>
        </li>
        <li>
          <svg
            className="legend-glyph"
            width="26"
            height="16"
            viewBox="0 0 26 16"
            aria-hidden="true"
          >
            <path d="M2 13 Q9 3 24 10" fill="none" stroke="var(--text-2)" strokeWidth="1.2" />
            <line x1="16" y1="2" x2="16" y2="14" stroke="var(--cursor)" strokeWidth="1.5" />
          </svg>
          <span>charts show the same trajectory; the vertical line is the current time</span>
        </li>
      </ul>
    </div>
  );
}
