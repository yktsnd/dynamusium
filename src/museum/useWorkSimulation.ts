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

/**
 * Parameter sliders emit an input event for every pointer movement.  Waiting
 * for a short quiet period keeps those events responsive while still running
 * the complete, deterministic scientific execution for the final value.
 */
export const WORK_SIMULATION_DEBOUNCE_MS = 160;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown simulation failure';
}

function requestKeyFor(workKey: string, values: Record<string, number>): string {
  const valueKey = Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return `${workKey}\n${valueKey}`;
}

export function useWorkSimulation(
  work: WorkManifest,
  values: Record<string, number>,
  suspended = false,
): WorkSimulationSnapshot {
  const workKey = useMemo(() => JSON.stringify(work), [work]);
  const requestKey = useMemo(() => requestKeyFor(workKey, values), [values, workKey]);
  const [state, setState] = useState<InternalSimulationState>(() => ({
    requestKey,
    status: 'idle',
    result: null,
    run: null,
    error: null,
  }));
  const requestId = useRef(0);
  const settledRequestKey = useRef<string | null>(null);

  useEffect(() => {
    if (suspended || settledRequestKey.current === requestKey) return;

    const id = requestId.current + 1;
    requestId.current = id;
    let active = true;

    const commit = (next: WorkSimulationSnapshot) => {
      if (!active || id !== requestId.current) return;
      setState({ requestKey, ...next });
    };
    const settle = (next: WorkSimulationSnapshot) => {
      if (!active || id !== requestId.current) return;
      settledRequestKey.current = requestKey;
      setState({ requestKey, ...next });
    };
    const fail = (error: unknown) => {
      settle({ status: 'invalid', result: null, run: null, error: errorMessage(error) });
    };

    commit({ status: 'loading', result: null, run: null, error: null });

    let worker: Worker | null = null;
    const start = () => {
      if (!active || id !== requestId.current) return;
      if (typeof Worker === 'undefined') {
        try {
          const execution = executeWork(work, values, String(id));
          settle({
            status: execution.run.status === 'valid' ? 'valid' : 'invalid',
            result: execution.display,
            run: execution.run,
            error: execution.run.status === 'invalid' ? execution.run.failure.message : null,
          });
        } catch (error) {
          fail(error);
        }
        return;
      }

      try {
        worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
          type: 'module',
        });
      } catch (error) {
        fail(error);
        return;
      }

      worker.onmessage = (event: MessageEvent<SimulationResponse>) => {
        if (!active || event.data.id !== requestId.current) return;
        const { execution } = event.data;
        settle({
          status: execution.run.status === 'valid' ? 'valid' : 'invalid',
          result: execution.display,
          run: execution.run,
          error: execution.run.status === 'invalid' ? execution.run.failure.message : null,
        });
        worker?.terminate();
        worker = null;
      };
      worker.onerror = () => {
        fail(new Error('The simulation worker stopped unexpectedly.'));
        worker?.terminate();
        worker = null;
      };
      worker.postMessage({ id, work, values: { ...values } });
    };
    const timer = setTimeout(start, WORK_SIMULATION_DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
      worker?.terminate();
      worker = null;
    };
  }, [requestKey, suspended, values, work]);

  if (state.requestKey !== requestKey) {
    return { status: 'loading', result: null, run: null, error: null };
  }
  return { status: state.status, result: state.result, run: state.run, error: state.error };
}
