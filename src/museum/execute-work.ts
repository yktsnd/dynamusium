import { hashCanonical } from './canonical-hash.ts';
import { runOptionalAnalyzers } from './analyzers.ts';
import { createPortraitExtension } from './portrait-registry.ts';
import { simulateWork } from './simulation.ts';
import type {
  DynamicalPortrait,
  Maturity,
  PortraitManifestExtension,
  RunCheckResult,
  RunIdentity,
  RunPayload,
  RunProvenance,
  ValidationRequirementId,
  WorkRunResult,
} from './portrait-types.ts';
import type { WorkManifest, WorkResult } from './types.ts';

export interface WorkExecution {
  display: WorkResult | null;
  run: WorkRunResult;
}

const baseCheckIds = new Set<ValidationRequirementId>([
  'finite-output',
  'deterministic-replay',
  'dimension-consistency',
  'parameter-bounds',
]);

const maturityOrder: Maturity[] = ['M0', 'M1', 'M2', 'M3', 'M4'];

function portraitFor(work: WorkManifest): PortraitManifestExtension {
  if (work.schemaVersion === 2) return work.portrait;
  return createPortraitExtension({
    slug: work.slug,
    kernel: work.kernel,
    render: work.render,
    parameters: work.parameters,
    presets: work.presets,
  });
}

function resolveParameters(work: WorkManifest, overrides: Record<string, number>) {
  const known = new Set(work.parameters.map((parameter) => parameter.id));
  const unknown = Object.keys(overrides).filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`Unknown parameter(s): ${unknown.join(', ')}.`);
  return Object.fromEntries(
    work.parameters.map((parameter) => {
      const value = overrides[parameter.id] ?? parameter.default;
      if (!Number.isFinite(value)) throw new Error(`Parameter ${parameter.id} must be finite.`);
      if (value < parameter.min || value > parameter.max) {
        throw new Error(
          `Parameter ${parameter.id}=${value} is outside [${parameter.min}, ${parameter.max}].`,
        );
      }
      return [parameter.id, value];
    }),
  );
}

function identityFor(
  work: WorkManifest,
  portrait: PortraitManifestExtension,
  resolvedParameters: Record<string, number>,
  requestId: string,
): RunIdentity {
  const manifestHash = hashCanonical(work);
  const resolvedPreset = work.presets.find((preset) => {
    const values = {
      ...Object.fromEntries(work.parameters.map((p) => [p.id, p.default])),
      ...preset.values,
    };
    return work.parameters.every(
      (parameter) => values[parameter.id] === resolvedParameters[parameter.id],
    );
  });
  const random =
    portrait.runtime.kind === 'stochastic'
      ? { algorithm: 'mulberry32', seed: '1597463007' }
      : undefined;
  const inputHash = hashCanonical({
    manifestHash,
    definitionHash: portrait.runtime.definitionHash,
    executionProfile: portrait.runtime.executionProfile,
    parameters: resolvedParameters,
    random,
  });
  return {
    requestId,
    runId: hashCanonical({ requestId, work: work.slug, inputHash }).value.slice(0, 24),
    workSlug: work.slug,
    schemaVersion: 2,
    manifestHash,
    inputHash,
    ...(resolvedPreset ? { resolvedPresetId: resolvedPreset.id } : {}),
    resolvedParameters,
  };
}

function provenanceFor(
  portrait: PortraitManifestExtension,
  duration: number,
  display?: WorkResult,
): RunProvenance {
  const runtimeKind = portrait.runtime.kind;
  const executionKind =
    runtimeKind === 'analytic'
      ? 'analytic-evaluator'
      : runtimeKind === 'surrogate'
        ? 'surrogate-evaluator'
        : runtimeKind === 'stochastic'
          ? 'sampler'
          : 'numerical-solver';
  const inherited = display?.numerical?.provenance;
  if (inherited) return inherited;
  return {
    kernel: {
      id: portrait.runtime.kernel,
      version: '2.0.0',
      definitionHash: portrait.runtime.definitionHash,
    },
    execution: {
      kind: executionKind,
      id: portrait.runtime.executionProfile,
      version: '1.0.0',
      precision: 'float64',
      ...(display && display.times.length > 1
        ? { fixedStep: display.duration / (display.times.length - 1) }
        : {}),
      ...(display ? { iterations: Math.max(0, display.times.length - 1) } : {}),
    },
    interval: [display?.times[0] ?? 0, duration],
    initialCondition: { ref: `${portrait.runtime.definitionRef}:initial-condition` },
    ...(runtimeKind === 'stochastic'
      ? {
          random: {
            algorithm: 'mulberry32',
            version: '1',
            seed: '1597463007',
            sampleSchedule: 'declared Monte Carlo sweeps',
          },
        }
      : {}),
  };
}

