import { simulateWork } from './simulation.ts';
import type { WorkManifest, WorkResult } from './types.ts';

interface SimulationRequest {
  id: number;
  work: WorkManifest;
  values: Record<string, number>;
}

interface SimulationResponse {
  id: number;
  result?: WorkResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, work, values } = event.data;
  try {
    const response: SimulationResponse = { id, result: simulateWork(work, values) };
    self.postMessage(response);
  } catch (error) {
    const response: SimulationResponse = {
      id,
      error: error instanceof Error ? error.message : 'Unknown simulation failure',
    };
    self.postMessage(response);
  }
};
