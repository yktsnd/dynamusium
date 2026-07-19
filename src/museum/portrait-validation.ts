import type {
  MarkKind,
  PortraitManifestExtension,
  RuntimeKindV2,
  SemanticVisualLayer,
  VisualChannel,
} from './portrait-types.ts';

export interface PortraitValidationIssue {
  path: string;
  message: string;
}

const allowedChannels: Record<MarkKind, ReadonlySet<VisualChannel>> = {
  point: new Set(['position-x', 'position-y', 'area', 'hue', 'opacity']),
  path: new Set(['position-x', 'position-y', 'stroke-width', 'hue', 'opacity', 'direction']),
  region: new Set(['position-x', 'position-y', 'area', 'hue', 'opacity']),
  'field-raster': new Set(['luminance', 'hue', 'opacity']),
  'contour-line': new Set(['position-x', 'position-y', 'stroke-width', 'hue', 'opacity']),
  glyph: new Set(['position-x', 'position-y', 'phase', 'orientation', 'area', 'hue', 'opacity']),
  particle: new Set([
    'position-x',
    'position-y',
    'direction',
    'event-frequency',
    'area',
    'hue',
    'opacity',
    'stroke-width',
  ]),
  fill: new Set(['position-x', 'position-y', 'area', 'luminance', 'hue', 'opacity']),
};

function expectedRuntime(evolution: PortraitManifestExtension['formal']['evolution']['kind']) {
  const allowed: Record<typeof evolution, RuntimeKindV2[]> = {
    flow: ['ode', 'analytic', 'hybrid', 'surrogate'],
    semiflow: ['field', 'analytic', 'surrogate'],
    process: ['ode', 'field', 'analytic', 'hybrid', 'surrogate'],
    map: ['map', 'stochastic', 'surrogate'],
    'markov-chain': ['stochastic', 'surrogate'],
  };
  return allowed[evolution];
}

function validateLayer(layer: SemanticVisualLayer, index: number): PortraitValidationIssue[] {
  const issues: PortraitValidationIssue[] = [];
  if (layer.bindings.length === 0) {
    issues.push({ path: `/visualMappings/${index}/bindings`, message: 'must not be empty' });
  }
  const permitted = allowedChannels[layer.mark];
  layer.bindings.forEach((binding, bindingIndex) => {
    if (!permitted.has(binding.channel)) {
      issues.push({
        path: `/visualMappings/${index}/bindings/${bindingIndex}/channel`,
        message: `${binding.channel} is not meaningful for ${layer.mark}`,
      });
    }
    if (Array.isArray(binding.domain) && binding.domain.length === 2) {
      const [left, right] = binding.domain;
      if (typeof left === 'number' && typeof right === 'number') {
        if (!Number.isFinite(left) || !Number.isFinite(right) || left >= right) {
          issues.push({
            path: `/visualMappings/${index}/bindings/${bindingIndex}/domain`,
            message: 'numeric domains must be finite and strictly increasing',
          });
        }
      }
    }
    if (binding.zero !== undefined) {
      const [left, right] = binding.domain;
      if (
        binding.scale === 'categorical' ||
        typeof left !== 'number' ||
        typeof right !== 'number' ||
        !Number.isFinite(binding.zero) ||
        binding.zero < left ||
        binding.zero > right
      ) {
        issues.push({
          path: `/visualMappings/${index}/bindings/${bindingIndex}/zero`,
          message: 'zero must be finite and inside a numeric domain',
        });
      }
    }
    if (binding.channel === 'event-frequency') {
      if (
        binding.eventQuantum === undefined ||
        !Number.isFinite(binding.eventQuantum) ||
        binding.eventQuantum <= 0 ||
        !binding.eventAccumulatorRef
      ) {
        issues.push({
          path: `/visualMappings/${index}/bindings/${bindingIndex}/eventQuantum`,
          message:
            'event-frequency requires a finite positive quantum and a precomputed event accumulator',
        });
      }
    } else if (binding.eventQuantum !== undefined || binding.eventAccumulatorRef !== undefined) {
      issues.push({
        path: `/visualMappings/${index}/bindings/${bindingIndex}/eventQuantum`,
        message: 'event quantum and accumulator are only meaningful for event-frequency',
      });
    }
  });
  if (layer.mark === 'path') {
    const channels = new Set(layer.bindings.map((binding) => binding.channel));
    if (!channels.has('position-x') || !channels.has('position-y')) {
      issues.push({
        path: `/visualMappings/${index}/bindings`,
        message: 'a path requires reviewed x and y position bindings',
      });
    }
  }
  return issues;
}

