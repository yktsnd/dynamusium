# DynaMusium architecture

## Product layers

1. **Museum Shell** owns navigation, collection filtering, URL state, Observe / Study / Exhibit,
   responsive layout, and accessibility. It does not calculate model state.
2. **Work manifest** declares curatorial metadata, bounded parameters, reviewed regimes, one
   primary claim per regime, formal evolution, representation, required validation, and citations.
3. **Runtime** executes the governing law, reduced law, closed form, or declared surrogate. A
   kernel returns state-space samples and observables, never SVG paths or screen coordinates.
4. **Run boundary** (`execute-work.ts`) binds the manifest, resolved inputs, definition, execution
   profile, and seed into hashes; it returns a typed valid or invalid result with provenance.
5. **Dynamical Portrait** turns a valid result into scientifically qualified objects and explicit
   evidence. Optional analyzers are capability-gated and return no object when their evidence is
   insufficient.
6. **Semantic visual layers** bind scientific quantity references to reviewed marks, scales,
   domains, projections, out-of-domain behavior, and reduced-motion alternatives.
7. **Composition and rendering** arrange those layers with light, typography, atmosphere,
   negative space, camera, and pacing. Composition cannot rebind a quantity to a different visual
   channel or manufacture scientific data.

The data direction is one-way:

```text
formal system + reviewed regime
  -> raw numerical result + provenance + checks
  -> scientific objects + qualifications
  -> semantic visual layers
  -> Observe / Study / Exhibit composition
```

This division is renderer- and authoring-tool-independent. Fable is not a dependency and is not
assumed by the architecture. A renderer or optional design tool may consume only the safe
composition surface after the semantic mapping has been reviewed.

The older reaction-network model, solver, Zustand store, and SVG network remain tested modules.
They are preserved as a specialized scientific instrument and compatibility reference while the
museum runtime generalizes beyond first-order kinetics. Their quantity / directional-flux visual
language is reused where the scientific object calls for it, rather than forcing every work into a
reaction-network renderer.

## Formal system and representation

`PortraitManifestExtension` is deliberately modest. Its formal layer covers continuous flow or
semiflow, nonautonomous process, discrete map, and Markov chain on Euclidean, product, field, or
finite-configuration state spaces. It records deterministic, stochastic, and hybrid character.
This is a common execution vocabulary, not a complete classification theorem.

Hybrid and ensemble tags are reserved extension points: v2 does not yet encode guard / reset /
event-priority semantics, and no permanent work ships a hybrid or ensemble executor. A future work
that needs either must extend the versioned contract rather than conceal those semantics inside an
ODE or renderer.

The orthogonal `representation` field says what was actually executed:

| Representation            | Meaning                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `governing-law-execution` | The declared governing evolution law is numerically advanced.           |
| `closed-form-solution`    | A stated exact solution family or analytic observation law is sampled.  |
| `reduced-model`           | A declared reduction is executed; claims are limited to that reduction. |
| `data-derived`            | Dynamics or modes are estimated from identified data.                   |
| `illustrative-surrogate`  | A visual proxy is shown and is not called a solution of the equation.   |

Representation is not a quality score. A reduced model can be strongly validated; a governing-law
implementation can still be immature or invalid.

## Registration and discovery

The permanent collection is defined in `src/museum/catalog.ts`; each built-in seed is expanded
through the reviewed portrait registry and validated as version 2. External additions are one JSON
file under `src/works/community/`, dispatched to `work.schema.json` (v1) or
`work-v2.schema.json` (v2), and discovered with `import.meta.glob`. Imported JSON remains
`unknown` until it crosses the shared validator. This keeps a contribution atomic and avoids a
merge-conflict-prone registry of community file paths. Numerical kernels and reviewed built-in
portrait definitions remain explicit typed registries; auto-discovery never makes unknown code
executable.

`WorkManifest` is versioned. Version 2 is validated directly against
`src/works/work-v2.schema.json`; the explicit version-1 adapter can upgrade only a contribution
whose kernel already has a reviewed portrait definition. It does not infer a formal class,
scientific claim, or evidence plan for an unknown v1 kernel. New scaffolds use version 2. A work is
addressable by a unique kebab-case slug and deep-linked with query parameters:

```text
?work=lorenz-atmosphere&mode=study&preset=threshold
```

Query routing is intentional: direct reloads work on GitHub Pages without a server fallback.

## Execution and run identity

`simulateWork()` dispatches only a kernel registered for the manifest's declared runtime and
validates result dimensions and finiteness. `executeWork()` wraps it with the public run contract:

- `RunIdentity` records a request ID, run ID, work slug, resolved parameters, optional preset,
  canonical manifest hash, and input hash.
- `RunProvenance` records the kernel and definition hash, execution method and version, precision,
  interval, initial condition, optional grid / boundary conditions, and stochastic seed schedule.
- `RunPayload` carries a time-major trajectory, a time-indexed field trajectory, or an ensemble.
  Raw state coordinates are distinct from screen geometry.
- `RunCheckResult` separates hard validity checks from claim-level assessments and keeps metrics,
  tolerances, reference IDs, and a human-readable statement.

Identical manifest, resolved parameters, execution profile, and seed define the same scientific
input and `inputHash`; `requestId` remains request-lifecycle identity rather than scientific
content. `executeWork()` repeats the complete kernel call with the same resolved inputs and seed,
and exact equality of the resulting `WorkResult` is a hard `deterministic-replay` check. The worker
associates every response with its request. Loading a new input clears the old display; a late
response is ignored, and a failed run cannot remain visible as if it belonged to the new controls.

