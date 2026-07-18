export type GalleryId =
  'motion-chaos' | 'matter-pattern' | 'life-reaction' | 'earth-climate' | 'cosmos-gravity';

export type RuntimeKind =
  'reaction-network-v1' | 'ode-v1' | 'field-v1' | 'discrete-v1' | 'analytic-v1';

export type RenderKind = 'phase' | 'orbit' | 'field' | 'series';

export interface WorkParameter {
  id: string;
  label: string;
  symbol: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface WorkPreset {
  id: string;
  label: string;
  values: Record<string, number>;
}

export interface WorkCitation {
  label: string;
  url: string;
}

export interface WorkManifest {
  schemaVersion: 1;
  slug: string;
  title: string;
  subtitle: string;
  gallery: GalleryId;
  runtime: RuntimeKind;
  render: RenderKind;
  kernel: string;
  tier: 'flagship' | 'collection';
  year: string;
  authors: string[];
  summary: string;
  question: string;
  equation: string;
  duration: number;
  parameters: WorkParameter[];
  presets: WorkPreset[];
  citations: WorkCitation[];
}

export interface Series {
  id: string;
  label: string;
  color: string;
  values: number[];
}

export interface TrajectoryPoint {
  x: number;
  y: number;
}

export interface FieldFrame {
  columns: number;
  rows: number;
  values: number[];
}

export interface WorkResult {
  duration: number;
  times: number[];
  series: Series[];
  points: TrajectoryPoint[];
  field?: FieldFrame;
  diagnostics: string;
}

export type MuseumMode = 'observe' | 'study' | 'exhibit';
