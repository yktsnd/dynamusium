import { QuantityChart } from '../charts/QuantityChart.tsx';
import { RateChart } from '../charts/RateChart.tsx';
import { Caption } from '../components/layout/Caption.tsx';
import { TimeAxis } from '../components/layout/TimeAxis.tsx';
import { TopRail } from '../components/layout/TopRail.tsx';
import { InvalidStatePanel } from '../components/controls/InvalidStatePanel.tsx';
import { LegendCard } from '../components/controls/LegendCard.tsx';
import { StatusAnnouncer } from '../components/controls/StatusAnnouncer.tsx';
import { TransportBar } from '../components/controls/TransportBar.tsx';
import '../features/exhibition/exhibition.css';
import { useExhibition } from '../features/exhibition/useExhibition.ts';
import { InspectorPanel } from '../features/inspector/InspectorPanel.tsx';
import { usePlaybackLoop } from '../features/playback/usePlaybackLoop.ts';
import { useSimulationStore } from '../state/simulation-store.ts';
import { NetworkView } from '../visualization/network/NetworkView.tsx';

function ChartUnavailable({ title }: { title: string }) {
  return (
    <div className="trace-unavailable" data-testid={`unavailable-${title.toLowerCase()}`}>
      {title} are hidden while the simulation is invalid.
    </div>
  );
}

export function App() {
  usePlaybackLoop();
  const valid = useSimulationStore((s) => s.status === 'valid');
  const { exhibitMode, toggle: toggleExhibit, uiRecessed, phase } = useExhibition();

  const fieldHidden = phase === 'fading-out' || phase === 'caption';
  const rootClass = [
    'app-root',
    exhibitMode && 'is-exhibit',
    exhibitMode && uiRecessed && 'is-recessed',
    exhibitMode && fieldHidden && 'is-field-hidden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      <TopRail exhibitMode={exhibitMode} onToggleExhibit={toggleExhibit} />
      <Caption prominent={exhibitMode && phase === 'caption'} />
      <main className="field" aria-label="Simulation">
        <section className="system-stage">
          {valid ? <NetworkView /> : <InvalidStatePanel />}
        </section>
        <div className="instrument-block">
          {valid ? (
            <>
              <QuantityChart />
              <div className="strip-sep" aria-hidden="true" />
              <RateChart />
              <TimeAxis />
              <TransportBar />
            </>
          ) : (
            <>
              <ChartUnavailable title="Quantities" />
              <ChartUnavailable title="Rates" />
            </>
          )}
        </div>
      </main>
      <InspectorPanel />
      <LegendCard />
      <StatusAnnouncer />
    </div>
  );
}