function replayEqual(left: unknown, right: unknown): boolean {
  const pending: Array<readonly [unknown, unknown]> = [[left, right]];
  while (pending.length > 0) {
    const pair = pending.pop();
    if (!pair) return false;
    const [leftValue, rightValue] = pair;
    if (Object.is(leftValue, rightValue)) continue;
    if (
      typeof leftValue !== 'object' ||
      leftValue === null ||
      typeof rightValue !== 'object' ||
      rightValue === null
    ) {
      return false;
    }
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      if (!Array.isArray(leftValue) || !Array.isArray(rightValue)) return false;
      if (leftValue.length !== rightValue.length) return false;
      for (let index = 0; index < leftValue.length; index += 1) {
        pending.push([leftValue[index], rightValue[index]]);
      }
      continue;
    }
    const leftRecord = leftValue as Record<string, unknown>;
    const rightRecord = rightValue as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index];
      if (key === undefined || key !== rightKeys[index]) return false;
      pending.push([leftRecord[key], rightRecord[key]]);
    }
  }
  return true;
}

function genericChecks(
  work: WorkManifest,
  display: WorkResult,
  deterministicReplayPassed: boolean,
): RunCheckResult[] {
  const finite =
    display.times.every(Number.isFinite) &&
    display.series.every((series) => series.values.every(Number.isFinite)) &&
    display.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) &&
    (!display.field || display.field.values.every(Number.isFinite));
  const dimensions =
    display.times.length > 0 &&
    display.times.every((time, index) => index === 0 || time > display.times[index - 1]!) &&
    display.points.length === display.times.length &&
    display.series.every((series) => series.values.length === display.times.length) &&
    (!display.field || display.field.values.length === display.field.columns * display.field.rows);
  const checks: RunCheckResult[] = [
    {
      id: 'finite-output',
      status: finite ? 'passed' : 'failed',
      severity: 'hard',
      metrics: [],
      message: finite
        ? 'Every exposed numerical value is finite.'
        : 'A non-finite value was exposed.',
    },
    {
      id: 'dimension-consistency',
      status: dimensions ? 'passed' : 'failed',
      severity: 'hard',
      metrics: [],
      message: dimensions
        ? 'Times, observables, projection samples, and field shapes agree.'
        : 'Result dimensions disagree.',
    },
    {
      id: 'parameter-bounds',
      status: 'passed',
      severity: 'hard',
      metrics: [],
      message: `All ${work.parameters.length} resolved parameters passed declared bounds.`,
    },
    {
      id: 'deterministic-replay',
      status: deterministicReplayPassed ? 'passed' : 'failed',
      severity: 'hard',
      metrics: [],
      message: deterministicReplayPassed
        ? 'A second execution with identical resolved inputs and seed reproduced the complete WorkResult exactly.'
        : 'An identical resolved execution did not reproduce the complete WorkResult.',
    },
  ];
  if (work.schemaVersion === 2 && work.portrait.runtime.kind === 'stochastic') {
    checks.push({
      id: 'seeded-replay',
      status: deterministicReplayPassed ? 'passed' : 'failed',
      severity: 'claim',
      metrics: [],
      message: deterministicReplayPassed
        ? 'A second sampler execution with the same recorded PRNG algorithm, seed, schedule, and resolved inputs reproduced the complete WorkResult exactly.'
        : 'The recorded PRNG algorithm, seed, schedule, and resolved inputs did not reproduce the complete WorkResult.',
    });
  }
  return checks;
}

function deduplicateChecks(checks: RunCheckResult[]) {
  const byId = new Map<string, RunCheckResult>();
  const statusRank: Record<RunCheckResult['status'], number> = {
    passed: 0,
    'not-run': 1,
    failed: 2,
  };
  for (const check of checks) {
    const existing = byId.get(check.id);
    if (!existing) {
      byId.set(check.id, {
        ...check,
        severity: baseCheckIds.has(check.id as ValidationRequirementId) ? 'hard' : check.severity,
      });
      continue;
    }
    const selected = statusRank[check.status] >= statusRank[existing.status] ? check : existing;
    byId.set(check.id, {
      ...selected,
      severity:
        baseCheckIds.has(check.id as ValidationRequirementId) ||
        existing.severity === 'hard' ||
        check.severity === 'hard'
          ? 'hard'
          : 'claim',
    });
  }
  return [...byId.values()];
}

function completeDeclaredChecks(
  portrait: PortraitManifestExtension,
  checks: RunCheckResult[],
): RunCheckResult[] {
  const complete = deduplicateChecks(checks);
  const present = new Set(complete.map((check) => check.id));
  for (const id of portrait.science.validations) {
    if (present.has(id)) continue;
    complete.push({
      id,
      status: 'not-run',
      severity: baseCheckIds.has(id) ? 'hard' : 'claim',
      metrics: [],
      message: 'This declared validation was not produced by the active execution profile.',
    });
  }
  return complete;
}

