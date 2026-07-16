import { useMemo } from 'react';
import { useSimulationStore } from '../state/simulation-store.ts';
import { TimeSeriesChart, type ChartSeries } from './TimeSeriesChart.tsx';

/** Species quantities over the whole run, from the shared trajectory. */
export function QuantityChart() {
  const model = useSimulationStore((s) => s.model);
  const trajectory = useSimulationStore((s) => s.trajectory);
  const selection = useSimulationStore((s) => s.selection);

  const series = useMemo<ChartSeries[]>(
    () =>
      model.species.map((sp, i) => ({
        id: sp.id,
        label: sp.symbol,
        color: `var(${sp.colorVar})`,
        values: trajectory.quantities[i],
      })),
    [model, trajectory],
  );

  return (
    <TimeSeriesChart
      title="Quantities"
      unit={model.quantityUnit}
      series={series}
      duration={trajectory.duration}
      emphasis={model.species.some((sp) => sp.id === selection) ? selection : null}
    />
  );
}
