/**
 * The typed contract between model definitions, the numerical solver, and the
 * visual layers. Everything the UI renders derives from these types — no
 * component may special-case a particular demonstration model.
 *
 * Conventions:
 * - Quantities are amounts (unit given per model, e.g. "mol"); never negative.
 * - Time is in the model's `timeUnit` (e.g. "s").
 * - Rates are amount / time. `forward` and `reverse` are both >= 0;
 *   `net = forward - reverse` and is signed (positive = from -> to).
 * - Layout coordinates are abstract units in a 100 x 100 design space,
 *   scaled by the network renderer.
 */

export type SpeciesId = string;
export type ProcessId = string;
export type ParameterId = string;

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface SpeciesDef {
  id: SpeciesId;
  label: string;
  /** Short symbol shown inside the node vessel, e.g. "A". */
  symbol: string;
  description: string;
  /** Initial quantity at t = 0. */
  initial: number;
  /** Display maximum used to scale the vessel fill (not a hard physical cap). */
  displayCapacity: number;
  /** CSS custom property carrying this species' color, e.g. "--species-a". */
  colorVar: string;
  layout: LayoutPoint;
}

export interface ParameterDef {
  id: ParameterId;
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

/** Time-dependent inflow driving the system from outside. */
export type InputProfile =
  | { kind: 'none' }
  | { kind: 'constant'; rate: number }
  | { kind: 'pulse'; amplitude: number; center: number; width: number }
  | { kind: 'sine'; base: number; amplitude: number; period: number };

export type InputProfileKind = InputProfile['kind'];

/**
 * Processes are first-order (mass-action) by construction in this version.
 * - inflow:     rate(t) = profile(t)                    (external -> `to`)
 * - conversion: forward = k_f * q_from, reverse = k_r * q_to
 * - outflow:    rate = k * q_from                       (`from` -> reservoir)
 */
export type ProcessDef =
  | {
      kind: 'inflow';
      id: ProcessId;
      label: string;
      to: SpeciesId;
    }
  | {
      kind: 'conversion';
      id: ProcessId;
      label: string;
      from: SpeciesId;
      to: SpeciesId;
      /** Parameter id of the forward rate constant. */
      forwardParam: ParameterId;
      /** Parameter id of the reverse rate constant; omit for irreversible. */
      reverseParam?: ParameterId;
    }
  | {
      kind: 'outflow';
      id: ProcessId;
      label: string;
      from: SpeciesId;
      /** Parameter id of the outflow rate constant. */
      rateParam: ParameterId;
    };

export interface ReservoirDef {
  label: string;
  description: string;
  colorVar: string;
  /** Display maximum used to scale the basin fill. */
  displayCapacity: number;
  layout: LayoutPoint;
}

export interface SimulationConfig {
  /** Total simulated time span, in `timeUnit`. */
  duration: number;
  /** Fixed internal RK4 step, in `timeUnit`. Every step is stored as a frame. */
  dt: number;
}

export interface ModelDefinition {
  id: string;
  name: string;
  description: string;
  /** e.g. "s" */
  timeUnit: string;
  /** e.g. "mol" */
  quantityUnit: string;
  species: SpeciesDef[];
  processes: ProcessDef[];
  parameters: ParameterDef[];
  reservoir: ReservoirDef;
  config: SimulationConfig;
}

/** Current numeric values for every parameter of a model. */
export type ParameterValues = Record<ParameterId, number>;

/** One process' rate decomposition at a moment in time. */
export interface ProcessRates {
  forward: number;
  reverse: number;
  net: number;
}

/** Interpolated state of the whole system at one time point. */
export interface Frame {
  time: number;
  /** Quantity per species, in model order. */
  quantities: number[];
  /** Accumulated reservoir output (nondecreasing). */
  reservoir: number;
  /** Rates per process, in model order. */
  rates: ProcessRates[];
}
