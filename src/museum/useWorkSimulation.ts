import { useEffect, useMemo, useRef, useState } from 'react';
import { executeWork, type WorkExecution } from './execute-work.ts';
import type { WorkRunResult } from './portrait-types.ts';
import type { WorkManifest, WorkResult } from './types.ts';

interface SimulationResponse {
  id: number;
  execution: WorkExecution;
}

export type WorkSimulationStatus = 'idle' | 'loading' | 'valid' | 'invalid';

export interface WorkSimulationSnapshot {
  status: WorkSimulationStatus;
  result: WorkResult | null;
  run: WorkRunResult | null;
  error: string | null;
}

interface InternalSimulationState extends WorkSimulationSnapshot {
  requestKey: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown simulation failure';
}

function requestKeyFor(work: WorkManifest, values: Record<string, number>): string {
  const valueKey = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return `${JSON.stringify(work)}\n${valueKey}`;
}

export function useWorkSimulation(
  work: WorkManifest,
  values: Record<string, number>,
): WorkSimulationSnapshot {
  const requestKey = useMemo(() => requestKeyFor(work, values), [values, work]);
  const [state, setState] = useState<InternalSimulationState>(() => ({
    requestKey,
    status: 'idle',
    result: null,
    run: null,
    error: null,
  }));
  const requestId = useRef(0);

  useEffect(() => {
    const id = requestId.current + 1;
    requestId.current = id;
    let active = true;

    const commit = (next: WorkSimulationSnapshot) => {
      if (!active || id !== requestId.current) return;
      setState({ requestKey, ...next });
    };
    const fail = (error: unknown) => {
      commit({ status: 'invalid', result: null, run: null, error: errorMessage(error) });
    };

    commit({ status: 'loading', result: null, run: null, error: null });

    if (typeof Worker === 'undefined') {
      try {
        const execution = executeWork(work, values, String(id));
        commit({
          status: execution.run.status === 'valid' ? 'valid' : 'invalid',
          result: execution.display,
          run: execution.run,
          error: execution.run.status === 'invalid' ? execution.run.failure.message : null,
        });
      } catch (error) {
        fail(error);
      }
      return () => {
        active = false;
      };
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (error) {
      fail(error);
      return () => {
        active = false;
      };
    }

    worker.onmessage = (event: MessageEvent<SimulationResponse>) => {
      if (!active || event.data.id !== requestId.current) return;
      const { execution } = event.data;
      commit({
        status: execution.run.status === 'valid' ? 'valid' : 'invalid',
        result: execution.display,
        run: execution.run,
        error: execution.run.status === 'invalid' ? execution.run.failure.message : null,
      });
      worker.terminate();
    };
    worker.onerror = () => {
      fail(new Error('The simulation worker stopped unexpectedly.'));
      worker.terminate();
    };
    worker.postMessage({ id, work, values: { ...values } });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [requestKey, values, work]);

  if (state.requestKey !== requestKey) {
    return { status: 'loading', result: null, run: null, error: null };
  }
  return { status: state.status, result: state.result, run: state.run, error: state.error };
}