function payloadFor(display: WorkResult, portrait: PortraitManifestExtension): RunPayload {
  const observables = display.series.map((series) => ({
    id: series.id,
    label: series.label,
    unit: 'model unit',
    values: [...series.values],
  }));
  const fieldFrames = display.numerical?.fieldFrames;
  if (fieldFrames && fieldFrames.length > 0) {
    return {
      kind: 'field-trajectory',
      times: fieldFrames.map((frame) => frame.time),
      frames: fieldFrames,
      observables,
    };
  }
  if (display.field) {
    return {
      kind: 'field-trajectory',
      times: [0],
      frames: [
        {
          time: 0,
          shape: [display.field.rows, display.field.columns],
          components: { scalar: [...display.field.values] },
          coordinates: { names: ['y', 'x'], spacing: [1, 1] },
        },
      ],
      observables,
    };
  }
  const stateSpace = portrait.formal.stateSpace;
  if (stateSpace.kind === 'field') {
    throw new Error('A formal field runtime returned no field trajectory.');
  }
  const formalDimension =
    stateSpace.kind === 'finite-configurations' ? stateSpace.siteCount : stateSpace.dimension;
  const formalCoordinateIds = stateSpace.coordinates.map((coordinate) => coordinate.id);
  const fallbackStateSeries = display.series.slice(0, formalDimension);
  if (display.numerical?.state && display.numerical.state.shape[1] !== formalDimension) {
    throw new Error(
      `Runtime state dimension ${display.numerical.state.shape[1]} does not match formal dimension ${formalDimension}.`,
    );
  }
  if (!display.numerical?.state && fallbackStateSeries.length !== formalDimension) {
    throw new Error(
      `Runtime exposed ${fallbackStateSeries.length} state coordinates; formal class declares ${formalDimension}.`,
    );
  }
  const stateCoordinateIds =
    display.numerical?.state?.coordinateIds ?? fallbackStateSeries.map((series) => series.id);
  if (
    stateCoordinateIds.length !== formalDimension ||
    new Set(stateCoordinateIds).size !== stateCoordinateIds.length
  ) {
    throw new Error(
      `Runtime state coordinate ids do not uniquely describe formal dimension ${formalDimension}.`,
    );
  }
  if (
    formalCoordinateIds.length !== formalDimension ||
    formalCoordinateIds.some((id, index) => id !== stateCoordinateIds[index])
  ) {
    throw new Error(
      `Runtime state coordinates [${stateCoordinateIds.join(', ')}] do not match formal coordinates [${formalCoordinateIds.join(', ')}].`,
    );
  }
  return {
    kind: 'trajectory',
    times: [...display.times],
    state:
      display.numerical?.state?.values ??
      display.times.flatMap((_time, timeIndex) =>
        fallbackStateSeries.map((series) => {
          const value = series.values[timeIndex];
          if (value === undefined)
            throw new Error(`State series ${series.id} is missing sample ${timeIndex}.`);
          return value;
        }),
      ),
    stateShape: display.numerical?.state?.shape ?? [display.times.length, formalDimension],
    stateCoordinateIds,
    observables,
  };
}

function regimeFor(
  portrait: PortraitManifestExtension,
  values: Record<string, number>,
): { id: string; reviewed: boolean } {
  const matching = portrait.parameterRegimes.find((regime) =>
    Object.entries(regime.parameterDomain).every(([id, [minimum, maximum]]) => {
      const value = values[id];
      return value !== undefined && value >= minimum && value <= maximum;
    }),
  );
  return matching
    ? { id: matching.id, reviewed: true }
    : { id: 'custom-unreviewed', reviewed: false };
}

function maturityFrom(
  portrait: PortraitManifestExtension,
  checks: RunCheckResult[],
  reviewedRegime: boolean,
): Maturity {
  if (portrait.science.representation === 'illustrative-surrogate') return 'M0';
  if (checks.some((check) => check.severity === 'hard' && check.status !== 'passed')) return 'M0';
  let attained: Maturity = 'M1';
  const claimRequirements = portrait.science.validations.filter((id) => !baseCheckIds.has(id));
  const allClaimChecksPass = claimRequirements.every(
    (id) => checks.find((check) => check.id === id)?.status === 'passed',
  );
  if (reviewedRegime && claimRequirements.length > 0 && allClaimChecksPass) attained = 'M2';
  if (
    attained === 'M2' &&
    portrait.science.validations.includes('reference-statistic') &&
    checks.find((check) => check.id === 'reference-statistic')?.status === 'passed'
  ) {
    attained = 'M3';
  }
  const cap = maturityOrder.indexOf(portrait.science.reviewedMaturity);
  return maturityOrder[Math.min(maturityOrder.indexOf(attained), cap)] ?? 'M0';
}

