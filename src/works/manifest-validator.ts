import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validatePortraitExtension } from '../museum/portrait-validation.ts';
import type { WorkManifest, WorkManifestV1, WorkManifestV2 } from '../museum/types.ts';
import workManifestV1Schema from './work.schema.json' with { type: 'json' };
import workManifestV2Schema from './work-v2.schema.json' with { type: 'json' };

export interface ManifestValidationIssue {
  source: string;
  path: string;
  code: string;
  message: string;
}

export type ManifestValidationResult<T> =
  { ok: true; value: T } | { ok: false; issues: ManifestValidationIssue[] };

export interface CommunityManifestEntry {
  source: string;
  manifest: unknown;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validateV1Schema = ajv.compile<WorkManifestV1>(workManifestV1Schema);
const validateV2Schema = ajv.compile<WorkManifestV2>(workManifestV2Schema);

function issue(source: string, path: string, code: string, message: string) {
  return { source, path, code, message } satisfies ManifestValidationIssue;
}

function pathForSchemaError(error: ErrorObject) {
  if (error.keyword === 'required') {
    const missingProperty = (error.params as { missingProperty?: string }).missingProperty;
    return `${error.instancePath}/${missingProperty ?? '?'}`;
  }
  if (error.keyword === 'additionalProperties') {
    const additionalProperty = (error.params as { additionalProperty?: string }).additionalProperty;
    return `${error.instancePath}/${additionalProperty ?? '?'}`;
  }
  return error.instancePath || '/';
}

function schemaIssues(source: string, errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).map((error) =>
    issue(
      source,
      pathForSchemaError(error),
      `schema.${error.keyword}`,
      error.message ?? 'does not match the work manifest schema',
    ),
  );
}

function duplicateIdIssues(
  source: string,
  collection: ReadonlyArray<{ id: string }>,
  collectionPath: '/parameters' | '/presets',
) {
  const seen = new Map<string, number>();
  const issues: ManifestValidationIssue[] = [];
  collection.forEach(({ id }, index) => {
    const firstIndex = seen.get(id);
    if (firstIndex === undefined) {
      seen.set(id, index);
      return;
    }
    issues.push(
      issue(
        source,
        `${collectionPath}/${index}/id`,
        `semantic.duplicate-${collectionPath.slice(1, -1)}-id`,
        `duplicates ${collectionPath.slice(1, -1)} id "${id}" first declared at index ${firstIndex}`,
      ),
    );
  });
  return issues;
}

function baseSemanticIssues(source: string, manifest: WorkManifest) {
  const issues: ManifestValidationIssue[] = [
    ...duplicateIdIssues(source, manifest.parameters, '/parameters'),
    ...duplicateIdIssues(source, manifest.presets, '/presets'),
  ];
  const parameters = new Map(manifest.parameters.map((parameter) => [parameter.id, parameter]));

  manifest.parameters.forEach((parameter, index) => {
    if (parameter.min > parameter.max) {
      issues.push(
        issue(
          source,
          `/parameters/${index}/max`,
          'semantic.parameter-range',
          `must be greater than or equal to min (${parameter.min})`,
        ),
      );
    }
    if (parameter.default < parameter.min || parameter.default > parameter.max) {
      issues.push(
        issue(
          source,
          `/parameters/${index}/default`,
          'semantic.parameter-default',
          `must be within [${parameter.min}, ${parameter.max}]`,
        ),
      );
    }
  });

  manifest.presets.forEach((preset, presetIndex) => {
    Object.entries(preset.values).forEach(([parameterId, value]) => {
      const parameter = parameters.get(parameterId);
      const valuePath = `/presets/${presetIndex}/values/${parameterId}`;
      if (!parameter) {
        issues.push(
          issue(
            source,
            valuePath,
            'semantic.unknown-preset-parameter',
            `references undeclared parameter "${parameterId}"`,
          ),
        );
        return;
      }
      if (value < parameter.min || value > parameter.max) {
        issues.push(
          issue(
            source,
            valuePath,
            'semantic.preset-value',
            `must be within [${parameter.min}, ${parameter.max}]`,
          ),
        );
      }
    });
  });

  return issues;
}