export function validatePortraitExtension(
  portrait: PortraitManifestExtension,
): PortraitValidationIssue[] {
  const issues: PortraitValidationIssue[] = [];
  if (portrait.definition.expectedHash.value !== portrait.runtime.definitionHash.value) {
    issues.push({
      path: '/runtime/definitionHash',
      message: 'must match the reviewed definition hash',
    });
  }
  const allowedRuntimes = expectedRuntime(portrait.formal.evolution.kind);
  if (!allowedRuntimes.includes(portrait.runtime.kind)) {
    issues.push({
      path: '/runtime/kind',
      message: `${portrait.runtime.kind} cannot execute a ${portrait.formal.evolution.kind}`,
    });
  }
  if (
    portrait.runtime.output === 'field-trajectory' &&
    !['field', 'analytic', 'stochastic', 'surrogate'].includes(portrait.runtime.kind)
  ) {
    issues.push({
      path: '/runtime/output',
      message: 'field trajectories require a field, analytic, or stochastic runtime',
    });
  }
  const declaresSurrogate = portrait.science.representation === 'illustrative-surrogate';
  const executesSurrogate = portrait.runtime.kind === 'surrogate';
  if (declaresSurrogate !== executesSurrogate) {
    issues.push({
      path: '/science/representation',
      message:
        'illustrative-surrogate representation and surrogate runtime kind must be declared together',
    });
  }
  const regimeIds = new Set(portrait.parameterRegimes.map((regime) => regime.id));
  if (regimeIds.size !== portrait.parameterRegimes.length) {
    issues.push({ path: '/parameterRegimes', message: 'regime ids must be unique' });
  }
  const claimIds = new Set<string>();
  portrait.primaryClaims.forEach((claim, index) => {
    if (claimIds.has(claim.id)) {
      issues.push({
        path: `/primaryClaims/${index}/id`,
        message: `duplicate claim id ${claim.id}`,
      });
    }
    claimIds.add(claim.id);
    if (claim.appliesToRegimeIds.length === 0) {
      issues.push({
        path: `/primaryClaims/${index}/appliesToRegimeIds`,
        message: 'must name at least one reviewed regime',
      });
    }
    for (const regimeId of claim.appliesToRegimeIds) {
      if (!regimeIds.has(regimeId)) {
        issues.push({
          path: `/primaryClaims/${index}/appliesToRegimeIds`,
          message: `unknown regime ${regimeId}`,
        });
      }
    }
  });
  for (const regimeId of regimeIds) {
    const matchingClaims = portrait.primaryClaims.filter((claim) =>
      claim.appliesToRegimeIds.includes(regimeId),
    );
    if (matchingClaims.length !== 1) {
      issues.push({
        path: '/primaryClaims',
        message: `reviewed regime ${regimeId} must have exactly one primary claim; found ${matchingClaims.length}`,
      });
    }
  }
  const layerIds = new Set<string>();
  portrait.visualMappings.forEach((layer, index) => {
    if (layerIds.has(layer.id)) {
      issues.push({
        path: `/visualMappings/${index}/id`,
        message: `duplicate layer id ${layer.id}`,
      });
    }
    layerIds.add(layer.id);
    for (const regimeId of layer.appliesToRegimeIds) {
      if (!regimeIds.has(regimeId)) {
        issues.push({
          path: `/visualMappings/${index}/appliesToRegimeIds`,
          message: `unknown regime ${regimeId}`,
        });
      }
    }
    issues.push(...validateLayer(layer, index));
  });
  const compositionIds = new Set(portrait.composition.layerIds);
  if (compositionIds.size !== portrait.composition.layerIds.length) {
    issues.push({ path: '/composition/layerIds', message: 'composition layer ids must be unique' });
  }
  for (const layerId of compositionIds) {
    if (!layerIds.has(layerId)) {
      issues.push({ path: '/composition/layerIds', message: `unknown semantic layer ${layerId}` });
    }
  }
  if (!compositionIds.has(portrait.composition.focalLayerId)) {
    issues.push({
      path: '/composition/focalLayerId',
      message: 'must name a composed semantic layer',
    });
  }
  if (portrait.composition.negativeSpace < 0 || portrait.composition.negativeSpace > 0.8) {
    issues.push({ path: '/composition/negativeSpace', message: 'must be between 0 and 0.8' });
  }
  if (
    !portrait.composition.atmosphere?.nonSemantic ||
    !portrait.composition.atmosphere.ariaHidden
  ) {
    issues.push({
      path: '/composition/atmosphere',
      message: 'atmosphere must be non-semantic and aria-hidden',
    });
  }
  return issues;
}

export function assertValidPortraitExtension(portrait: PortraitManifestExtension) {
  const issues = validatePortraitExtension(portrait);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }
}
