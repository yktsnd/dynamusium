import type {
  FieldFrameV2,
  PortraitManifestExtension,
  RunCheckResult,
  RunProvenance,
} from './portrait-types.ts';

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
  /**
   * The physical or model unit this parameter is measured in, e.g. 'm/s²',
   * 'rad', 'dimensionless', or 'model unit' for a nondimensionalized or
   * uncalibrated kernel quantity. Optional so community v1/v2 manifests
   * written before this field existed still validate; new works should
   * always declare one (see CONTRIBUTING_WORKS.md).
   */
  unit?: string;
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

interface WorkManifestBase {
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

export interface WorkManifestV1 extends WorkManifestBase {
  schemaVersion: 1;
  portrait?: never;
}

export interface WorkManifestV2 extends WorkManifestBase {
  schemaVersion: 2;
  portrait: PortraitManifestExtension;
}

export type WorkManifest = WorkManifestV1 | WorkManifestV2;

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
  componentId?: string;
  valueDomain?: readonly [number, number];
}

export interface WorkResult {
  duration: number;
  /** Wall-clock curation time; scientific time remains in `times`. */
  presentationDuration?: number;
  times: number[];
  series: Series[];
  points: TrajectoryPoint[];
  field?: FieldFrame;
  diagnostics: string;
  numerical?: {
    provenance: RunProvenance;
    checks: RunCheckResult[];
    fieldFrames?: FieldFrameV2[];
    state?: {
      coordinateIds: string[];
      shape: readonly [number, number];
      /** Time-major raw state values; never screen coordinates. */
      values: number[];
    };
    terminalEvent?: {
      id: string;
      time: number;
      state: number[];
      primary: string;
      surfaceResidual: number;
      bracketWidth: number;
      message: string;
    };
  };
}

export type MuseumMode = 'observe' | 'study' | 'exhibit';
