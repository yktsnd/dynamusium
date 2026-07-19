import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  formatManifestValidationIssues,
  validateCommunityWorkManifest,
} from '../src/works/manifest-validator.ts';
import { hashCanonical } from '../src/museum/canonical-hash.ts';

const slug = process.argv[2];
const title = process.argv.slice(3).join(' ') || slug;
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run work:new -- <kebab-case-slug> [Display title]');
  process.exit(1);
}

const lawRef = `${slug}-law-v1`;
const law = 'dx/dt = y; dy/dt = control - x - 0.2 y';
const formal = {
  character: 'deterministic',
  stateSpace: {
    kind: 'euclidean',
    dimension: 2,
    coordinates: [
      { id: 'x', label: 'Position', unit: 'model unit' },
      { id: 'y', label: 'Velocity', unit: 'model unit / model time' },
    ],
  },
  evolution: {
    kind: 'flow',
    time: { kind: 'continuous', unit: 'model time' },
    autonomous: true,
    lawRef,
  },
};
const definitionHash = hashCanonical({ lawRef, law, formal });

const manifest = {
  schemaVersion: 2,
  slug,
  title,
  subtitle: 'A concise curatorial subtitle',
  gallery: 'motion-chaos',
  runtime: 'ode-v1',
  render: 'phase',
  kernel: slug,
  tier: 'collection',
  year: 'YYYY',
  authors: ['Model author'],
  summary:
    'Explain what the model reveals, why its behavior matters, and what visitors can observe.',
  question: 'What precise scientific question should a visitor carry into this work?',
  equation: law,
  duration: 30,
  parameters: [
    { id: 'control', label: 'Control', symbol: 'p', min: 0, max: 2, step: 0.01, default: 1 },
    {
      id: 'initial',
      label: 'Initial state',
      symbol: 'x0',
      min: -1,
      max: 1,
      step: 0.01,
      default: 0.2,
    },
  ],
  presets: [
    { id: 'canonical', label: 'Canonical', values: {} },
    { id: 'quiet', label: 'Quiet regime', values: { control: 0.4 } },
    { id: 'threshold', label: 'Near threshold', values: { control: 1.2 } },
  ],
  citations: [
    { label: 'Primary or canonical scientific source', url: 'https://doi.org/replace-me' },
  ],
  portrait: {
    formal,
    definition: {
      definitionRef: lawRef,
      expectedHash: definitionHash,
      explanation: law,
    },
    parameterRegimes: [
      {
        id: 'reviewed-domain',
        presetIds: ['canonical', 'quiet', 'threshold'],
        parameterDomain: { control: [0, 2], initial: [-1, 1] },
        note: 'The declared parameter box for numerical and scientific review.',
      },
    ],
    primaryClaims: [
      {
        id: 'primary-claim',
        appliesToRegimeIds: ['reviewed-domain'],
        statement:
          'A finite orbit segment shows how the declared state coordinates respond to the control parameter.',
        objectKind: 'orbit-segment',
        observableIds: ['x', 'y'],
        limitations: [
          'A finite computed segment is not evidence for a complete global classification.',
        ],
        targetMaturity: 'M1',
      },
    ],
    science: {
      representation: 'governing-law-execution',
      capabilities: [],
      validations: [
        'finite-output',
        'deterministic-replay',
        'dimension-consistency',
        'parameter-bounds',
        'step-halving',
      ],
      reviewedMaturity: 'M0',
    },
    runtime: {
      kind: 'ode',
      kernel: slug,
      definitionRef: lawRef,
      definitionHash,
      executionProfile: 'rk4-explicit-review-required',
      output: 'trajectory',
    },
    visualMappings: [
      {
        id: 'primary-layer',
        objectId: 'primary-object',
        appliesToRegimeIds: ['reviewed-domain'],
        mark: 'path',
        bindings: [
          {
            quantityRef: 'x',
            channel: 'position-x',
            scale: 'linear',
            domain: [-2, 2],
            unit: 'model unit',
            outOfDomain: 'overflow-indicator',
          },
          {
            quantityRef: 'y',
            channel: 'position-y',
            scale: 'linear',
            domain: [-2, 2],
            unit: 'model unit / model time',
            outOfDomain: 'overflow-indicator',
          },
        ],
        projection: {
          coordinateRefs: ['x', 'y'],
          method: 'selected-coordinates',
          aspect: 'equal-data-units',
        },
        scientificTime: {
          quantityRef: 'simulation-time',
          mode: 'cursor',
          interpolation: 'linear',
        },
        reducedMotion: {
          strategy: 'accumulated-density',
          preserves: ['trajectory support', 'declared projection and domains'],
        },
      },
    ],
    composition: {
      layerIds: ['primary-layer'],
      focalLayerId: 'primary-layer',
      negativeSpace: 0.28,
      camera: 'none',
      atmosphere: {
        assetRef: 'museum-ambient',
        decorativeSeed: slug,
        nonSemantic: true,
        ariaHidden: true,
      },
    },
  },
};

const directory = path.resolve('src/works/community');
const target = path.join(directory, `${slug}.json`);
const validation = validateCommunityWorkManifest(manifest, path.basename(target));
if (!validation.ok) {
  console.error(formatManifestValidationIssues(validation.issues));
  process.exit(1);
}
await mkdir(directory, { recursive: true });
await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(`Created ${path.relative(process.cwd(), target)}`);
console.log('Register its kernel in src/museum/simulation.ts, then run npm run work:validate.');
