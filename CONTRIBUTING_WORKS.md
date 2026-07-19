# Contributing a DynaMusium work

A work is accepted when it is scientifically sourced, reproducible, meaningfully interactive,
and legible in Observe and Study. A static card, screenshot, unimplemented manifest, or unlabeled
equation-like texture is not a completed scientific work.

The preferred contribution format is a version-2 Dynamical Portrait manifest. Version 1 remains a
strict compatibility contract, but its adapter works only when the named kernel already has a
reviewed portrait definition. It never infers new scientific meaning, so new work must use v2.

## Fast path

1. Run `npm run work:new -- <slug> "<Title>"`.
2. Replace the scaffold law, formal class, state coordinates, units, parameters, regimes, and
   primary claim with the actual model.
3. Set the honest representation: governing-law execution, closed form, reduced model,
   data-derived, or illustrative surrogate.
4. Add a canonical or primary HTTPS citation and original explanatory copy.
5. Implement and register the named kernel. A kernel returns numerical state, observables,
   provenance, and checks; it never returns SVG, canvas, or screen geometry.
6. Implement the claim-specific validation declared by the manifest.
7. Review each semantic visual binding and its fixed domain, overflow behavior, projection, and
   reduced-motion alternative.
8. Run `npm run work:validate`, `npm run check`, and `npm run test:e2e`.

The scaffold deliberately starts at `M0`. A manifest cannot promote itself by changing the label:
attained maturity is computed from the active reviewed regime and passing evidence, capped by the
reviewed maturity.

## Version-2 manifest contract

`src/works/work-v2.schema.json` is strict at every object boundary. It is checked by the same
validator during CLI validation and production discovery. In addition to the curatorial metadata,
parameters, presets, equation, and citations, complete these sections.

### Formal class and definition

- `formal.character`: deterministic, stochastic, hybrid, or stochastic-hybrid.
- `formal.stateSpace`: Euclidean, field, product, or finite configurations, with coordinate IDs,
  labels, and units.
- `formal.evolution`: continuous flow / semiflow / process, discrete map, or Markov chain. State
  whether a continuous law is autonomous.
- `definition`: a stable law reference, explanation, and canonical SHA-256 hash.
- `runtime`: the same definition and kernel identity, a compatible runtime kind, execution profile,
  and trajectory / field-trajectory / ensemble output.

The definition reference must agree across the formal evolution, definition, and runtime. The
portrait kernel must match the top-level registered kernel. State dimension must match the listed
coordinates and, for product spaces, the listed factors.

`formal.character: hybrid` and `runtime.kind: hybrid` are reserved tags, not a complete hybrid
automaton schema. The current v2 contract has no guard / reset / event-priority fields and no
permanent hybrid executor. A hybrid contribution therefore needs a versioned contract extension;
do not hide jumps inside an ODE renderer. The same review requirement applies to the currently
reserved ensemble payload path.

### Reviewed parameter regimes

Each regime declares:

- a stable ID;
- the preset IDs reviewed inside it;
- a parameter-domain box within the public control bounds;
- a short note describing the scope of review.

Do not use one broad range to imply that every behavior inside it has been validated. Parameters
outside all reviewed regimes are calculated as `custom-unreviewed` and do not inherit a reviewed
claim.

### One primary scientific truth

Each `PrimaryClaimSpec` states one central truth for one or more regimes:

- the scientific object kind;
- exact observable IDs supporting it;
- a falsifiable statement;
- limitations and non-claims;
- the target maturity.

Prefer “a finite post-transient orbit segment returns near two lobes under this preset” over “this
is chaos.” Prefer “a finite seeded Metropolis chain samples configurations after the declared
burn-in” over “time evolution of a magnet.” A finite histogram is not automatically an invariant
measure; a DMD fit is not automatically a Koopman eigenfunction; a finite box graph is not an exact
Conley decomposition.

### Representation and maturity

Representation records what the software actually executes:

| Value                     | Required wording and evidence                                       |
| ------------------------- | ------------------------------------------------------------------- |
| `governing-law-execution` | The declared evolution law is advanced by the named method.         |
| `closed-form-solution`    | State the exact solution family and any sampled / truncated domain. |
| `reduced-model`           | State the reduction, assumptions, and effective units / time.       |
| `data-derived`            | Identify data, license, estimator, split, and residual.             |
| `illustrative-surrogate`  | Explicitly deny that the image is a solution; maturity remains M0.  |

