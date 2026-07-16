import type { ModelDefinition } from './schema.ts';

/**
 * The demonstration model: a continuously fed reaction chain.
 *
 *   feed ──▶ A ⇌ B ──▶ C ──▶ collected output
 *
 * An external feed supplies reagent A. A converts reversibly to intermediate
 * B, B converts irreversibly to product C, and C drains into the output
 * reservoir. All processes are first-order (mass-action).
 */
export const demonstrationModel: ModelDefinition = {
  id: 'feed-chain',
  name: 'Fed reaction chain',
  description:
    'A reversible two-step reaction chain driven by an external feed, draining into a collected-output reservoir.',
  timeUnit: 's',
  quantityUnit: 'mol',
  species: [
    {
      id: 'a',
      label: 'Reagent A',
      symbol: 'A',
      description: 'Supplied by the external feed.',
      initial: 1.2,
      displayCapacity: 6,
      colorVar: '--species-a',
      layout: { x: 26, y: 42 },
    },
    {
      id: 'b',
      label: 'Intermediate B',
      symbol: 'B',
      description: 'In reversible exchange with A.',
      initial: 0.4,
      displayCapacity: 6,
      colorVar: '--species-b',
      layout: { x: 50, y: 42 },
    },
    {
      id: 'c',
      label: 'Product C',
      symbol: 'C',
      description: 'Drains into the collected output.',
      initial: 0,
      displayCapacity: 6,
      colorVar: '--species-c',
      layout: { x: 74, y: 42 },
    },
  ],
  processes: [
    { kind: 'inflow', id: 'feed', label: 'Feed → A', to: 'a' },
    {
      kind: 'conversion',
      id: 'ab',
      label: 'A ⇌ B',
      from: 'a',
      to: 'b',
      forwardParam: 'kf',
      reverseParam: 'kr',
    },
    { kind: 'conversion', id: 'bc', label: 'B → C', from: 'b', to: 'c', forwardParam: 'k2' },
    { kind: 'outflow', id: 'drain', label: 'C → output', from: 'c', rateParam: 'kout' },
  ],
  parameters: [
    {
      id: 'kf',
      label: 'A → B rate constant',
      unit: '1/s',
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: 'kr',
      label: 'B → A rate constant',
      unit: '1/s',
      default: 0.2,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: 'k2',
      label: 'B → C rate constant',
      unit: '1/s',
      default: 0.28,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: 'kout',
      label: 'Output rate constant',
      unit: '1/s',
      default: 0.45,
      min: 0,
      max: 2,
      step: 0.01,
    },
  ],
  reservoir: {
    label: 'Collected output',
    description: 'Cumulative amount drained from C. Nondecreasing.',
    colorVar: '--reservoir',
    displayCapacity: 40,
    layout: { x: 92, y: 42 },
  },
  config: { duration: 60, dt: 0.02 },
};
