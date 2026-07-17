import type { ModelDefinition } from '../src/model/schema.ts';

/**
 * A second model definition, proving the typed contract is model-agnostic:
 * a three-stage irreversible cascade with a reversible holding stage.
 *
 *   feed ──▶ X ──▶ Y ⇌ Z ──▶ collected output
 *
 * Nothing in src/ references this file; it is exercised by the solver test
 * suite and serves as a template for proposing new models
 * (see CONTRIBUTING.md).
 */
export const dampedCascade: ModelDefinition = {
  id: 'damped-cascade',
  name: 'Damped cascade',
  description: 'An irreversible stage feeding a reversible holding pair that slowly drains.',
  timeUnit: 's',
  quantityUnit: 'mol',
  species: [
    {
      id: 'x',
      label: 'Stage X',
      symbol: 'X',
      description: 'First stage, fed externally.',
      initial: 2,
      displayCapacity: 6,
      colorVar: '--species-a',
      layout: { x: 26, y: 42 },
    },
    {
      id: 'y',
      label: 'Stage Y',
      symbol: 'Y',
      description: 'Holding stage, in exchange with Z.',
      initial: 0,
      displayCapacity: 6,
      colorVar: '--species-b',
      layout: { x: 50, y: 42 },
    },
    {
      id: 'z',
      label: 'Stage Z',
      symbol: 'Z',
      description: 'Drains into the collected output.',
      initial: 0,
      displayCapacity: 6,
      colorVar: '--species-c',
      layout: { x: 74, y: 42 },
    },
  ],
  processes: [
    { kind: 'inflow', id: 'feed', label: 'Feed → X', to: 'x' },
    { kind: 'conversion', id: 'xy', label: 'X → Y', from: 'x', to: 'y', forwardParam: 'k1' },
    {
      kind: 'conversion',
      id: 'yz',
      label: 'Y ⇌ Z',
      from: 'y',
      to: 'z',
      forwardParam: 'k2',
      reverseParam: 'k2r',
    },
    { kind: 'outflow', id: 'drain', label: 'Z → output', from: 'z', rateParam: 'k3' },
  ],
  parameters: [
    {
      id: 'k1',
      label: 'X → Y rate constant',
      unit: '1/s',
      default: 0.6,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: 'k2',
      label: 'Y → Z rate constant',
      unit: '1/s',
      default: 0.3,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: 'k2r',
      label: 'Z → Y rate constant',
      unit: '1/s',
      default: 0.25,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      id: 'k3',
      label: 'Output rate constant',
      unit: '1/s',
      default: 0.12,
      min: 0,
      max: 2,
      step: 0.01,
    },
  ],
  reservoir: {
    label: 'Collected output',
    description: 'Cumulative amount drained from Z.',
    colorVar: '--reservoir',
    displayCapacity: 30,
    layout: { x: 92, y: 42 },
  },
  config: { duration: 90, dt: 0.02 },
};
