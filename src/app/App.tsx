import { QuantityChart } from '../charts/QuantityChart.tsx';
import { RateChart } from '../charts/RateChart.tsx';
import { AppHeader } from '../components/layout/AppHeader.tsx';
import { InspectorPanel } from '../features/inspector/InspectorPanel.tsx';
import { InvalidStatePanel } from '../components/controls/InvalidStatePanel.tsx';
import { LegendCard } from '../components/controls/LegendCard.tsx';
import { RateViewToggle } from '../components/controls/RateViewToggle.tsx';
import { StatusAnnouncer } from '../components/controls/StatusAnnouncer.tsx';
import { TransportBar } from '../components/controls/TransportBar.tsx';
import { usePlaybackLoop } from '../features/playback/usePlaybackLoop.ts';
import { useSimulationStore } from '../state/simulation-store.ts';
import { NetworkView } from '../visualization/network/NetworkView.tsx';

function ModelTitle() {
  const model = useSimulationStore((s) => s.model);
  return (
    <h1 className="stage-title t-display" title={model.description}>
      {model.name}
    </h1>
  );
}

function ChartUnavailable({ title }: { title: string }) {
  return (
    <div className="chart chart-unavailable" data-testid={`unavailable-${title.toLowerCase()}`}>
      {title} are hidden while the simulation is invalid.
    </div>
  );
}

export function App() {
  usePlaybackLoop();
  const valid = useSimulationStore((s) => s.status === 'valid');

  return (
    <>
      <AppHeader />
      <main className="workspace">
        <section className="stage" aria-label="Simulation">
          <div className="stage-canvas">
            <div className="stage-head">
              <ModelTitle />
              <RateViewToggle />
            </div>
            {valid ? <NetworkView /> : <InvalidStatePanel />}
          </div>
          {valid && <TransportBar />}
          <InspectorPanel />
        </section>
        <aside className="side" aria-label="Charts and legend">
          <LegendCard />
          {valid ? (
            <>
              <QuantityChart />
              <RateChart />
            </>
          ) : (
            <>
              <ChartUnavailable title="Quantities" />
              <ChartUnavailable title="Rates" />
            </>
          )}
        </aside>
      </main>
      <StatusAnnouncer />
    </>
  );
}
