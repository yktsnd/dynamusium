# ADR 0006: Dynamical Portrait runtime and semantic rendering boundary

**Status:** accepted

## Context

The first museum runtime normalized thirty heterogeneous works into times, generic series, a 2D
point list, or one static field. That made the screen coherent, but it could not state whether an
image was a governing-law solution, analytic family, reduced model, or surrogate; it also lacked
raw state identity, reproducible provenance, claim-scoped checks, true field frames, and a reviewed
number-to-visual contract. A universal fixed-step RK4 policy is inappropriate for maps,
Hamiltonian chains, Markov samplers, PDE discretizations, and analytic observation laws.

The project also needs to preserve its completed museum shell and quiet visual identity. The
scientific correction therefore belongs inside the execution and semantic boundaries, not in a
wholesale screen redesign.

## Decision

Adopt the version-2 Dynamical Portrait pipeline:

```text
formal system + reviewed inputs
  -> registered kernel result + reproducible provenance
  -> hard and claim-level evidence
  -> qualified scientific objects
  -> reviewed semantic visual layers
  -> tool-independent composition and rendering
```

- `WorkManifestV2` declares a modest tagged formal class, actual representation, reviewed
  parameter regimes, one primary claim per regime, runtime profile, required validations,
  semantic mappings, and composition.
- Runtime dispatch is explicit. A kernel returns numerical state, observables, field frames, or a
  declared ensemble—never SVG, canvas pixels, or screen coordinates.
- `executeWork()` resolves bounded inputs, creates content hashes, executes the same input twice
  for an exact replay check, completes every declared validation (missing evidence becomes
  `not-run`), and returns a typed valid or invalid `WorkRunResult`. An invalid result carries no
  display payload.
- Solver choice follows the mathematical object: RK4 for reviewed non-stiff ODE profiles,
  velocity Verlet for FPUT, a seeded Metropolis transition kernel for Ising, declared finite-grid
  field methods, and analytic evaluators for exact families. No solver is universal.
- Maturity is computed, not self-awarded. M1 requires the hard execution boundary; M2 requires a
  reviewed regime and at least one declared claim check with every declared claim check passing;
  M3 additionally requires a declared, passing `reference-statistic`. M4 is reserved for a future
  rigorous-artifact review and is not automatically awarded.
- Optional live analyzers are capability-gated and conservatively named. They provide finite
  recurrence / occupancy, observed box transitions, two-observable identity-dictionary ridge EDMD
  with chronological holdout, interface density, and finite-grid H0 persistence. These artifacts
  are not promoted to rigorous Conley objects, Koopman eigenfunctions / complete spectra,
  invariant measures, continuum topology, or Morse–Smale structures.
- A bounded public authoring foundation additionally provides finite-precision pseudo-arclength
  continuation, sourced explicit-dictionary EDMD, finite-grid H0 persistence, and analysis of a
  supplied finite transition enclosure. Continuation reports fold candidates, not validated
  folds. A Conley index is accepted only when caller metadata declares verified interval coverage,
  the finite relation is isolated, and a separately supplied external certificate declares a
  verified index pair; the generic browser routine does not construct or prove that enclosure or
  certificate. Enclosure evidence and the certificate each carry a source reference and lowercase
  SHA-256 content hash in provenance.
- A `SemanticVisualLayer` fixes quantity references, channels, scales, domains, overflow,
  projections, scientific time, and reduced-motion meaning. Event-frequency mappings consume a
  kernel-provided cumulative observable and declared quantum; React does not re-integrate flux.
- `CompositionSpec` may arrange approved layers and set focus, bounded negative space, camera,
  atmosphere, typography, light, and pacing. It cannot change scientific bindings. No authoring
  tool is required or privileged; Fable has no runtime or review authority.
- Scientific time comes only from samples and provenance. Exhibit dwell uses separate wall-clock
  presentation time. Starting a request removes the prior display, and stale worker responses are
  ignored.
- The original reaction-network instrument remains governed by ADRs 0001–0004 as a specialized,
  tested runtime. Its semantics may be reused only when a portrait explicitly declares compatible
  amount and directional-flux objects.

## Consequences

- All permanent works share one auditable scientific boundary without pretending they share one
  solver or one mathematical classification theorem.
- A low maturity, `not-run` check, absent optional object, or custom-unreviewed regime remains a
  first-class honest outcome. The UI cannot convert missing evidence into a confident image.
- The permanent collection and community manifests use strict versioned schemas. A v1 manifest is
  upgraded only when its kernel already has a reviewed portrait definition; unknown scientific
  meaning is never inferred from display metadata.
- Current field works expose actual time-indexed frames. Spatial rows and columns cannot be
  relabelled as time.
- Renderers can evolve while semantic mappings remain reviewable and stable. The existing
  Observe / Study / Exhibit shell, deep-ink palette, quiet motion, and non-semantic atmosphere are
  preserved.
- Phase 5's generic finite-evidence foundation is complete within the bounded scope above.
  Validated bifurcation branches, true Koopman eigenfunctions / transfer spectra, continuum
  topology / Morse–Smale structures, and computer-assisted proofs are not generic-browser
  deliverables. They may enter only as per-work external artifacts with independent provenance,
  certificates where applicable, and scientific review; renderer inference never fills them in.

## Supersedes

This ADR supersedes [ADR 0005](./0005-museum-runtime-and-solver-scope.md). ADRs 0001–0004 remain
accepted within their stated specialized reaction-network scope.
