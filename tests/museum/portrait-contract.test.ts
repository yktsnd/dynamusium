import { describe, expect, it } from 'vitest';
import { sha256 } from '../../src/museum/canonical-hash.ts';
import { works } from '../../src/museum/catalog.ts';
import { executeWork } from '../../src/museum/execute-work.ts';
import { portraitDefinitions } from '../../src/museum/portrait-registry.ts';
import { validatePortraitExtension } from '../../src/museum/portrait-validation.ts';

describe('Dynamical Portrait contract', () => {
  it('uses a standards-compatible SHA-256 provenance hash', () => {
    expect(sha256('abc').value).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('migrates all thirty permanent works to reviewed v2 definitions', () => {
    expect(works).toHaveLength(30);
    expect(Object.keys(portraitDefinitions)).toHaveLength(30);
    for (const work of works) {
      expect(work.schemaVersion, work.slug).toBe(2);
      if (work.schemaVersion !== 2) throw new Error(`${work.slug} was not migrated.`);
      expect(work.portrait.runtime.kernel).toBe(work.kernel);
      expect(work.portrait.primaryClaims).toHaveLength(1);
      expect(work.portrait.parameterRegimes).toHaveLength(work.presets.length);
      expect(work.portrait.visualMappings.length).toBeGreaterThan(0);
      expect(work.portrait.composition.layerIds).toEqual(
        work.portrait.visualMappings.map((layer) => layer.id),
      );
      expect(validatePortraitExtension(work.portrait), work.slug).toEqual([]);
    }
  });

  it('prevents composition from inventing or rebinding scientific layers', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz || lorenz.schemaVersion !== 2) throw new Error('Lorenz portrait missing.');
    const altered = structuredClone(lorenz.portrait);
    altered.composition.layerIds.push('decorative-data-layer');
    expect(validatePortraitExtension(altered)).toContainEqual({
      path: '/composition/layerIds',
      message: 'unknown semantic layer decorative-data-layer',
    });
  });

  it('rejects a visual channel that changes the scientific meaning of a mark', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz || lorenz.schemaVersion !== 2) throw new Error('Lorenz portrait missing.');
    const altered = structuredClone(lorenz.portrait);
    altered.visualMappings[0]?.bindings.push({
      quantityRef: 'x',
      channel: 'event-frequency',
      scale: 'linear',
      domain: [0, 1],
      outOfDomain: 'overflow-indicator',
    });
    expect(
      validatePortraitExtension(altered).some((issue) => issue.message.includes('not meaningful')),
    ).toBe(true);
  });

  it('binds identical resolved inputs to a stable scientific identity', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz) throw new Error('Lorenz work missing.');
    const first = executeWork(lorenz, {}, 'request-a');
    const second = executeWork(lorenz, {}, 'request-b');
    expect(first.run.status).toBe('valid');
    expect(second.run.status).toBe('valid');
    expect(first.run.identity.inputHash).toEqual(second.run.identity.inputHash);
    expect(first.display).toEqual(second.display);
  });

  it('returns a typed invalid result instead of executing out-of-range inputs', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz) throw new Error('Lorenz work missing.');
    const execution = executeWork(lorenz, { rho: Number.NaN }, 'bad-input');
    expect(execution.display).toBeNull();
    expect(execution.run.status).toBe('invalid');
    if (execution.run.status !== 'invalid') throw new Error('Expected invalid run.');
    expect(execution.run.failure.kind).toBe('hard-constraint-violation');
    expect(execution.run.failure.message).toContain('finite');
  });

  it('does not award a reviewed regime to arbitrary slider values', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz) throw new Error('Lorenz work missing.');
    const execution = executeWork(lorenz, { rho: 27.125 }, 'custom');
    expect(execution.run.status).toBe('valid');
    if (execution.run.status !== 'valid') throw new Error('Expected valid run.');
    expect(execution.run.portrait.regimeId).toBe('custom-unreviewed');
    expect(execution.run.portrait.maturityAssessment.reviewed).toBe(false);
  });

  it('reports a declared validation that the execution profile omitted as not-run', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz || lorenz.schemaVersion !== 2) throw new Error('Lorenz portrait missing.');
    const altered = structuredClone(lorenz);
    altered.portrait.science.validations.push('cfl-condition');

    const execution = executeWork(altered, {}, 'missing-declared-validation');
    expect(execution.run.status).toBe('valid');
    if (execution.run.status !== 'valid') throw new Error(execution.run.failure.message);
    expect(execution.run.claimAssessments).toContainEqual(
      expect.objectContaining({ id: 'cfl-condition', status: 'not-run', severity: 'claim' }),
    );
  });

  it('requires a declared, passing reference statistic before awarding M3', () => {
    const kepler = works.find((work) => work.kernel === 'kepler');
    if (!kepler || kepler.schemaVersion !== 2) throw new Error('Kepler portrait missing.');
    const withReference = structuredClone(kepler);
    withReference.portrait.science.reviewedMaturity = 'M3';
    withReference.portrait.primaryClaims.forEach((claim) => {
      claim.targetMaturity = 'M3';
    });

    const reviewed = executeWork(withReference, {}, 'm3-with-reference');
    expect(reviewed.run.status).toBe('valid');
    if (reviewed.run.status !== 'valid') throw new Error(reviewed.run.failure.message);
    expect(reviewed.run.portrait.maturityAssessment.attained).toBe('M3');

    const undeclaredReference = structuredClone(withReference);
    undeclaredReference.portrait.science.validations =
      undeclaredReference.portrait.science.validations.filter(
        (requirement) => requirement !== 'reference-statistic',
      );
    const notReviewed = executeWork(undeclaredReference, {}, 'm3-without-declaration');
    expect(notReviewed.run.status).toBe('valid');
    if (notReviewed.run.status !== 'valid') throw new Error(notReviewed.run.failure.message);
    expect(notReviewed.run.portrait.maturityAssessment.attained).toBe('M2');
  });

  it('requires exactly one uniquely identified primary claim for each reviewed regime', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz || lorenz.schemaVersion !== 2) throw new Error('Lorenz portrait missing.');
    const regimeId = lorenz.portrait.parameterRegimes[0]?.id;
    const primaryClaim = lorenz.portrait.primaryClaims[0];
    if (!regimeId || !primaryClaim) throw new Error('Lorenz claim coverage missing.');

    const overlapping = structuredClone(lorenz.portrait);
    overlapping.primaryClaims.push({
      ...structuredClone(primaryClaim),
      id: `${primaryClaim.id}-overlap`,
      appliesToRegimeIds: [regimeId],
    });
    expect(validatePortraitExtension(overlapping)).toContainEqual({
      path: '/primaryClaims',
      message: `reviewed regime ${regimeId} must have exactly one primary claim; found 2`,
    });

    const uncovered = structuredClone(lorenz.portrait);
    uncovered.primaryClaims[0]!.appliesToRegimeIds =
      uncovered.primaryClaims[0]!.appliesToRegimeIds.filter((id) => id !== regimeId);
    expect(validatePortraitExtension(uncovered)).toContainEqual({
      path: '/primaryClaims',
      message: `reviewed regime ${regimeId} must have exactly one primary claim; found 0`,
    });

    const duplicateId = structuredClone(overlapping);
    duplicateId.primaryClaims[1]!.id = primaryClaim.id;
    expect(validatePortraitExtension(duplicateId)).toContainEqual({
      path: '/primaryClaims/1/id',
      message: `duplicate claim id ${primaryClaim.id}`,
    });
  });

  it('invalidates a runtime whose declared output kind disagrees with its payload', () => {
    const lorenz = works.find((work) => work.kernel === 'lorenz');
    if (!lorenz || lorenz.schemaVersion !== 2) throw new Error('Lorenz portrait missing.');
    const altered = structuredClone(lorenz);
    altered.portrait.runtime.output = 'ensemble';

    const execution = executeWork(altered, {}, 'runtime-output-mismatch');
    expect(execution.display).toBeNull();
    expect(execution.run.status).toBe('invalid');
    if (execution.run.status !== 'invalid') throw new Error('Expected invalid execution.');
    expect(execution.run.failure.kind).toBe('runtime-mismatch');
    expect(execution.run.failure.message).toContain('does not match payload');
  });

  it('resolves every permanent work state and primary-object data reference', () => {
    const issues: string[] = [];
    for (const work of works) {
      const execution = executeWork(work, {}, `portrait-inventory-${work.slug}`);
      if (execution.run.status === 'invalid') {
        issues.push(`${work.slug}: invalid: ${execution.run.failure.message}`);
        continue;
      }
      const { payload, portrait } = execution.run;
      const replayCheck = execution.run.hardChecks.find(
        (check) => check.id === 'deterministic-replay',
      );
      if (replayCheck?.status !== 'passed') {
        issues.push(`${work.slug}: complete payload replay was not verified`);
      } else if (!replayCheck.message.includes('complete WorkResult exactly')) {
        issues.push(`${work.slug}: replay check does not describe an exact full-result comparison`);
      }
      const available = new Set(payload.observables.map((observable) => observable.id));
      if (payload.kind === 'trajectory') {
        for (const id of payload.stateCoordinateIds ?? []) available.add(id);
        if (!payload.state || !payload.stateShape || !payload.stateCoordinateIds) {
          issues.push(`${work.slug}: trajectory omits raw state metadata`);
        } else if (
          payload.state.length !== payload.stateShape[0] * payload.stateShape[1] ||
          payload.stateCoordinateIds.length !== payload.stateShape[1]
        ) {
          issues.push(`${work.slug}: raw state shape is inconsistent`);
        }
      } else if (payload.kind === 'field-trajectory') {
        for (const frame of payload.frames) {
          for (const componentId of Object.keys(frame.components)) available.add(componentId);
          for (const [componentId, values] of Object.entries(frame.components)) {
            if (values.length !== frame.shape[0] * frame.shape[1]) {
              issues.push(`${work.slug}: field component ${componentId} has the wrong shape`);
            }
          }
        }
        if (work.schemaVersion === 2 && work.portrait.formal.stateSpace.kind === 'field') {
          const formalField = work.portrait.formal.stateSpace;
          for (const component of formalField.components) {
            if (!available.has(component.id)) {
              issues.push(`${work.slug}: missing formal field component ${component.id}`);
            }
          }
          for (const frame of payload.frames) {
            const nontrivialAxes = frame.shape.filter((extent) => extent > 1).length;
            if (nontrivialAxes !== formalField.domainDimension) {
              issues.push(
                `${work.slug}: frame shape ${frame.shape.join('×')} contradicts ${formalField.domainDimension}D formal domain`,
              );
              break;
            }
          }
        }
      }
      const primary = portrait.objects.find((object) => object.id === portrait.primaryObjectId);
      if (!primary) {
        issues.push(`${work.slug}: primary object is missing`);
        continue;
      }
      for (const dataRef of primary.dataRefs) {
        if (!available.has(dataRef)) issues.push(`${work.slug}: unresolved dataRef ${dataRef}`);
      }
      if (work.schemaVersion === 2) {
        for (const layer of work.portrait.visualMappings) {
          for (const binding of layer.bindings) {
            if (!available.has(binding.quantityRef)) {
              issues.push(
                `${work.slug}: visual layer ${layer.id} has unresolved quantityRef ${binding.quantityRef}`,
              );
            }
            if (binding.uncertaintyRef && !available.has(binding.uncertaintyRef)) {
              issues.push(
                `${work.slug}: visual layer ${layer.id} has unresolved uncertaintyRef ${binding.uncertaintyRef}`,
              );
            }
            if (binding.eventAccumulatorRef && !available.has(binding.eventAccumulatorRef)) {
              issues.push(
                `${work.slug}: visual layer ${layer.id} has unresolved eventAccumulatorRef ${binding.eventAccumulatorRef}`,
              );
            }
          }
        }
      }
    }
    expect(issues).toEqual([]);
  }, 60_000);
});