function v2SemanticIssues(source: string, manifest: WorkManifestV2) {
  const issues = validatePortraitExtension(manifest.portrait).map((portraitIssue) =>
    issue(source, `/portrait${portraitIssue.path}`, 'semantic.portrait', portraitIssue.message),
  );
  const { formal, definition, parameterRegimes, runtime } = manifest.portrait;

  if (definition.definitionRef !== runtime.definitionRef) {
    issues.push(
      issue(
        source,
        '/portrait/runtime/definitionRef',
        'semantic.definition-ref',
        'must match portrait.definition.definitionRef',
      ),
    );
  }
  if (runtime.kernel !== manifest.kernel) {
    issues.push(
      issue(
        source,
        '/portrait/runtime/kernel',
        'semantic.runtime-kernel',
        `must match manifest kernel "${manifest.kernel}"`,
      ),
    );
  }

  const evolutionDefinitionRef =
    formal.evolution.kind === 'markov-chain'
      ? formal.evolution.transitionLawRef
      : formal.evolution.lawRef;
  if (evolutionDefinitionRef !== definition.definitionRef) {
    issues.push(
      issue(
        source,
        '/portrait/formal/evolution',
        'semantic.evolution-definition-ref',
        'evolution law reference must match portrait.definition.definitionRef',
      ),
    );
  }

  if (
    (formal.stateSpace.kind === 'euclidean' || formal.stateSpace.kind === 'product') &&
    formal.stateSpace.dimension !== formal.stateSpace.coordinates.length
  ) {
    issues.push(
      issue(
        source,
        '/portrait/formal/stateSpace/dimension',
        'semantic.state-dimension',
        `must equal the ${formal.stateSpace.coordinates.length} declared coordinates`,
      ),
    );
  }
  if (
    formal.stateSpace.kind === 'product' &&
    formal.stateSpace.dimension !== formal.stateSpace.factors.length
  ) {
    issues.push(
      issue(
        source,
        '/portrait/formal/stateSpace/factors',
        'semantic.product-dimension',
        `must contain ${formal.stateSpace.dimension} factors`,
      ),
    );
  }

  const supportedRuntimeKinds = {
    'reaction-network-v1': new Set(['ode', 'surrogate']),
    'ode-v1': new Set(['ode', 'analytic', 'hybrid', 'surrogate']),
    'field-v1': new Set(['field', 'analytic', 'stochastic', 'surrogate']),
    'discrete-v1': new Set(['map', 'stochastic', 'surrogate']),
    'analytic-v1': new Set(['analytic', 'hybrid', 'surrogate']),
  }[manifest.runtime];
  if (!supportedRuntimeKinds.has(runtime.kind)) {
    issues.push(
      issue(
        source,
        '/portrait/runtime/kind',
        'semantic.runtime-compatibility',
        `${runtime.kind} is not compatible with legacy dispatcher ${manifest.runtime}`,
      ),
    );
  }

  const parameters = new Map(manifest.parameters.map((parameter) => [parameter.id, parameter]));
  const presetIds = new Set(manifest.presets.map((preset) => preset.id));
  parameterRegimes.forEach((regime, regimeIndex) => {
    regime.presetIds.forEach((presetId, presetIndex) => {
      if (!presetIds.has(presetId)) {
        issues.push(
          issue(
            source,
            `/portrait/parameterRegimes/${regimeIndex}/presetIds/${presetIndex}`,
            'semantic.unknown-regime-preset',
            `references undeclared preset "${presetId}"`,
          ),
        );
      }
    });
    Object.entries(regime.parameterDomain).forEach(([parameterId, domain]) => {
      const parameter = parameters.get(parameterId);
      const domainPath = `/portrait/parameterRegimes/${regimeIndex}/parameterDomain/${parameterId}`;
      if (!parameter) {
        issues.push(
          issue(
            source,
            domainPath,
            'semantic.unknown-regime-parameter',
            `references undeclared parameter "${parameterId}"`,
          ),
        );
        return;
      }
      const [minimum, maximum] = domain;
      if (minimum > maximum) {
        issues.push(
          issue(
            source,
            domainPath,
            'semantic.regime-range',
            'lower bound must not exceed upper bound',
          ),
        );
      } else if (minimum < parameter.min || maximum > parameter.max) {
        issues.push(
          issue(
            source,
            domainPath,
            'semantic.regime-bounds',
            `must stay within parameter bounds [${parameter.min}, ${parameter.max}]`,
          ),
        );
      }
    });
  });

  return issues;
}

