import { useMemo } from 'react';
import { useSimulationStore } from '../state/simulation-store.ts';
import { TimeSeriesChart, type ChartSeries } from './TimeSeriesChart.tsx';

/**
 * Process rates over the whole run. Line color matches the destination-node
 * color used by the corresponding channel. In directional view, reversible
 * processes contribute a solid forward line and a dashed reverse line; in
 * net view every process contributes one signed net line.
 */
export function RateChart() {
  const model = useSimulationStore((s) => s.model);
  const trajectory = useSimulationStore((s) => s.trajectory);
  const rateView = useSimulationStore((s) => s.rateView);
  const selection = useSimulationStore((s) => s.selection);

  const series = useMemo<ChartSeries[]>(() => {
    if (!trajectory) return [];
    const colorOf = (speciesId: string) =>
      `var(${model.species.find((sp) => sp.id === speciesId)?.colorVar ?? '--text-2'})`;
    const out: ChartSeries[] = [];
    model.processes.forEach((p, i) => {
      const r = trajectory.rates[i];
      if (p.kind === 'inflow') {
        out.push({ id: p.id, label: p.label, color: colorOf(p.to), values: r.net });
      } else if (p.kind === 'conversion') {
        if (rateView === 'directional' && p.reverseParam) {
          out.push({
            id: p.id,
            label: `${p.from.toUpperCase()}→${p.to.toUpperCase()}`,
            color: colorOf(p.to),
            values: r.forward,
          });
          out.push({
            id: `${p.id}:rev`,
            label: `${p.to.toUpperCase()}→${p.from.toUpperCase()}`,
            color: colorOf(p.from),
            dashed: true,
            values: r.reverse,
          });
        } else {
          out.push({ id: p.id, label: p.label, color: colorOf(p.to), values: r.net });
        }
      } else {
        out.push({
          id: p.id,
          label: p.label,
          color: `var(${model.reservoir.colorVar})`,
          values: r.net,
        });
      }
    });
    return out;
  }, [model, trajectory, rateView]);

  if (!trajectory) return null;

  return (
    <TimeSeriesChart
      title="Rates"
      unit={`${model.quantityUnit}/${model.timeUnit}`}
      series={series}
      duration={trajectory.duration}
      emphasis={model.processes.some((p) => p.id === selection) ? selection : null}
    />
  );
}
