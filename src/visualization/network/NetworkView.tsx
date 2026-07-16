import { useMemo } from 'react';
import { useReducedMotion } from '../../lib/accessibility/useReducedMotion.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import { selectCurrentFrame } from '../../state/selectors.ts';
import { seriesMax } from '../../solver/trajectory.ts';
import { Channel } from '../channels/Channel.tsx';
import { NodeVessel } from '../nodes/NodeVessel.tsx';
import { ParticleLayer } from '../particles/ParticleLayer.tsx';
import { ReservoirBasin } from '../reservoir/ReservoirBasin.tsx';
import { FeedInlet } from './FeedInlet.tsx';
import { computeGeometry, VIEW_H, VIEW_W } from './geometry.ts';
import './network.css';

/**
 * The animated system view. Renders entirely from the model definition and
 * the current trajectory frame — no model-specific conditionals.
 *
 * Channel color convention: a lane is colored by its destination node, so a
 * channel's stroke, its particles, and its rate-chart line always match.
 */
export function NetworkView() {
  const model = useSimulationStore((s) => s.model);
  const trajectory = useSimulationStore((s) => s.trajectory);
  const profile = useSimulationStore((s) => s.profile);
  const rateView = useSimulationStore((s) => s.rateView);
  const selection = useSimulationStore((s) => s.selection);
  const select = useSimulationStore((s) => s.select);
  const time = useSimulationStore((s) => s.time);
  const reducedMotion = useReducedMotion();

  const frame = selectCurrentFrame(useSimulationStore((s) => s));
  const geometry = useMemo(() => computeGeometry(model), [model]);

  /** Rate mapped to full channel width: max gross rate in this trajectory. */
  const rateScale = useMemo(() => {
    if (!trajectory) return 0.25;
    const all = trajectory.rates.flatMap((r) => [r.forward, r.reverse]);
    return Math.max(0.25, seriesMax(all));
  }, [trajectory]);

  const speciesColor = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of model.species) map[s.id] = `var(${s.colorVar})`;
    return map;
  }, [model]);

  const channelColors = useMemo(() => {
    const map: Record<string, { forward: string; reverse: string }> = {};
    for (const p of model.processes) {
      if (p.kind === 'inflow') {
        map[p.id] = { forward: speciesColor[p.to], reverse: speciesColor[p.to] };
      } else if (p.kind === 'conversion') {
        map[p.id] = { forward: speciesColor[p.to], reverse: speciesColor[p.from] };
      } else {
        map[p.id] = { forward: `var(${model.reservoir.colorVar})`, reverse: speciesColor[p.from] };
      }
    }
    return map;
  }, [model, speciesColor]);

  const inflowIndex = model.processes.findIndex((p) => p.kind === 'inflow');

  // Rendered only while the store holds a valid result (see App.tsx); this
  // guard keeps the invariant local and satisfies the nullable contract.
  if (!trajectory || !frame) return null;

  return (
    <svg
      className="network"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="group"
      aria-label={`Network view of ${model.name}`}
    >
      {model.species.map((s, i) => (
        <NodeVessel
          key={s.id}
          species={s}
          geom={geometry.vessels.get(s.id)!}
          quantity={frame.quantities[i]}
          unit={model.quantityUnit}
          selected={selection === s.id}
          onSelect={() => select(selection === s.id ? null : s.id)}
        />
      ))}
      <ReservoirBasin
        reservoir={model.reservoir}
        geom={geometry.basin}
        amount={frame.reservoir}
        unit={model.quantityUnit}
      />
      {geometry.channels.map((ch, i) => (
        <Channel
          key={ch.process.id}
          geom={ch}
          rates={frame.rates[i]}
          rateScale={rateScale}
          rateView={rateView}
          forwardColor={channelColors[ch.process.id].forward}
          reverseColor={channelColors[ch.process.id].reverse}
          unit={model.quantityUnit}
          selected={selection === ch.process.id}
          onSelect={() => select(selection === ch.process.id ? null : ch.process.id)}
          // The feed inlet renders its own always-on rate label.
          showRateLabel={
            ch.process.kind !== 'inflow' && (reducedMotion || selection === ch.process.id)
          }
        />
      ))}
      {geometry.feed && inflowIndex >= 0 && (
        <FeedInlet
          geom={geometry.feed}
          profile={profile}
          duration={trajectory.duration}
          time={time}
          currentRate={frame.rates[inflowIndex].forward}
          unit={model.quantityUnit}
        />
      )}
      {!reducedMotion && <ParticleLayer channels={geometry.channels} colors={channelColors} />}
    </svg>
  );
}
