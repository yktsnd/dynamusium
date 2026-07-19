import { executeWork, type WorkExecution } from './execute-work.ts';
import type { WorkManifest } from './types.ts';

interface SimulationRequest {
  id: number;
  work: WorkManifest;
  values: Record<string, number>;
}

interface SimulationResponse {
  id: number;
  execution: WorkExecution;
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, work, values } = event.data;
  const response: SimulationResponse = {
    id,
    execution: executeWork(work, values, String(id)),
  };
  self.postMessage(response);
};
