import type { InputProfile, ParameterValues, SpeciesId } from '../../model/schema.ts';

/**
 * A preset is a curated scenario for the demonstration model: an input
 * profile, parameter overrides, and optional initial-condition overrides.
 * Presets never change the model structure.
 */
export interface Preset {
  id: string;
  name: string;
  /** One-line description shown under the preset switcher. */
  tagline: string;
  profile: InputProfile;
  paramOverrides?: ParameterValues;
  initialOverrides?: Record<SpeciesId, number>;
}

export const presets: Preset[] = [
  {
    id: 'steady-feed',
    name: 'Steady feed',
    tagline: 'A constant feed drives the chain toward a flowing steady state.',
    profile: { kind: 'constant', rate: 0.8 },
  },
  {
    id: 'pulse-relay',
    name: 'Pulse relay',
    tagline: 'A single feed pulse travels through the chain and drains away.',
    profile: { kind: 'pulse', amplitude: 2.6, center: 8, width: 2.2 },
    initialOverrides: { a: 0.2, b: 0, c: 0 },
  },
  {
    id: 'tidal-feed',
    name: 'Tidal feed',
    tagline: 'An oscillating feed — watch each stage lag behind the last.',
    profile: { kind: 'sine', base: 0.7, amplitude: 0.6, period: 18 },
    paramOverrides: { kout: 0.6 },
  },
  {
    id: 'closed-equilibrium',
    name: 'Closed equilibrium',
    tagline: 'No feed, no drain: A and B settle into reversible equilibrium.',
    profile: { kind: 'none' },
    paramOverrides: { k2: 0.06, kout: 0 },
    initialOverrides: { a: 5, b: 0.2, c: 0 },
  },
];

export const defaultPresetId = presets[0].id;
