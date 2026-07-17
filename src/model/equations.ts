import { evaluateProfile } from './input-profiles.ts';
import type {
  InputProfile,
  ModelDefinition,
  ParameterValues,
  ProcessRates,
  SpeciesId,
} from './schema.ts';

/**
 * Compiled right-hand side of the model ODE system.
 *
 * State vector layout: [q_species0 ... q_speciesN-1, reservoir].
 * The reservoir is integrated as the last state variable so that cumulative
 * output comes from the same integration as the quantities.
 */
export interface CompiledSystem {
  /** Number of state variables (species count + 1 for the reservoir). */
  size: number;
  reservoirIndex: number;
  initialState: Float64Array;
  /** dy/dt written into `out`. */
  derivatives: (t: number, y: Float64Array, out: Float64Array) => void;
  /** Rate decomposition per process (model order) at a given state. */
  ratesAt: (t: number, y: Float64Array) => ProcessRates[];
}

export function compileSystem(
  model: ModelDefinition,
  params: ParameterValues,
  profile: InputProfile,
  initialOverrides: Partial<Record<SpeciesId, number>> = {},
): CompiledSystem {
  const speciesIndex = new Map<SpeciesId, number>();
  model.species.forEach((s, i) => speciesIndex.set(s.id, i));
  const n = model.species.length;
  const reservoirIndex = n;

  const p = (id: string): number => {
    const v = params[id];
    if (v === undefined) throw new Error(`Missing parameter value: ${id}`);
    return v;
  };

  // Pre-resolve indices and constants so the hot loop does no lookups.
  type Term = (t: number, y: Float64Array, out: Float64Array) => void;
  const terms: Term[] = [];
  const rateFns: ((t: number, y: Float64Array) => ProcessRates)[] = [];

  for (const proc of model.processes) {
    if (proc.kind === 'inflow') {
      const to = speciesIndex.get(proc.to)!;
      terms.push((t, _y, out) => {
        out[to] += evaluateProfile(profile, t);
      });
      rateFns.push((t) => {
        const r = evaluateProfile(profile, t);
        return { forward: r, reverse: 0, net: r };
      });
    } else if (proc.kind === 'conversion') {
      const from = speciesIndex.get(proc.from)!;
      const to = speciesIndex.get(proc.to)!;
      const kf = p(proc.forwardParam);
      const kr = proc.reverseParam ? p(proc.reverseParam) : 0;
      terms.push((_t, y, out) => {
        const net = kf * y[from] - kr * y[to];
        out[from] -= net;
        out[to] += net;
      });
      rateFns.push((_t, y) => {
        const forward = kf * y[from];
        const reverse = kr * y[to];
        return { forward, reverse, net: forward - reverse };
      });
    } else {
      const from = speciesIndex.get(proc.from)!;
      const k = p(proc.rateParam);
      terms.push((_t, y, out) => {
        const r = k * y[from];
        out[from] -= r;
        out[reservoirIndex] += r;
      });
      rateFns.push((_t, y) => {
        const r = k * y[from];
        return { forward: r, reverse: 0, net: r };
      });
    }
  }

  const initialState = new Float64Array(n + 1);
  model.species.forEach((s, i) => {
    initialState[i] = initialOverrides[s.id] ?? s.initial;
  });

  return {
    size: n + 1,
    reservoirIndex,
    initialState,
    derivatives: (t, y, out) => {
      out.fill(0);
      for (const term of terms) term(t, y, out);
    },
    ratesAt: (t, y) => rateFns.map((fn) => fn(t, y)),
  };
}
