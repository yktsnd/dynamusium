import type { ModelDefinition, ParameterValues } from './schema.ts';

/** Structural validation of a model definition. Returns human-readable errors. */
export function validateModel(model: ModelDefinition): string[] {
  const errors: string[] = [];
  const speciesIds = new Set(model.species.map((s) => s.id));
  const paramIds = new Set(model.parameters.map((p) => p.id));

  if (model.species.length === 0) errors.push('Model has no species.');
  if (speciesIds.size !== model.species.length) errors.push('Duplicate species ids.');
  if (new Set(model.processes.map((p) => p.id)).size !== model.processes.length)
    errors.push('Duplicate process ids.');

  for (const s of model.species) {
    if (s.initial < 0) errors.push(`Species "${s.id}" has a negative initial quantity.`);
    if (s.displayCapacity <= 0) errors.push(`Species "${s.id}" needs a positive displayCapacity.`);
  }

  const requireSpecies = (id: string, where: string) => {
    if (!speciesIds.has(id)) errors.push(`${where} references unknown species "${id}".`);
  };
  const requireParam = (id: string, where: string) => {
    if (!paramIds.has(id)) errors.push(`${where} references unknown parameter "${id}".`);
  };

  for (const proc of model.processes) {
    const where = `Process "${proc.id}"`;
    if (proc.kind === 'inflow') {
      requireSpecies(proc.to, where);
    } else if (proc.kind === 'conversion') {
      requireSpecies(proc.from, where);
      requireSpecies(proc.to, where);
      requireParam(proc.forwardParam, where);
      if (proc.reverseParam) requireParam(proc.reverseParam, where);
      if (proc.from === proc.to) errors.push(`${where} converts a species to itself.`);
    } else {
      requireSpecies(proc.from, where);
      requireParam(proc.rateParam, where);
    }
  }

  for (const p of model.parameters) {
    if (p.min > p.max) errors.push(`Parameter "${p.id}" has min > max.`);
    if (p.default < p.min || p.default > p.max)
      errors.push(`Parameter "${p.id}" default is outside [min, max].`);
  }

  if (model.config.dt <= 0) errors.push('config.dt must be positive.');
  if (model.config.duration <= 0) errors.push('config.duration must be positive.');
  if (model.config.duration / model.config.dt > 500_000)
    errors.push('config.duration / config.dt exceeds the frame budget (500k).');

  return errors;
}

/** Default parameter values of a model. */
export function defaultParameterValues(model: ModelDefinition): ParameterValues {
  return Object.fromEntries(model.parameters.map((p) => [p.id, p.default] as const));
}

/** Clamp a proposed parameter value to its declared range. */
export function clampParameterValue(model: ModelDefinition, id: string, value: number): number {
  const def = model.parameters.find((p) => p.id === id);
  if (!def || Number.isNaN(value)) return def?.default ?? 0;
  return Math.min(def.max, Math.max(def.min, value));
}
