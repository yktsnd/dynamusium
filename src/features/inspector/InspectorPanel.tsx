import { useId } from 'react';
import { ChevronDownIcon } from '../../design-system/icons/index.tsx';
import { PROFILE_KIND_LABELS, profileFields } from '../../model/input-profiles.ts';
import type { InputProfile, ParameterDef } from '../../model/schema.ts';
import { useSimulationStore } from '../../state/simulation-store.ts';
import './inspector.css';

interface NumericRowProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  testId: string;
}

/** One label + range + number row, shared by the rate constant and feed profile sections. */
function NumericRow({ label, unit, value, min, max, step, onChange, testId }: NumericRowProps) {
  const inputId = useId();
  return (
    <div className="inspector-row">
      <label htmlFor={inputId} className="inspector-row-label">
        {label} <span className="inspector-row-unit">({unit})</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        id={inputId}
        type="number"
        className="inspector-row-number t-num"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * Collapsible "Parameters" panel: rate constants and feed profile controls.
 * Collapsed by default (progressive disclosure) — visual state only, all
 * numerical truth stays in the simulation store's trajectory.
 */
export function InspectorPanel() {
  const model = useSimulationStore((s) => s.model);
  const params = useSimulationStore((s) => s.params);
  const profile = useSimulationStore((s) => s.profile);
  const inspectorOpen = useSimulationStore((s) => s.inspectorOpen);
  const { setParam, setProfileKind, setProfileField, resetToPresetDefaults, setInspectorOpen } =
    useSimulationStore.getState();

  const fields = profileFields(profile.kind, {
    rate: `${model.quantityUnit}/${model.timeUnit}`,
    time: model.timeUnit,
  });
  const profileRecord = profile as Record<string, unknown>;

  return (
    <div className="inspector" data-testid="inspector-panel">
      <button
        type="button"
        className="inspector-toggle"
        aria-expanded={inspectorOpen}
        data-testid="inspector-toggle"
        onClick={() => setInspectorOpen(!inspectorOpen)}
      >
        <span className="t-label">Parameters</span>
        <span className={`inspector-chevron${inspectorOpen ? ' is-open' : ''}`}>
          <ChevronDownIcon />
        </span>
      </button>

      {inspectorOpen && (
        <div className="inspector-body">
          <section className="inspector-section">
            <h3 className="t-label">Rate constants</h3>
            {model.parameters.map((def: ParameterDef) => (
              <NumericRow
                key={def.id}
                label={def.label}
                unit={def.unit}
                value={params[def.id]}
                min={def.min}
                max={def.max}
                step={def.step}
                onChange={(value) => setParam(def.id, value)}
                testId={`param-${def.id}`}
              />
            ))}
          </section>

          <section className="inspector-section">
            <h3 className="t-label">Feed profile</h3>
            <label className="inspector-select-row">
              <span>Profile shape</span>
              <select
                data-testid="profile-kind"
                value={profile.kind}
                onChange={(e) => setProfileKind(e.target.value as InputProfile['kind'])}
              >
                {(Object.entries(PROFILE_KIND_LABELS) as [InputProfile['kind'], string][]).map(
                  ([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            {fields.map((field) => (
              <NumericRow
                key={field.key}
                label={field.label}
                unit={field.unit}
                value={profileRecord[field.key] as number}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(value) => setProfileField(field.key, value)}
                testId={`profile-${field.key}`}
              />
            ))}
          </section>

          <div className="inspector-footer">
            <button
              type="button"
              className="btn"
              data-testid="reset-defaults"
              onClick={resetToPresetDefaults}
            >
              Reset preset defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
