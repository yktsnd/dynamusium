import { describe, expect, it } from 'vitest';
import { works } from '../../src/museum/catalog.ts';
import { hashCanonical } from '../../src/museum/canonical-hash.ts';
import type { FormalClass } from '../../src/museum/portrait-types.ts';
import type { WorkManifestV1, WorkManifestV2 } from '../../src/museum/types.ts';
import {
  ManifestValidationError,
  parseCommunityManifestCollection,
  validateCommunityManifestCollection,
  validateCommunityWorkManifest,
  validateWorkManifestV2,
} from '../../src/works/manifest-validator.ts';

function validManifest(overrides: Partial<WorkManifestV1> = {}): WorkManifestV1 {
  return {
    schemaVersion: 1,
    slug: 'example-system',
    title: 'Example System',
    subtitle: 'A bounded example for validator tests',
    gallery: 'motion-chaos',
    runtime: 'ode-v1',
    render: 'phase',
    kernel: 'example-system',
    tier: 'collection',
    year: '2026',
    authors: ['Test Author'],
    summary:
      'A sufficiently detailed original summary describing the behavior visitors can inspect.',
    question: 'Which regime becomes visible as the control parameter changes?',
    equation: 'dx/dt = p - x',
    duration: 30,
    parameters: [
      { id: 'control', label: 'Control', symbol: 'p', min: 0, max: 2, step: 0.1, default: 1 },
      { id: 'initial', label: 'Initial', symbol: 'x₀', min: -1, max: 1, step: 0.1, default: 0 },
    ],
    presets: [
      { id: 'canonical', label: 'Canonical', values: {} },
      { id: 'quiet', label: 'Quiet', values: { control: 0.4 } },
      { id: 'threshold', label: 'Threshold', values: { control: 1.8, initial: -0.5 } },
    ],
    citations: [{ label: 'Primary source', url: 'https://doi.org/10.0000/example' }],
    ...overrides,
  };
}

function validManifestV2(overrides: Partial<WorkManifestV2> = {}): WorkManifestV2 {
  const base = validManifest();
  const lawRef = 'example-system-law-v1';
  const law = base.equation;
  const formal = {
    character: 'deterministic',
    stateSpace: {
      kind: 'euclidean',
      dimension: 2,
      coordinates: [
        { id: 'x', label: 'State', unit: 'model unit' },
        { id: 'y', label: 'Rate', unit: 'model unit / model time' },
      ],
    },
    evolution: {
      kind: 'flow',
      time: { kind: 'continuous', unit: 'model time' },
      autonomous: true,
      lawRef,
    },
  } satisfies FormalClass;
  const definitionHash = hashCanonical({ lawRef, law, formal });
  return {
    ...base,
    schemaVersion: 2,
    portrait: {
      formal,
      definition: { definitionRef: lawRef, expectedHash: definitionHash, explanation: law },
      parameterRegimes: [
        {
          id: 'reviewed-domain',
          presetIds: ['canonical', 'quiet', 'threshold'],
          parameterDomain: { control: [0, 2], initial: [-1, 1] },
          note: 'The parameter box covered by this contribution.',
        },
      ],
      primaryClaims: [
        {
          id: 'primary-claim',
          appliesToRegimeIds: ['reviewed-domain'],
          statement:
            'A finite orbit segment exposes the response of the declared state coordinates.',
          objectKind: 'orbit-segment',
          observableIds: ['x', 'y'],
          limitations: ['A finite segment does not establish a complete global classification.'],
          targetMaturity: 'M1',
        },
      ],
      science: {
        representation: 'governing-law-execution',
        capabilities: [],
        validations: ['finite-output', 'deterministic-replay', 'step-halving'],
        reviewedMaturity: 'M0',
      },
      runtime: {
        kind: 'ode',
        kernel: base.kernel,
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
              outOfDomain: 'overflow-indicator',
            },
            {
              quantityRef: 'y',
              channel: 'position-y',
              scale: 'linear',
              domain: [-2, 2],
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
            preserves: ['trajectory support', 'declared projection'],
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
          nonSemantic: true,
          ariaHidden: true,
        },
      },
    },
    ...overrides,
  };
}

