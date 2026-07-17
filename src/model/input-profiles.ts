import type { InputProfile } from './schema.ts';

/** Evaluate an input profile at time t. Always >= 0. */
export function evaluateProfile(profile: InputProfile, t: number): number {
  switch (profile.kind) {
    case 'none':
      return 0;
    case 'constant':
      return Math.max(0, profile.rate);
    case 'pulse': {
      const z = (t - profile.center) / profile.width;
      return Math.max(0, profile.amplitude) * Math.exp(-0.5 * z * z);
    }
    case 'sine': {
      const v = profile.base + profile.amplitude * Math.sin((2 * Math.PI * t) / profile.period);
      return Math.max(0, v);
    }
  }
}

export interface ProfileFieldDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** Editable fields per profile kind, for the inspector UI. */
export function profileFields(
  kind: InputProfile['kind'],
  units: { rate: string; time: string },
): ProfileFieldDef[] {
  switch (kind) {
    case 'none':
      return [];
    case 'constant':
      return [{ key: 'rate', label: 'Feed rate', unit: units.rate, min: 0, max: 3, step: 0.05 }];
    case 'pulse':
      return [
        { key: 'amplitude', label: 'Peak rate', unit: units.rate, min: 0, max: 6, step: 0.1 },
        { key: 'center', label: 'Pulse center', unit: units.time, min: 0, max: 60, step: 0.5 },
        { key: 'width', label: 'Pulse width', unit: units.time, min: 0.2, max: 12, step: 0.1 },
      ];
    case 'sine':
      return [
        { key: 'base', label: 'Base rate', unit: units.rate, min: 0, max: 3, step: 0.05 },
        { key: 'amplitude', label: 'Swing', unit: units.rate, min: 0, max: 3, step: 0.05 },
        { key: 'period', label: 'Period', unit: units.time, min: 2, max: 60, step: 1 },
      ];
  }
}

export const PROFILE_KIND_LABELS: Record<InputProfile['kind'], string> = {
  none: 'No feed',
  constant: 'Constant feed',
  pulse: 'Pulse feed',
  sine: 'Oscillating feed',
};