/** Validate one schema-v1 manifest without coercing or mutating the input. */
export function validateWorkManifestV1(
  manifest: unknown,
  source = '<manifest>',
): ManifestValidationResult<WorkManifestV1> {
  if (!validateV1Schema(manifest)) {
    return { ok: false, issues: schemaIssues(source, validateV1Schema.errors) };
  }
  const issues = baseSemanticIssues(source, manifest);
  return issues.length ? { ok: false, issues } : { ok: true, value: manifest };
}

/** Validate one schema-v2 manifest and its cross-reference semantics without coercion. */
export function validateWorkManifestV2(
  manifest: unknown,
  source = '<manifest>',
): ManifestValidationResult<WorkManifestV2> {
  if (!validateV2Schema(manifest)) {
    return { ok: false, issues: schemaIssues(source, validateV2Schema.errors) };
  }
  const issues = [...baseSemanticIssues(source, manifest), ...v2SemanticIssues(source, manifest)];
  return issues.length ? { ok: false, issues } : { ok: true, value: manifest };
}

/** Version dispatch is explicit so one contract cannot loosen another. */
export function validateCommunityWorkManifest(
  manifest: unknown,
  source = '<manifest>',
): ManifestValidationResult<WorkManifest> {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return validateWorkManifestV1(manifest, source);
  }
  const schemaVersion = Reflect.get(manifest, 'schemaVersion');
  if (schemaVersion === undefined) return validateWorkManifestV1(manifest, source);
  if (schemaVersion === 1) return validateWorkManifestV1(manifest, source);
  if (schemaVersion === 2) return validateWorkManifestV2(manifest, source);
  return {
    ok: false,
    issues: [
      issue(
        source,
        '/schemaVersion',
        'schema.unsupported-version',
        `unsupported schemaVersion ${String(schemaVersion)}; expected 1 or 2`,
      ),
    ],
  };
}

/** Validate imported JSON modules as unknown before exposing typed manifests. */
export function validateCommunityManifestCollection(
  entries: readonly CommunityManifestEntry[],
): ManifestValidationResult<WorkManifest[]> {
  const manifests: WorkManifest[] = [];
  const issues: ManifestValidationIssue[] = [];
  const slugSources = new Map<string, string>();

  for (const entry of entries) {
    const result = validateCommunityWorkManifest(entry.manifest, entry.source);
    if (!result.ok) {
      issues.push(...result.issues);
      continue;
    }
    const firstSource = slugSources.get(result.value.slug);
    if (firstSource !== undefined) {
      issues.push(
        issue(
          entry.source,
          '/slug',
          'collection.duplicate-slug',
          `duplicates slug "${result.value.slug}" from ${firstSource}`,
        ),
      );
      continue;
    }
    slugSources.set(result.value.slug, entry.source);
    manifests.push(result.value);
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: manifests };
}

export class ManifestValidationError extends Error {
  readonly issues: ManifestValidationIssue[];

  constructor(issues: ManifestValidationIssue[]) {
    super(formatManifestValidationIssues(issues));
    this.name = 'ManifestValidationError';
    this.issues = issues;
  }
}

export function parseCommunityManifestCollection(
  entries: readonly CommunityManifestEntry[],
): WorkManifest[] {
  const result = validateCommunityManifestCollection(entries);
  if (!result.ok) throw new ManifestValidationError(result.issues);
  return result.value;
}

export function formatManifestValidationIssues(issues: readonly ManifestValidationIssue[]) {
  return issues
    .map(({ source, path, code, message }) => `${source}${path}: ${message} (${code})`)
    .join('\n');
}
