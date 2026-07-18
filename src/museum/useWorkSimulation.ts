import { useEffect, useMemo, useRef, useState } from 'react';
import { simulateWork } from './simulation.ts';
import type { WorkManifest, WorkResult } from './types.ts';

interface SimulationResponse {
  id: number;
  result?: WorkResult;
  error?: string;
}

export function useWorkSimulation(work: WorkManifest, values: Record<string, number>) {
  const [result, setResult] = useState(() => simulateWork(work, values));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const serializedValues = useMemo(() => JSON.stringify(values), [values]);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const id = requestId.current + 1;
    requestId.current = id;
    const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<SimulationResponse>) => {
      if (event.data.id !== requestId.current) return;
      if (event.data.result) {
        setResult(event.data.result);
        setError(null);
      } else {
        setError(event.data.error ?? 'Simulation failed.');
      }
      worker.terminate();
    };
    worker.onerror = () => {
      if (id === requestId.current) setError('The simulation worker stopped unexpectedly.');
      worker.terminate();
    };
    worker.postMessage({ id, work, values: JSON.parse(serializedValues) });
    return () => worker.terminate();
  }, [serializedValues, work]);

  return { result, error };
}