Maturity is cumulative:

- `M0`: unvalidated or illustrative;
- `M1`: law / state / units / observables agree, and hard failures are visible;
- `M2`: a reviewed regime has at least one claim check and every declared claim check passes;
- `M3`: M2 plus a declared reference trajectory, invariant, benchmark, or statistic;
- `M4`: rigorous enclosure or computer-assisted proof. The type reserves this level, but the
  current assessor does not award it; a future rigorous-artifact review contract is required.

Use the lowest honest reviewed cap. A valid calculation and a validated scientific claim are
different decisions.

### Validation and numerical provenance

Every new work must declare the common checks appropriate to its runtime and the checks needed by
its primary claim. Examples include finite output, dimension consistency, deterministic or seeded
replay, step halving, grid refinement, positivity, mass / energy residual, equilibrium residual,
order-parameter bounds, CFL, boundary residual, and a reference statistic.

Provenance must make the result reproducible:

- kernel and definition identity;
- method, implementation version, precision, step or iterations;
- scientific interval and initial condition;
- field shape, spacing, and boundary conditions where relevant;
- random algorithm, version, seed, burn-in / sample schedule, and ensemble size where relevant.

Never silently replace `NaN`, infinity, missing components, divergence, collision, forbidden
events, or constraint violations. Return a typed invalid result. Visual clipping must not alter the
stored number and must show its declared overflow indicator.

### Optional advanced-analysis artifacts

`src/museum/advanced-analyzers.ts` provides bounded authoring / build-time helpers. Their reports
may accompany a pull request as scientific evidence, but they do not promote maturity by
themselves. The strict v2 manifest has no generic analyzer-artifact field: keep the report in the
review material or a separately versioned, tracked artifact instead of adding unknown manifest
properties. Record the input, analyzer version, options, result status, and all returned
limitations. An input that is not reproducible from the reviewed manifest, kernel, parameters, and
seed also needs its source, license / version where applicable, and lowercase SHA-256 content hash.
In addition:

| Analysis                      | Evidence required with the submission                                                                                                                                                                                                                                                                                       | Maximum claim without separate proof                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pseudo-arclength continuation | Seed and parameter direction; accepted and rejected steps; equilibrium and pseudo-arclength residuals; Jacobian source, conditioning, stability status / residual, and tolerances                                                                                                                                           | A finite-precision branch segment and possible **fold candidate**, not validated continuation, a proved equilibrium branch, or a proved bifurcation |
| EDMD                          | Snapshot source (and hash when external); observable IDs / units and sample interval; chronological training / holdout ranges; every dictionary term's ID, definition, and source; ridge and rank tolerances; numerical rank / conditioning; training and holdout residuals; mode residuals and principal-branch convention | A dictionary- and data-dependent finite EDMD fit, not a complete Koopman spectrum or a proved Koopman eigenfunction                                 |
| Finite-grid H0                | Scalar-field source (and hash when supplied as an external grid); shape / resolution; filtration, connectivity, boundary rule, and persistence threshold; returned pairs and limitations                                                                                                                                    | H0 persistence exact for the supplied finite grid only, not continuum topology, higher homology, or a Morse–Smale complex                           |
| Finite transition enclosure   | Cells, edges, neighborhood and boundary; evidence kind; source reference plus lowercase 64-hex SHA-256 content hash; sampling interval or interval method and caller coverage flag; invariant / recurrent / exit cells and finite Morse graph                                                                               | A sampled graph or caller-attested finite relation; sampled transitions never establish isolation or a Conley index                                 |

`established-for-finite-enclosure` is available only for caller-supplied interval evidence marked as
coverage-verified whose computed invariant cells avoid the declared boundary. The generic analyzer
does not construct or verify that enclosure. A Conley index may be reported only as
`externally-certified`, with a separately verified index-pair certificate recording method,
coefficient field, homology ranks, source reference, and its own lowercase SHA-256 content hash.
The analyzer checks only that this metadata and the finite relation are structurally well-formed;
it does not construct or verify the interval enclosure or prove the certificate.

