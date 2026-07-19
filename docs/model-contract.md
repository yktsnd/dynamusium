# Model contract

DynaMusium has two compatible scientific contracts:

- the museum-wide **Dynamical Portrait** contract in `src/museum/portrait-types.ts`, which covers
  flows, maps, fields, stochastic chains, analytic families, and reduced models, and reserves
  character / runtime tags for hybrid and ensemble extensions;
- the preserved **reaction-network instrument** contract in `src/model/schema.ts` and
  `src/solver/trajectory.ts`, specialized for first-order conversion networks.

Both enforce the same direction of responsibility: model code returns numerical state and
scientific observables, never presentation geometry. Rendering consumes reviewed quantity
references and semantic visual mappings. A UI component may implement an artwork grammar such as
a phase portrait, field raster, oscillator circle, or quantity / flux network, but it may not
reimplement a model equation or silently reinterpret an observable.

## Museum-wide Dynamical Portrait

### Manifest layer

`WorkManifestV2` combines the existing title, gallery, controls, presets, equation, and citations
with a `PortraitManifestExtension`:

```ts
interface PortraitManifestExtension {
  formal: FormalClass;
  definition: {
    definitionRef: string;
    expectedHash: ContentHash;
    explanation: string;
  };
  parameterRegimes: ParameterRegimeSpec[];
  primaryClaims: PrimaryClaimSpec[];
  science: {
    representation: Representation;
    capabilities: PortraitCapability[];
    validations: ValidationRequirementId[];
    reviewedMaturity: Maturity;
  };
  runtime: RuntimeSpec;
  visualMappings: SemanticVisualLayer[];
  composition: CompositionSpec;
}
```

The structure is intentionally finite and practical for the permanent collection. It is not an
ontology of all mathematics.

#### Formal class

`FormalClass` says what evolves and what time means:

- `character`: deterministic, stochastic, hybrid, or stochastic-hybrid;
- `stateSpace`: Euclidean coordinates, a one- or two-dimensional field with boundary condition,
  a Euclidean / circle product, or finite configurations;
- `evolution`: continuous flow / semiflow / process, discrete map, or Markov chain;
- `lawRef`: a stable reference to the implemented mathematical definition.

Continuous and discrete time use distinct tagged types. A stochastic Markov-chain sweep is not
called physical time. Nonautonomous forcing is represented by `process` or `autonomous: false`,
not hidden in a renderer.

The current formal union does **not** yet encode a hybrid automaton's guards, reset maps, or event
priority, and no permanent work uses the `hybrid` runtime. Likewise, `ensemble` is a payload
contract without a shipped permanent-work executor. Those tags prevent incompatible reuse of an
ODE contract; they are not a claim that a complete hybrid / ensemble authoring surface exists.

#### Regimes and claims

A `ParameterRegimeSpec` names a reviewed parameter domain and the presets it contains. A
`PrimaryClaimSpec` selects exactly one central scientific object for those regimes, names the
observables that support it, states limitations, and sets a target maturity. Inputs outside all
domains become `custom-unreviewed`; they can be calculated but cannot inherit a reviewed claim.

#### Representation and maturity