The original typed `SimulationResult` contract still governs the specialized reaction-network
solver: negative excursions beyond tolerance, non-finite values, and decreasing cumulative output
abort instead of being clamped away. The museum runtime applies the same principle to every
runtime: non-finite state, dimension mismatch, dispatch mismatch, and failed hard checks produce a
`WorkRunResult` with `status: 'invalid'` and no display payload.

## Portrait assembly and maturity

A valid payload always has a primary object. It receives a reviewed regime claim only when the
resolved parameters match a declared domain. Parameters outside all reviewed regimes receive
`custom-unreviewed`; the raw calculation may remain visible, but it receives no reviewed regime
claim. Live optional analyzers run only when the manifest declares the matching capability:

- finite occupancy / recurrence and observed box-transition SCC artifacts;
- two-observable, identity-dictionary ridge EDMD with a chronological 30% holdout;
- field interface density;
- exact H0 lower-star persistence for the supplied finite field grid. Cahn–Hilliard currently
  opts into this check through `persistent-homology`.

These are explicitly finite-sample or finite-resolution results. The SCC artifact is not a
rigorous Conley enclosure, EDMD is not promoted to a Koopman eigenfunction or complete spectrum,
H0 persistence is not continuum topology, and interface density is not a topology computation.

`src/museum/advanced-analyzers.ts` additionally exports bounded, pure authoring / build-time
foundations:

- finite-precision pseudo-arclength equilibrium continuation with residual, conditioning,
  stability, step-rejection, and fold-candidate evidence;
- ridge EDMD for an explicit sourced dictionary, with chronological holdout and conditioning;
- H0 persistence of a supplied finite rectangular vertex filtration;
- invariant / recurrent / exit cells and finite Morse sets for a supplied finite transition
  enclosure.

Continuation is not run automatically for the permanent collection. A fold is a candidate until a
work-specific analysis establishes the usual non-degeneracy and transversality conditions. The
finite-enclosure analyzer does not create or verify an interval enclosure from a governing law: it
records whether the caller supplied sampled transitions or attested interval outer-approximation
metadata. It reports a Conley index only when caller metadata declares verified interval
coverage, the finite relation is isolated, and a separately supplied external certificate
declares a verified index pair. Publication still requires per-work scientific review of the
enclosure and certificate because the generic routine proves neither. The supplied transition
evidence and external certificate each require an independent source reference and lowercase
SHA-256 content hash, both retained in result provenance.

Maturity is computed from representation, run checks, regime review, and the manifest's reviewed
cap; it is not accepted as a self-awarded label:

| Level | Meaning                                                                                   |
| ----- | ----------------------------------------------------------------------------------------- |
| M0    | Unvalidated or illustrative. A surrogate is never promoted above this level.              |
| M1    | Equation-consistent execution with finite, dimensionally coherent, visible failure state. |
| M2    | Reviewed regime with at least one declared claim check, all of which pass.                |
| M3    | M2 plus a passing declared reference statistic or benchmark.                              |
| M4    | Rigorous enclosure or computer-assisted proof; supported by the type but not presumed.    |

The attained level is capped by the reviewed maturity in the manifest. A declared validation that
the runtime does not produce is recorded as `not-run`; a hard `not-run` invalidates the run and a
claim-level `not-run` prevents M2. M3 additionally requires `reference-statistic` to be declared
and to pass. The current automatic assessor stops at M3; M4 is reserved for a future
rigorous-artifact and independent-review contract, and cannot be self-awarded today. A failed
optional claim check can lower maturity or suppress the derived object without falsifying an
otherwise valid raw run.

## Rendering and accessibility

The artwork, traces, readouts, and Study table consume the same `WorkResult` and `WorkRunResult`.
The current-time row is therefore not a second computation. Fields select an actual computed frame;
a spatial row or column is never relabelled as time. Scientific sample time comes from `times` and
the numerical provenance. The optional `presentationDuration` is wall-clock staging only.

Observe keeps the phenomenon and one primary truth central. Study exposes the equation, formal
class, representation, regime, provenance, evidence status, maturity, limitations, source, and
live values. Exhibit uses the same scientific data with longer dwell and quieter chrome; it does
not alter flux, frequency, decay, event order, or scientific time.

Decorative stars, orbital hairlines, imagery, and room lighting are `aria-hidden` and never
represent model state. Reduced motion replaces animated staging with the reviewed static semantic
alternative; scrubbing, traces, values, labels, direction cues, and keyboard access remain.

## Validation boundaries

Validation occurs at several independent boundaries:

1. JSON Schema and semantic checks reject malformed manifests, duplicate IDs, invalid parameter
   ranges, unknown preset parameters, and duplicate slugs. CI passes every built-in version-2 work
   through the same public version-2 validator used for community manifests.
2. Portrait validation checks formal-runtime compatibility, definition hashes, regime references,
   mark/channel compatibility, scale domains, and composition references.
3. Runtime validation rejects non-finite values, non-increasing time, state / observable / grid shape
   mismatches, and unregistered kernel-runtime pairs.
4. Hard run checks decide whether a payload may be displayed. Claim checks decide which scientific
   statement and maturity are justified.
5. Unit, numerical, accessibility, browser, and visual regression tests enforce model-specific and
   cross-layer invariants. A test is evidence only for the property it actually checks.

## Static deployment

Vite builds a static application. `DYNAMUSIUM_BASE` is set from the current GitHub repository name
in the Pages workflow, so assets and deep links use the deployment base path. No backend,
analytics endpoint, account, upload surface, or persistent browser storage is required.