Do not shorten these qualifications in gallery copy, badges, screenshots, or pull-request titles.
Terms such as “validated branch”, “Koopman eigenfunction / spectrum”, or “Conley index” require the
corresponding per-work, externally reviewed artifact and must state exactly what that artifact
establishes.

## Runtime boundary

The top-level compatibility dispatcher remains versioned:

- `reaction-network-v1`: driven first-order conversion networks;
- `ode-v1`: continuous finite-dimensional state;
- `field-v1`: one- or two-dimensional field state;
- `discrete-v1`: maps, finite configurations, and seeded samplers;
- `analytic-v1`: closed-form state or observation curves.

The portrait's runtime kind adds scientific intent (`ode`, `map`, `field`, `stochastic`, `hybrid`,
`analytic`, or `surrogate`). The two declarations must be compatible and the kernel must be present
in the typed runtime registry.

Identical manifest, parameters, preset, execution profile, and seed must identify the same input.
Changing playback speed or Exhibit dwell must not change the solution. Scientific sample time must
come from the kernel; a spatial row or column may never be reused as a time axis.

## Scientific objects before visual mappings

The required direction is:

```text
numerical state and observables
  -> evidence-backed scientific objects
  -> reviewed semantic visual mappings
  -> artistic composition
```

Do not let a model return renderer geometry. A semantic layer names its object and regime, mark,
quantity-to-channel bindings, scale, domain, units, out-of-domain policy, optional projection,
scientific-time behavior, and reduced-motion strategy.

The binding is a scientific review surface. Examples:

- amount -> fill area;
- flux magnitude -> square-root stroke width and integrated event frequency;
- oscillator phase -> cyclic position and order-vector direction;
- field component -> a declared sequential or diverging raster domain;
- selected state coordinates -> path position;
- empirical occupancy -> density, explicitly qualified as finite sampling.

For `event-frequency`, declare both a positive `eventQuantum` and the kernel-produced cumulative
`eventAccumulatorRef`. Renderer code may place events from that accumulator; it may not integrate
an instantaneous rate or invent event timing in React.

Color may not be the only carrier. High-dimensional models require a justified projection, not
automatic 3D. Avoid showing every variable when it dilutes the primary truth.

## Composition boundary

Composition may arrange approved layer IDs, select a focal layer, set bounded negative space, and
choose no camera or a bounded slow camera. The strict version-2 manifest also names an atmosphere
asset that must be explicitly non-semantic and `aria-hidden`; a work may use the shared neutral
museum atmosphere. Renderers may set typography, texture, light, spacing, and Exhibit pacing.

Composition cannot change quantity references, channels, scales, domains, zero, direction,
projection, uncertainty, scientific time, or event order. It cannot fabricate a missing object or
make atmosphere look like data. A request to change a semantic binding requires scientific review
and a versioned manifest change.

No proprietary authoring tool is required or privileged. Fable is optional and has no runtime,
schema, or review authority; the same rule applies to any renderer, design tool, or hand-authored
composition.

## Curatorial contract

- The title names a recognized model, not a marketing theme.
- The subtitle adds an observation, not a second title.
- The question tells the visitor what to look for.
- Parameters cross a meaningful regime or threshold without exceeding the reviewed domain.
- Citations support the implemented equation, reduction, sampler, or canonical interpretation.
- Copy is original; do not paste textbook or paper prose.
- Images, datasets, and recordings include source, license, version, and content hash.
- One work selects one primary scientific truth and remains stable under long viewing.
- Observe centers the phenomenon; Study exposes evidence; Exhibit changes pacing, not meaning.

## Review and pull-request evidence

Scientific and composition approval are separate:

- **scientific review** checks the equation, representation, formal class, parameters, provenance,
  numerical method, evidence, maturity, observable IDs, and semantic bindings;
- **composition / accessibility review** checks hierarchy, typography, camera, atmosphere,
  overflow, reduced motion, keyboard use, narrow layout, and the preservation of approved meaning.

Include in the pull request:

- work slug and primary claim;
- representation and requested maturity;
- exact validation commands and model-specific checks run;
- reference source / dataset provenance and licenses;
- screenshots at desktop and 390 px width;
- reduced-motion and keyboard confirmation;
- known limitations and any check reported as `not-run`.

An `M0` work may remain visible only when its representation and limitations are explicit. It must
not borrow the wording or badge of a solver-backed reviewed work.