function issueCodes(manifest: unknown) {
  const result = validateCommunityWorkManifest(manifest, 'example.json');
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((entry) => entry.code);
}

describe('community work manifest validation', () => {
  it('returns a typed v1 manifest only after strict validation without mutating it', () => {
    const manifest = validManifest();
    const snapshot = structuredClone(manifest);
    const result = validateCommunityWorkManifest(manifest, 'example.json');

    expect(result).toEqual({ ok: true, value: manifest });
    expect(manifest).toEqual(snapshot);
  });

  it('returns an unchanged typed v2 manifest only after structural and semantic validation', () => {
    const manifest = validManifestV2();
    const snapshot = structuredClone(manifest);
    const result = validateCommunityWorkManifest(manifest, 'portrait.json');

    expect(result).toEqual({ ok: true, value: manifest });
    expect(result.ok && result.value.schemaVersion).toBe(2);
    expect(manifest).toEqual(snapshot);
  });

  it('validates every built-in v2 portrait through the public contribution schema', () => {
    expect(works).toHaveLength(30);
    for (const work of works) {
      expect(work.schemaVersion).toBe(2);
      expect(validateWorkManifestV2(work, `${work.slug}.json`)).toEqual({ ok: true, value: work });
    }
  });

  it.each([
    ['unknown property', { ...validManifest(), unexpected: true }, 'schema.additionalProperties'],
    ['gallery enum', { ...validManifest(), gallery: 'unknown' }, 'schema.enum'],
    ['runtime enum', { ...validManifest(), runtime: 'other-v1' }, 'schema.enum'],
    ['renderer enum', { ...validManifest(), render: 'mesh' }, 'schema.enum'],
    ['kernel type', { ...validManifest(), kernel: 42 }, 'schema.type'],
    ['kernel syntax', { ...validManifest(), kernel: 'not a kernel' }, 'schema.pattern'],
    [
      'positive step',
      {
        ...validManifest(),
        parameters: [{ ...validManifest().parameters[0], step: 0 }, validManifest().parameters[1]],
      },
      'schema.exclusiveMinimum',
    ],
    [
      'HTTPS citation',
      { ...validManifest(), citations: [{ label: 'Source', url: 'http://example.com/paper' }] },
      'schema.pattern',
    ],
  ])('rejects %s violations through JSON Schema', (_label, manifest, expectedCode) => {
    expect(issueCodes(manifest)).toContain(expectedCode);
  });

  it('rejects duplicate parameter ids, reversed bounds, and defaults outside bounds', () => {
    const base = validManifest();
    const result = validateCommunityWorkManifest(
      {
        ...base,
        parameters: [
          { ...base.parameters[0], min: 3, max: 2, default: 4 },
          { ...base.parameters[1], id: base.parameters[0]?.id },
        ],
      },
      'parameters.json',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'semantic.duplicate-parameter-id',
        'semantic.parameter-range',
        'semantic.parameter-default',
      ]),
    );
  });

  it('rejects undeclared preset keys and preset values outside parameter bounds', () => {
    const base = validManifest();
    const result = validateCommunityWorkManifest(
      {
        ...base,
        presets: [
          base.presets[0],
          { ...base.presets[1], values: { unknown: 1 } },
          { ...base.presets[2], values: { control: 3 } },
        ],
      },
      'presets.json',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(['semantic.unknown-preset-parameter', 'semantic.preset-value']),
    );
  });

  it('rejects duplicate preset ids and duplicate slugs across imported files', () => {
    const first = validManifest({
      presets: [
        validManifest().presets[0],
        validManifest().presets[1],
        { ...validManifest().presets[2], id: 'quiet' },
      ],
    });
    expect(issueCodes(first)).toContain('semantic.duplicate-preset-id');

    const result = validateCommunityManifestCollection([
      { source: 'first.json', manifest: validManifest() },
      { source: 'second.json', manifest: validManifest() },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe('collection.duplicate-slug');
  });

  it('keeps unsupported schema versions on an explicit extension seam', () => {
    const result = validateCommunityWorkManifest(
      { ...validManifest(), schemaVersion: 3 },
      'future.json',
    );
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          source: 'future.json',
          path: '/schemaVersion',
          code: 'schema.unsupported-version',
          message: 'unsupported schemaVersion 3; expected 1 or 2',
        },
      ],
    });
  });

  it('rejects geometry, equations, or channel rebinding inside visual composition', () => {
    const base = validManifestV2();
    const visualLayer = base.portrait.visualMappings[0];
    const cases = [
      {
        ...base,
        portrait: {
          ...base.portrait,
          visualMappings: [{ ...visualLayer, geometry: { path: 'M0 0' } }],
        },
      },
      {
        ...base,
        portrait: {
          ...base.portrait,
          visualMappings: [{ ...visualLayer, equation: 'screenX = value * 100' }],
        },
      },
      {
        ...base,
        portrait: {
          ...base.portrait,
          composition: {
            ...base.portrait.composition,
            bindings: [{ quantityRef: 'x', channel: 'hue' }],
          },
        },
      },
    ];

    for (const manifest of cases) {
      expect(issueCodes(manifest)).toContain('schema.additionalProperties');
    }
  });

  it('rejects mismatched hashes, runtime kernels, and undeclared regime references', () => {
    const base = validManifestV2();
    const result = validateCommunityWorkManifest(
      {
        ...base,
        portrait: {
          ...base.portrait,
          definition: {
            ...base.portrait.definition,
            expectedHash: { algorithm: 'sha256', value: '0'.repeat(64) },
          },
          runtime: { ...base.portrait.runtime, kernel: 'different-kernel' },
          parameterRegimes: [
            {
              ...base.portrait.parameterRegimes[0],
              presetIds: ['missing-preset'],
              parameterDomain: { unknown: [0, 1] },
            },
          ],
        },
      },
      'cross-references.json',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'semantic.portrait',
        'semantic.runtime-kernel',
        'semantic.unknown-regime-preset',
        'semantic.unknown-regime-parameter',
      ]),
    );
  });

  it('requires illustrative surrogate representation and runtime to be declared together', () => {
    const base = validManifestV2();
    const declaredSurrogate = {
      ...base,
      portrait: {
        ...base.portrait,
        science: { ...base.portrait.science, representation: 'illustrative-surrogate' as const },
        runtime: { ...base.portrait.runtime, kind: 'surrogate' as const },
      },
    };
    expect(validateCommunityWorkManifest(declaredSurrogate, 'surrogate.json')).toEqual({
      ok: true,
      value: declaredSurrogate,
    });

    const undeclaredRuntime = {
      ...base,
      portrait: {
        ...base.portrait,
        runtime: { ...base.portrait.runtime, kind: 'surrogate' as const },
      },
    };
    const undeclaredRepresentation = {
      ...base,
      portrait: {
        ...base.portrait,
        science: { ...base.portrait.science, representation: 'illustrative-surrogate' as const },
      },
    };
    expect(issueCodes(undeclaredRuntime)).toContain('semantic.portrait');
    expect(issueCodes(undeclaredRepresentation)).toContain('semantic.portrait');
  });

  it('reports a missing schema version through the v1 JSON Schema', () => {
    const manifest: Record<string, unknown> = { ...validManifest() };
    delete manifest.schemaVersion;
    expect(issueCodes(manifest)).toContain('schema.required');
  });

  it('throws a structured error instead of casting an invalid imported collection', () => {
    expect(() =>
      parseCommunityManifestCollection([
        { source: 'invalid.json', manifest: { ...validManifest(), kernel: 42 } },
      ]),
    ).toThrow(ManifestValidationError);
  });
});