`Representation` distinguishes governing-law execution, closed-form solution, reduced model,
data-derived result, and illustrative surrogate. `Maturity` (`M0`–`M4`) records validation depth.
They are orthogonal: representation says _what was executed_; maturity says _what evidence was
successfully established_. See [architecture.md](./architecture.md#portrait-assembly-and-maturity).

### Numerical result layer

The compatibility `WorkResult` supplies the live museum with `times`, labelled `series`,
state-space `points`, optional field frames, and diagnostics. Reviewed runtimes additionally attach
`numerical.provenance`, `numerical.checks`, time-indexed field frames, and an optional raw,
time-major state:

```ts
interface WorkResult {
  duration: number; // scientific interval end
  presentationDuration?: number; // wall-clock curation only
  times: number[];
  series: Series[];
  points: TrajectoryPoint[]; // state-space projection, never screen coordinates
  field?: FieldFrame;
  diagnostics: string;
  numerical?: {
    provenance: RunProvenance;
    checks: RunCheckResult[];
    fieldFrames?: FieldFrameV2[];
    state?: {
      coordinateIds: string[];
      shape: readonly [number, number];
      values: number[]; // time-major
    };
  };
}
```

`executeWork()` normalizes that compatibility result into `RunPayload`:

- `trajectory`: times, optional state matrix, state shape, and observables;
- `field-trajectory`: true sample times and complete component grids for each frame;
- `ensemble`: weighted member payloads and ensemble observables.

A field frame declares shape, component IDs, coordinate names, and spacing. Its rows and columns
are spatial axes; neither becomes time. Screen-space pixels are produced only later.

### Provenance and valid / invalid result

`RunIdentity` hashes the canonical manifest and resolved scientific inputs. `RunProvenance` names
the kernel, definition hash, execution method, implementation version, precision, interval,
initial condition, optional fixed step / iteration count, grid, boundary conditions, and random
algorithm / seed / sample schedule.

`inputHash` is stable scientific-content identity. `requestId` and the derived `runId` also carry
request-lifecycle identity, so two otherwise identical UI requests need not share a `runId`.
`executeWork()` performs a second complete execution with identical resolved inputs and seed; the
exact `WorkResult` comparison supplies the hard `deterministic-replay` check.

The public result is a discriminated union:

```ts
type WorkRunResult =
  | {
      status: 'valid';
      identity: RunIdentity;
      payload: RunPayload;
      provenance: RunProvenance;
      hardChecks: RunCheckResult[];
      claimAssessments: RunCheckResult[];
      portrait: DynamicalPortrait;
    }
  | {
      status: 'invalid';
      identity: RunIdentity;
      provenance: RunProvenance;
      failure: RunFailure;
      lastAcceptedTime?: number;
    };
```

An invalid result contains no display payload. Non-finite state, divergence, hard-constraint
violation, dimension mismatch, step underflow, event failure, and runtime mismatch remain visible
as failures rather than being replaced with zeros, arbitrary caps, or the previous valid result.

### Scientific objects and analyzers

`DynamicalPortrait` records the active regime, claim, primary object, attained maturity, and the
checks from which it was derived. `ScientificObject` refers only to payload data and evidence IDs;
it does not carry SVG or canvas geometry. Supported object names include orbit segments,
recurrent-set candidates, empirical measures, DMD modes, conservation / flux objects, spatial
fields, interfaces, defects, and coherent structures.

Optional analyzers are conservative:

- occupancy and recurrence are explicitly finite post-transient statistics;
- the object named `set-oriented-morse-graph` is built from strongly connected components of an
  observed 12 x 12 box-transition graph; it is a finite artifact, not a rigorous multivalued
  enclosure, Conley index, or exact Morse decomposition;
- the live spectral adapter uses two observables as an explicit identity dictionary, ridge EDMD,
  and a chronological 30% holdout. Its modes, principal-branch frequency / decay, conditioning,
  and residual are finite dictionary-dependent estimates, not Koopman eigenfunctions or a
  complete / continuous spectrum;
- interface density is a grid estimate, not a Morse–Smale complex or topology proof;
- `persistent-homology` computes H0 lower-star persistence exactly for the supplied finite vertex
  grid. It does not infer loops, voids, continuum persistence, or a Morse–Smale complex.

If input length, capability, conditioning, or evidence is insufficient, the analyzer emits no
promoted object; where applicable it retains a failed evidence check. Rendering must not infer the
missing object.

### Advanced authoring evidence

`src/museum/advanced-analyzers.ts` exposes bounded pure routines for authoring and build-time use.
They do not automatically promote a live work:

- `continueEquilibriumBranch()` performs finite-precision pseudo-arclength continuation for a
  supplied finite-dimensional equilibrium residual. Points retain Newton residuals, Jacobian /
  augmented conditioning, finite-difference provenance where used, stability convergence, and
  rejected-step diagnostics. A tangent reversal creates a `fold-candidate`, not a validated fold
  or bifurcation theorem.
- `analyzeFiniteEdmd()` requires explicit observables and dictionary terms with definition /
  source metadata. It reports the ridge value, training and chronological holdout ranges,
  residuals, conditioning, coefficient-space matrix, and finite EDMD modes.
- `analyzeZeroDimensionalPersistence()` returns H0 pairs exact for the supplied finite grid,
  filtration, connectivity, and boundary convention only.
- `analyzeFiniteTransitionEnclosure()` analyzes a supplied finite relation and returns invariant,
  recurrent, exit, finite Morse-set, and order information. Sampled transitions cannot establish
  isolation or a Conley index. The API labels isolation `established-for-finite-enclosure` only
  when caller metadata marks interval coverage verified and no invariant cell meets the declared
  boundary; this is not independent verification of the enclosure. An index is accepted only from
  a separately supplied external homology certificate marked with a verified index pair. Both the
  finite-relation evidence and certificate require a source reference plus a lowercase 64-hex
  SHA-256 digest; these hashes are preserved in analysis provenance.

A validated continuation branch, true Koopman eigenfunctions or transfer-operator spectrum,
continuum topology / Morse–Smale structure, and computer-assisted proof remain per-work external
artifacts. They require independent source, method, residual / enclosure, certificate, and review
contracts beyond the generic browser foundation.

### Semantic visual mapping and composition

`SemanticVisualLayer` binds a `quantityRef` to a mark, visual channel, scale, fixed domain, unit,
out-of-domain policy, projection, scientific-time behavior, and reduced-motion strategy.
An `event-frequency` binding additionally declares a positive `eventQuantum` and a precomputed
`eventAccumulatorRef`; rendering consumes that cumulative observable and never re-integrates flux.
`CompositionSpec` can order approved layer IDs, choose the focal layer, bound negative space and a
slow camera treatment, and reference non-semantic atmosphere. It has no quantity reference,
transform, or scale field with which to change scientific meaning.

`validatePortraitExtension()` enforces formal-runtime compatibility, definition-hash agreement,
unique regime / claim / layer IDs, one applicable primary claim per reviewed regime, valid
event-binding fields, numeric domains, mark/channel compatibility, composition references,
and the rule that atmosphere is non-semantic and hidden from assistive technology.

Cross-layer contract tests execute every permanent work and additionally verify that state,
observable, field-component, primary-claim, projection, uncertainty, and event-accumulator
references resolve against the actual payload. JSON Schema alone cannot establish that runtime
property.

## Specialized reaction-network contract

The remainder of this document describes the preserved reaction-network instrument. These types
remain authoritative for that runtime, but they are not imposed on unrelated dynamical systems.

### Units and conventions

- Quantities are amounts in the model's `quantityUnit` (e.g. `"mol"`) and are
  never negative.
- Time is in the model's `timeUnit` (e.g. `"s"`).
- Rates are `quantity / time`. For every process, `forward` and `reverse` are
  both `>= 0`; `net = forward - reverse` is signed, and positive means flow
  from the process's `from` side to its `to` side.
- Layout coordinates (`LayoutPoint`) are abstract units in a 100 x 100 design
  space; the network renderer (`src/visualization/network/geometry.ts`) scales
  them into the SVG viewBox.

### Core types (`src/model/schema.ts`)

#### `SpeciesDef`

One state variable rendered as a vessel.

| Field             | Meaning                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable identifier, referenced by processes.                                                                                              |
| `label`           | Full display name.                                                                                                                       |
| `symbol`          | Short symbol shown inside the vessel (e.g. `"A"`).                                                                                       |
| `description`     | One-line explanation.                                                                                                                    |
| `initial`         | Quantity at `t = 0`.                                                                                                                     |
| `displayCapacity` | Display maximum used to scale the vessel fill — **not** a hard physical cap; quantities can exceed it and the fill simply clips at 100%. |
| `colorVar`        | CSS custom property carrying the species' color (e.g. `"--species-a"`).                                                                  |
| `layout`          | `LayoutPoint` position in the 100x100 design space.                                                                                      |

#### `ParameterDef`

A user-adjustable rate constant. `id`, `label`, `unit`, `default`, `min`,
`max`, `step`. The inspector renders one control per `ParameterDef`; values
outside `[min, max]` are clamped (`clampParameterValue`), never allowed to
reach the solver.

#### `InputProfile`

A time-dependent external inflow, evaluated by `evaluateProfile`
(`src/model/input-profiles.ts`). Always evaluates to `>= 0`.

| Kind       | Fields                         | Rate at time `t`                                                     |
| ---------- | ------------------------------ | -------------------------------------------------------------------- |
| `none`     | —                              | `0`                                                                  |
| `constant` | `rate`                         | `max(0, rate)`                                                       |
| `pulse`    | `amplitude`, `center`, `width` | Gaussian: `max(0, amplitude) * exp(-0.5 * ((t - center) / width)^2)` |
| `sine`     | `base`, `amplitude`, `period`  | `max(0, base + amplitude * sin(2π t / period))`                      |

`profileFields()` returns the editable-field metadata (label, unit, min, max,
step) the inspector uses to build controls per kind, and
`PROFILE_KIND_LABELS` names each kind for the profile-kind switcher.

#### `ProcessDef` and rate laws

All processes are **first-order (mass-action)** in this version — this is a
structural property of the current model contract, not just of the shipped
demonstration model.

| Kind         | Fields                                        | Rate law                                                                                                                                                                                |
| ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inflow`     | `to`                                          | `rate(t) = evaluateProfile(profile, t)`, flows from outside the system into `to`.                                                                                                       |
| `conversion` | `from`, `to`, `forwardParam`, `reverseParam?` | `forward = k_f * quantity(from)`; `reverse = k_r * quantity(to)` if `reverseParam` is set, else `reverse = 0` (irreversible). `net = forward - reverse`, positive meaning `from -> to`. |
| `outflow`    | `from`, `rateParam`                           | `rate = k * quantity(from)`, flows from `from` into the reservoir.                                                                                                                      |

##### Reversible-rate representation

Reversibility is encoded by whether a `conversion` process sets
`reverseParam`. There is no separate "reversible" flag — `proc.reverseParam
!== undefined` is the single source of truth, used by both the solver
(`src/model/equations.ts`) and the network geometry (`ChannelGeom.reversible`
in `src/visualization/network/geometry.ts`) to decide whether a channel gets
one lane or two.

#### `ReservoirDef`

The single collected-output basin every model has. `label`, `description`,
`colorVar`, `displayCapacity` (fill scaling, same convention as species),
`layout`.

#### `SimulationConfig`

`duration` (total simulated time span) and `dt` (fixed internal RK4 step),
both in `timeUnit`. Every RK4 step is stored as a frame — there is no
sub-sampling.

#### `ModelDefinition`

The top-level contract object: `id`, `name`, `description`, `timeUnit`,
`quantityUnit`, `species: SpeciesDef[]`, `processes: ProcessDef[]`,
`parameters: ParameterDef[]`, `reservoir: ReservoirDef`,
`config: SimulationConfig`.

#### `ParameterValues`

`Record<ParameterId, number>` — the current value of every parameter,
produced by `defaultParameterValues(model)` and overridden per-preset or by
the inspector.

#### `ProcessRates`

One process's rate decomposition at a moment in time: `{ forward, reverse,
net }`, per the sign convention above.

#### `Frame`

The interpolated state of the whole system at one time point
(`src/solver/trajectory.ts`, `frameAt`): `time`, `quantities: number[]`
(species order matches `model.species`), `reservoir: number` (nondecreasing),
`rates: ProcessRates[]` (process order matches `model.processes`).

### `Trajectory` (`src/solver/trajectory.ts`)

The complete, immutable result of one integration run:

```ts
interface Trajectory {
  duration: number;
  dt: number;
  times: Float64Array; // length N, uniform spacing `dt`
  quantities: Float64Array[]; // per species (model order), length N each
  reservoir: Float64Array; // length N, nondecreasing
  rates: { forward: Float64Array; reverse: Float64Array; net: Float64Array }[]; // per process
}
```

- Uniform time spacing: `times[i] = i * dt`, recomputed from the step index
  rather than accumulated, so there is no floating-point drift.
- Every series is a `Float64Array`, one per species / process, in model
  order.
- `reservoir` is nondecreasing frame-to-frame by construction of the
  integration itself, not by a post-hoc guard: `integrate()` corrects only
  micro-decreases within `NONNEGATIVE_TOLERANCE` and aborts on anything
  larger, so a `Trajectory` that exists is always monotone (see
  [numerical-method.md](./numerical-method.md) and `SimulationResult` below).
- `frameAt(trajectory, t)` linearly interpolates all series to produce a
  `Frame` at an arbitrary `t` (clamped to `[0, duration]`).
- `seriesMax(series)` returns the maximum value across one or more series,
  used to scale chart axes and channel widths.

### `SimulationResult` (`src/solver/simulation-result.ts`)

`integrate()` (`src/solver/integrate.ts`) does not return a bare
`Trajectory` — it returns a `SimulationResult`, a typed union distinguishing
a numerically usable run from one that failed:

```ts
type SimulationResult =
  | { status: 'valid'; trajectory: Trajectory; diagnostics: Diagnostics }
  | { status: 'invalid'; error: NumericalError; diagnostics: Diagnostics };
```

- **`Diagnostics`**: `smallClampCount` (negative excursions within tolerance
  corrected to zero), `reservoirCorrectionCount` (reservoir micro-decreases
  within tolerance corrected), `stepsCompleted` (steps actually integrated —
  equals the configured step count when `status === 'valid'`, and the step
  index reached before failure when `status === 'invalid'`).
- **`NumericalError`**: `kind` (`'negative-quantity' | 'reservoir-decrease' |
'non-finite'`), `message` (human-readable, shown in the UI), `time`, `step`,
  `stateIndex`, `stateId` (species id or `'reservoir'`), `value` (the
  offending value), `tolerance` (the tolerance that was exceeded).

No component or store action may construct a `Trajectory` or treat a
`SimulationResult` as valid without checking `status` — see
[architecture.md](./architecture.md) for how the store and UI consume this
union.

### Extension points

- **A new model**: write a new `ModelDefinition` — see
  `examples/damped-cascade.ts` for a complete second model (a three-stage
  cascade with a reversible holding pair) proving the contract is
  model-agnostic. Nothing in `src/` references that file; nothing in `src/`
  may reference a specific model by id or species name.
- **A new profile kind**: extend the `InputProfile` union in `schema.ts`, add
  its evaluation in `evaluateProfile`, its fields in `profileFields`, and its
  label in `PROFILE_KIND_LABELS`. `setProfileKind`'s default-value map in
  `simulation-store.ts` also needs an entry.
- **What requires code changes, not just a new `ModelDefinition`**:
  - A new rate law (anything beyond first-order mass action, e.g. a rate
    depending on more than one species, or a saturating/nonlinear term)
    requires extending `ProcessDef` and the corresponding term/rate-function
    construction in `src/model/equations.ts`.
  - Non-first-order kinetics generally, for the same reason — `compileSystem`
    currently only builds `k * quantity` and `k_f * q_from - k_r * q_to`
    terms.
  - Branching or non-linear layouts (a species with more than one inbound and
    one outbound lane sharing a row, cycles, junctions) require extending
    `computeGeometry` in `src/visualization/network/geometry.ts`, which
    currently lays out a single left-to-right chain plus one reservoir.