function portraitFrom(
  work: WorkManifest,
  extension: PortraitManifestExtension,
  identity: RunIdentity,
  checks: RunCheckResult[],
  analyzedObjects: DynamicalPortrait['objects'],
): DynamicalPortrait {
  const regime = regimeFor(extension, identity.resolvedParameters);
  const claim =
    extension.primaryClaims.find((candidate) => candidate.appliesToRegimeIds.includes(regime.id)) ??
    extension.primaryClaims[0];
  if (!claim) throw new Error(`Work ${work.slug} has no primary scientific claim.`);
  const primaryObjectId = `${work.slug}-primary-object`;
  return {
    runId: identity.runId,
    inputHash: identity.inputHash,
    regimeId: regime.id,
    primaryClaimId: regime.reviewed ? claim.id : `${work.slug}-custom-unreviewed-claim`,
    primaryObjectId,
    maturityAssessment: {
      attained: maturityFrom(extension, checks, regime.reviewed),
      derivedFromCheckIds: checks
        .filter((check) => check.status === 'passed')
        .map((check) => check.id),
      reviewed: regime.reviewed,
    },
    objects: [
      {
        id: primaryObjectId,
        kind: claim.objectKind,
        dataRefs: claim.observableIds,
        evidenceCheckIds: checks
          .filter((check) => check.status === 'passed')
          .map((check) => check.id),
        limitations: regime.reviewed
          ? claim.limitations
          : [...claim.limitations, 'Current parameters are outside the reviewed preset regimes.'],
      },
      ...analyzedObjects,
    ],
  };
}

function failureKind(
  message: string,
): Extract<WorkRunResult, { status: 'invalid' }>['failure']['kind'] {
  if (/dimension|missing state/i.test(message)) return 'dimension-mismatch';
  if (/runtime|kernel/i.test(message)) return 'runtime-mismatch';
  if (/non-finite|NaN|Infinity/i.test(message)) return 'non-finite';
  if (/event/i.test(message)) return 'event-failure';
  return 'hard-constraint-violation';
}

export function executeWork(
  work: WorkManifest,
  overrides: Record<string, number>,
  requestId = 'direct',
): WorkExecution {
  const extension = portraitFor(work);
  let resolvedParameters: Record<string, number>;
  try {
    resolvedParameters = resolveParameters(work, overrides);
  } catch (error) {
    resolvedParameters = Object.fromEntries(work.parameters.map((item) => [item.id, item.default]));
    const identity = identityFor(work, extension, resolvedParameters, requestId);
    const message = error instanceof Error ? error.message : 'Invalid parameter input.';
    return {
      display: null,
      run: {
        status: 'invalid',
        identity,
        provenance: provenanceFor(extension, work.duration),
        failure: { kind: 'hard-constraint-violation', message },
      },
    };
  }
  const identity = identityFor(work, extension, resolvedParameters, requestId);
  try {
    const display = simulateWork(work, resolvedParameters);
    const replay = simulateWork(work, resolvedParameters);
    const deterministicReplayPassed = replayEqual(display, replay);
    const payload = payloadFor(display, extension);
    if (
      (extension.runtime.output === 'trajectory' && payload.kind !== 'trajectory') ||
      (extension.runtime.output === 'field-trajectory' && payload.kind !== 'field-trajectory') ||
      (extension.runtime.output === 'ensemble' && payload.kind !== 'ensemble')
    ) {
      throw new Error(
        `Runtime output ${extension.runtime.output} does not match payload ${payload.kind}.`,
      );
    }
    const analysis = runOptionalAnalyzers(payload, extension);
    const checks = completeDeclaredChecks(extension, [
      ...genericChecks(work, display, deterministicReplayPassed),
      ...(display.numerical?.checks ?? []),
      ...analysis.checks,
    ]);
    const failedHard = checks.find(
      (check) => check.severity === 'hard' && check.status !== 'passed',
    );
    if (failedHard) throw new Error(failedHard.message);
    const portrait = portraitFrom(work, extension, identity, checks, analysis.objects);
    return {
      display,
      run: {
        status: 'valid',
        identity,
        payload,
        provenance: provenanceFor(extension, display.duration, display),
        hardChecks: checks.filter((check) => check.severity === 'hard'),
        claimAssessments: checks.filter((check) => check.severity === 'claim'),
        portrait,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown simulation failure.';
    return {
      display: null,
      run: {
        status: 'invalid',
        identity,
        provenance: provenanceFor(extension, work.duration),
        failure: { kind: failureKind(message), message },
      },
    };
  }
}
