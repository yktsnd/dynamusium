import { useSimulationStore, type RateView } from '../../state/simulation-store.ts';
import './controls.css';

const OPTIONS: { value: RateView; label: string; title: string }[] = [
  {
    value: 'directional',
    label: 'Directional',
    title: 'Show forward and reverse flows separately',
  },
  { value: 'net', label: 'Net', title: 'Show only the net flow of reversible processes' },
];

/** Switches reversible channels between two-lane directional view and net view. */
export function RateViewToggle() {
  const rateView = useSimulationStore((s) => s.rateView);
  const setRateView = useSimulationStore((s) => s.setRateView);

  return (
    <div className="ghost-group" role="group" aria-label="Reversible flow display">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ghost-tab${rateView === o.value ? ' is-active' : ''}`}
          aria-pressed={rateView === o.value}
          title={o.title}
          data-testid={`rate-view-${o.value}`}
          onClick={() => setRateView(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
