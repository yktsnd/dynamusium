import { useEffect, useState } from 'react';
import {
  MAX_PARTICLES_PER_LANE,
  PARTICLE_QUANTUM,
  PARTICLE_TRAVEL_SECONDS,
  SCRUB_RESET_THRESHOLD,
} from '../../design-system/motion.ts';
import { frameAt } from '../../solver/trajectory.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import { createLane, resetLane, stepLane, type LaneState } from './particle-engine.ts';
import type { ChannelGeom, LaneGeom } from '../network/geometry.ts';

interface Props {
  channels: ChannelGeom[];
  /** processId -> { forward, reverse } lane colors. */
  colors: Record<string, { forward: string; reverse: string }>;
}

interface Dot {
  id: string;
  cx: number;
  cy: number;
  fill: string;
}

function reversed(l: LaneGeom): LaneGeom {
  return { dir: 'reverse', x1: l.x2, y1: l.y2, x2: l.x1, y2: l.y1 };
}

/**
 * Animated particle layer. Emission is driven by integrated simulated rates
 * (see particle-engine.ts); travel is wall-clock and carries no meaning.
 * Scrub jumps clear in-flight particles instead of emitting bursts.
 *
 * Lane state lives outside React; each animation frame computes a plain list
 * of dots and commits it as render state.
 */
export function ParticleLayer({ channels, colors }: Props) {
  const [dots, setDots] = useState<Dot[]>([]);

  useEffect(() => {
    const lanes = new Map<string, LaneState>();
    let lastSimTime: number | null = null;
    let lastTraj: unknown = null;
    let lastView = '';
    let lastWall = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dtWall = Math.min(0.1, (now - lastWall) / 1000);
      lastWall = now;
      const s = useSimulationStore.getState();
      const frame = frameAt(s.trajectory, s.time);

      const scenarioChanged = lastTraj !== s.trajectory || lastView !== s.rateView;
      const simDelta = lastSimTime === null ? 0 : s.time - lastSimTime;
      const scrubbed = simDelta < 0 || simDelta > SCRUB_RESET_THRESHOLD;
      if (scenarioChanged || scrubbed) for (const lane of lanes.values()) resetLane(lane);
      lastTraj = s.trajectory;
      lastView = s.rateView;
      lastSimTime = s.time;
      const dtSim = scenarioChanged || scrubbed ? 0 : Math.max(0, simDelta);

      const nextDots: Dot[] = [];
      channels.forEach((ch, ci) => {
        const rates = frame.rates[ci];
        const color = colors[ch.process.id];
        const active: { key: string; rate: number; lane: LaneGeom; fill: string }[] =
          s.rateView === 'directional'
            ? ch.lanes.map((l) => ({
                key: `${ch.process.id}:${l.dir}`,
                rate: l.dir === 'forward' ? rates.forward : rates.reverse,
                lane: l,
                fill: l.dir === 'forward' ? color.forward : color.reverse,
              }))
            : [
                !ch.reversible || rates.net >= 0
                  ? {
                      key: `${ch.process.id}:net`,
                      rate: Math.abs(rates.net),
                      lane: ch.center,
                      fill: color.forward,
                    }
                  : {
                      key: `${ch.process.id}:net`,
                      rate: Math.abs(rates.net),
                      lane: reversed(ch.center),
                      fill: color.reverse,
                    },
              ];

        for (const def of active) {
          let lane = lanes.get(def.key);
          if (!lane) {
            lane = createLane();
            lanes.set(def.key, lane);
          }
          stepLane(lane, {
            rate: def.rate,
            dtSim,
            dtWall,
            quantum: PARTICLE_QUANTUM,
            travelSeconds: PARTICLE_TRAVEL_SECONDS,
            maxParticles: MAX_PARTICLES_PER_LANE,
          });
          for (const p of lane.particles) {
            nextDots.push({
              id: `${def.key}:${p.id}`,
              cx: def.lane.x1 + (def.lane.x2 - def.lane.x1) * p.progress,
              cy: def.lane.y1 + (def.lane.y2 - def.lane.y1) * p.progress,
              fill: def.fill,
            });
          }
        }
      });

      setDots(nextDots);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [channels, colors]);

  return (
    <g className="particles" aria-hidden="true">
      {dots.map((d) => (
        <circle key={d.id} className="particle" cx={d.cx} cy={d.cy} r={3.4} fill={d.fill} />
      ))}
    </g>
  );
}
