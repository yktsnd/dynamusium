# AGENTS.md — canonical repository guide

This file is the single source of truth for how to work in this repository.
`CLAUDE.md` and `CONTRIBUTING.md` defer to it. Keep it accurate when behavior
or architecture changes — and only then.

## Product purpose

DynaMusium is an interactive museum of dynamic systems. Thirty sourced works
across motion, matter, life, Earth, and the cosmos expose computed trajectories
or fields through Observe, Study, and Exhibit modes, each run through a
capability-gated Dynamical Portrait pipeline that keeps scientific claims
tied to actual evidence. The original deterministic reaction-network
instrument remains a tested specialized runtime and visual grammar within the
museum, reused where a work's scientific object calls for quantity/flux
semantics.

**Intended users:** curious general visitors, learners and teachers of
mathematical modelling, and contributors adding scientifically reviewed works.

**Deliberately not in this version:** a graphical equation editor, runtime file
uploads, accounts, analytics, server-side services, persistent user data, or
unsourced/generated placeholder works.

## Repository map

| Path                                               | Responsibility                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/museum/MuseumApp.tsx`                         | Museum Shell: entrance, gallery filtering, URL routing, Observe/Study/Exhibit composition, and the "Abyss Observatory" ambient atmosphere.                                                                                                                                           |
| `src/museum/catalog.ts`                            | The permanent 30-work catalog; each seed is expanded through the portrait registry into a validated v2 `WorkManifest`.                                                                                                                                                               |
| `src/museum/types.ts`                              | Public `WorkManifest`/`WorkResult`/`WorkParameter`/`WorkPreset` types shared by built-in and community works.                                                                                                                                                                        |
| `src/museum/execute-work.ts`                       | The run boundary: binds manifest, resolved parameters, definition, and seed into `RunIdentity`/`RunProvenance`, dispatches `simulateWork()`, and returns a valid/invalid `WorkRunResult`.                                                                                            |
| `src/museum/simulation.ts`, `simulation.worker.ts` | Dispatches a manifest's declared runtime kernel and runs it off the main thread in a Web Worker.                                                                                                                                                                                     |
| `src/museum/useWorkSimulation.ts`                  | React hook wiring the worker/execution boundary to component state; debounces rapid slider input into one validated run (`WORK_SIMULATION_DEBOUNCE_MS`).                                                                                                                             |
| `src/museum/portrait-types.ts`                     | The museum-wide Dynamical Portrait contract: formal class, regimes, claims, maturity, provenance, `RunPayload`, semantic visual layers, composition.                                                                                                                                 |
| `src/museum/portrait-registry.ts`                  | Reviewed portrait definitions (formal class, regimes, claims, visual mappings) for every built-in work, plus the v1→v2 upgrade adapter for a kernel that already has one.                                                                                                            |
| `src/museum/portrait-validation.ts`                | `assertValidPortraitExtension`: regime/claim/layer uniqueness, mark/channel compatibility, event-binding fields, composition purity.                                                                                                                                                 |
| `src/museum/analyzers.ts`                          | Capability-gated **live** optional analyzers (occupancy/recurrence, box-graph SCCs, finite EDMD, interface density, H0 persistence); emit no object when evidence is insufficient.                                                                                                   |
| `src/museum/advanced-analyzers.ts`, `analyzers/`   | Bounded pure authoring/build-time routines (continuation, EDMD, persistent homology, finite transition enclosures) for evidence gathering; never auto-promote a live work's maturity.                                                                                                |
| `src/museum/semantic-visual.ts`                    | Shared numeric binding interpreter: applies a layer's declared linear/sqrt/log/symlog/cyclic transform and reports out-of-domain values; categorical bindings bypass it.                                                                                                             |
| `src/museum/trajectory-path.ts`                    | Builds an SVG path only from in-domain samples, breaking the subpath at excursions instead of joining clamped points into a false line.                                                                                                                                              |
| `src/museum/canonical-hash.ts`                     | Deterministic UTF-8 SHA-256 (`sha256`) and canonical-JSON hashing (`hashCanonical`) used for manifest, definition, and provenance identity.                                                                                                                                          |
| `src/museum/runtimes/`                             | Reviewed numerical kernels per declared runtime family: fixed-step RK4, adaptive Dormand–Prince 5(4) (CR3BP), periodic finite differences, closed-form/analytic evaluators, seeded Metropolis sampler.                                                                               |
| `src/works/`                                       | `work.schema.json` (v1) and `work-v2.schema.json` (v2) JSON Schemas, plus auto-discovered community manifests under `community/` (`import.meta.glob`).                                                                                                                               |
| `src/works/manifest-validator.ts`                  | `parseCommunityManifestCollection()`: the one validation boundary for imported JSON, kept `unknown` until it passes; shared by `work:validate` and the production import.                                                                                                            |
| `src/model/`                                       | Typed model contract (`schema.ts`), demonstration model, input profiles, ODE assembly (`equations.ts`), validation. **No React, no DOM.**                                                                                                                                            |
| `src/solver/`                                      | Fixed-step RK4 integration (`rk4.ts`, `integrate.ts`), trajectory type + interpolation (`trajectory.ts`), canonical tolerances (`numerical-tolerance.ts`). **No React, no DOM, no rendering.**                                                                                       |
| `src/state/`                                       | Zustand store (`simulation-store.ts`) — the one place that composes model + params + profile into a trajectory for the specialized reaction-network instrument — and pure selectors.                                                                                                 |
| `src/features/presets/`                            | Curated scenarios (parameter/profile/initial overrides) for the reaction-network instrument.                                                                                                                                                                                         |
| `src/features/playback/`                           | rAF loop advancing playback time for the reaction-network instrument.                                                                                                                                                                                                                |
| `src/features/inspector/`                          | Parameter/profile editing panel for the reaction-network instrument.                                                                                                                                                                                                                 |
| `src/features/exhibition/`                         | Kiosk/auto-advance presentation mode (`useExhibition`) — layers scene transitions and UI recession on top of the existing playback loop and store; never a second source of simulated state.                                                                                         |
| `src/visualization/`                               | SVG network: geometry, vessels (`nodes/`), channels, particle engine + layer (`particles/`), reservoir, and the reaction-network number→visual mappings (`visual-scales.ts`).                                                                                                        |
| `src/charts/`                                      | Time-series charts + shared time cursor, used by both the reaction-network instrument and museum works. Charts render trajectory arrays directly.                                                                                                                                    |
| `src/design-system/`                               | Design tokens (`tokens.css`), type roles, motion constants, icons, brand mark.                                                                                                                                                                                                       |
| `src/components/`                                  | Layout and generic controls (transport, presets, legend, announcer) for the reaction-network instrument.                                                                                                                                                                             |
| `src/lib/`                                         | Small pure helpers (formatting, accessibility hooks) shared across the app.                                                                                                                                                                                                          |
| `docs/`                                            | Architecture, model contract, numerical method, visual language, accessibility, ADRs. These are the source of truth this file must not contradict.                                                                                                                                   |
| `tests/museum/`                                    | Vitest contract suites for the catalog, runtimes, live/advanced analyzers, portrait/semantic-visual contracts, and museum-wide numerical safety.                                                                                                                                     |
| `tests/works/`                                     | Vitest suite for the community manifest validator (v1/v2 dispatch, structural and semantic rejection).                                                                                                                                                                               |
| `tests/`                                           | Vitest unit suites for the reaction-network core (`model/`, `solver/`, `visualization/`, `state/`) + Playwright e2e (`e2e/`).                                                                                                                                                        |
| `examples/`                                        | A second reaction-network model definition proving that contract is model-agnostic.                                                                                                                                                                                                  |
| `scripts/`                                         | Repo utilities: `work-new.mjs` (scaffold a v2 work), `validate-works.mjs` (CLI for `work:validate`), `capture-screens.mjs` (screenshot capture), `verify-citations.mjs` + `citation-match.mjs` (CLI for `cite:verify`, and the title-matching rule it shares with the offline test). |

## Architectural boundaries

- The Dynamical Portrait pipeline is one-way and renderer-agnostic: kernel
  (`src/museum/runtimes/`) → numerical result + provenance
  (`execute-work.ts`) → capability-gated optional analyzers (`analyzers.ts`,
  `advanced-analyzers.ts`) → immutable semantic visual mappings
  (`portrait-types.ts`, `semantic-visual.ts`) → composition and rendering. A
  later stage consumes the previous one; it never reaches back and edits it.
- Work manifests contain metadata and bounded controls; equations live only
  in simulation kernels (`src/museum/runtimes/`, `src/model/equations.ts`),
  never React components.
- Identical manifest, resolved parameters, execution profile, and seed
  produce identical `WorkResult`/`WorkRunResult` output.
- `CompositionSpec` may reorder approved layers, choose focus, bound negative
  space and camera, and reference non-semantic atmosphere; it has no
  quantity reference, transform, or scale field with which to rebind a
  visual channel's scientific meaning or manufacture data.
- Decorative room atmosphere (stars, orbital hairlines, room lighting) is not
  a scientific encoding, stays `aria-hidden`, and stays separate from
  normalized result rendering.
- Scientific time comes only from `WorkResult.times` and computed samples;
  `presentationDuration` is a separate wall-clock curation interval that
  Exhibit pacing may stretch or compress without changing model time, flux,
  decay rate, or event order.
- Model code (`src/model/`) must not depend on React or the DOM.
- Solver code (`src/solver/`) must not depend on rendering.
- Reaction-network rendering consumes simulation results only through the
  typed interfaces in `src/model/schema.ts` and `src/solver/trajectory.ts`.
- Charts and the animated network read the **same** trajectory object.
- Reaction-network model definitions live only in `src/model/` (and
  `examples/`); never duplicate equations or model structure in UI
  components.
- Visual state (particles, fills, cursors, path geometry) is derived output.
  It must never become the source of numerical truth.

## Numerical invariants

1. Deterministic inputs produce deterministic results (no randomness anywhere
   in model/solver).
2. Integration returns a typed `SimulationResult`
   (`src/solver/simulation-result.ts`): negative excursions within
   `NONNEGATIVE_TOLERANCE` are corrected to zero and counted in diagnostics;
   anything larger (or non-finite) aborts with a `NumericalError` — failures
   are surfaced, never clamped away.
3. A valid trajectory's quantities are nonnegative and its cumulative
   reservoir output is nondecreasing; reservoir decreases beyond tolerance
   make the result invalid instead of being masked.
4. An invalid result is never played back or charted: the store nulls the
   trajectory, halts playback, and the UI shows the failure until the inputs
   change or the preset is reset.
5. Particle emission derives from integrated rates (see
   `particle-engine.ts`); it is never arbitrary timing.
6. Scrubbing never mutates the calculated trajectory.
7. Changing playback speed never changes the model solution.
8. Chart values and displayed labels derive from the same simulation frame
   (`frameAt`).
9. Identical manifest, resolved parameters, execution profile, and seed
   produce the same `inputHash` and the same `WorkResult` on repeat
   execution; `executeWork()` performs the complete kernel call twice and an
   exact mismatch is a hard `deterministic-replay` failure
   (`tests/museum/execute-work-failure-contract.test.ts`,
   `tests/museum/portrait-contract.test.ts`, `tests/museum/catalog.test.ts`).
10. A museum run is valid or invalid, never a silent approximation:
    non-finite state, dimension mismatch, an unregistered kernel/runtime
    pair, and a failed hard check all produce `WorkRunResult.status:
'invalid'` with no display payload — never `NaN -> 0`, an arbitrary cap,
    or the previous trajectory relabelled as the new result
    (`tests/museum/numerical-safety.test.ts`,
    `tests/museum/execute-work-failure-contract.test.ts`,
    `tests/museum/portrait-contract.test.ts`).
11. A reviewed scientific claim and its attained maturity are earned, not
    self-awarded: parameters outside every declared regime get
    `custom-unreviewed`; a declared validation the execution profile does
    not produce is recorded `not-run` rather than silently passing; M3
    additionally requires a declared, passing reference statistic
    (`tests/museum/portrait-contract.test.ts`).
12. Optional browser analyzers never assert a theorem-strength result: SCC
    recurrence artifacts, finite EDMD modes, and H0 persistence emit no
    object — rather than a manufactured one — when input length, capability,
    conditioning, or holdout residual is insufficient, and are never
    described as invariance, a Koopman spectrum, or continuum topology
    (`tests/museum/analyzers.test.ts`, `tests/museum/continuation.test.ts`,
    `tests/museum/koopman-edmd.test.ts`, `tests/museum/topology-conley.test.ts`).
13. Every built-in work's every parameter declares a non-empty `unit`
    (`WorkParameter.unit` in `src/museum/types.ts`) so a visitor can tell
    which sliders are physically dimensional, which are nondimensionalized
    or in the kernel's own model units, and which are genuinely
    dimensionless — never a bare number with no indication of scale. Use
    `'dimensionless'` for a true ratio/count, `'model unit'` for a
    nondimensionalized or uncalibrated kernel quantity, and a real physical
    unit only where the kernel actually justifies it
    (`tests/museum/catalog.test.ts`).

These are encoded as tests in `tests/solver/`, `tests/state/`,
`tests/visualization/`, `tests/museum/`, and `tests/works/`. A change that
breaks one needs a documented reason, not a weakened test.

## Visual invariants

- Quantity (vessel fill height) and rate (channel width + particle frequency)
  use distinct encodings; never conflate them.
- Particle travel speed is a fixed wall-clock constant and is **not** a rate
  encoding — frequency is.
- Reversible directional activity (two lanes) stays distinguishable from net
  activity (single signed lane); the toggle is `rateView`.
- Color is never the only carrier of meaning (symbols, labels, dash patterns,
  direction chevrons back it up). The palette is CVD-validated as a set — see
  `src/design-system/tokens.css`; re-validate before changing any of it.
- In reduced-motion mode particles stop, but direction chevrons, channel
  widths, numeric rate labels, and chart updates remain.
- A reviewed `SemanticVisualLayer`'s quantity reference, mark, channel,
  scale, domain, zero, projection, and reduced-motion meaning are immutable
  once reviewed; composition may change light, typography, camera, negative
  space, and Exhibit pacing, but never what a channel means
  (`tests/museum/portrait-contract.test.ts` — "prevents composition from
  inventing or rebinding scientific layers", "rejects a visual channel that
  changes the scientific meaning of a mark").
- Study exposes an accessible HTML table of sampled observables with
  `aria-current` on the live row, and every color/motion encoding has a
  redundant non-color, non-motion carrier (label, symbol, dash pattern,
  numeric value) — see `docs/accessibility.md`.
- In reduced motion the museum shell stops automatic playback and removes
  quantity/flux particles from the reaction-network view, but keeps numeric
  flux, width, direction, scrubbing, and each work's reviewed static
  semantic alternative for phase/modal/trajectory/field artworks.

## Standard commands

| Task                           | Command                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| Install                        | `npm install` (CI: `npm ci`)                                               |
| Develop                        | `npm run dev`                                                              |
| Unit + numerical tests         | `npm test`                                                                 |
| Watch tests                    | `npm run test:watch`                                                       |
| E2E tests                      | `npx playwright install chromium` once, then `npm run test:e2e`            |
| Lint                           | `npm run lint`                                                             |
| Type check                     | `npm run typecheck`                                                        |
| Format                         | `npm run format` (check: `npm run format:check`)                           |
| Production build               | `npm run build`                                                            |
| Preview build                  | `npm run preview`                                                          |
| **Full validation**            | **`npm run check`** (format check → lint → typecheck → unit tests → build) |
| Scaffold a work                | `npm run work:new -- <slug> "<Title>"`                                     |
| Validate work manifests        | `npm run work:validate`                                                    |
| Preview a work while authoring | `npm run work:preview` (alias for `vite`)                                  |
| Capture work screenshots       | `npm run work:capture`                                                     |
| Re-verify every citation       | `npm run cite:verify` (add `-- --write` to refresh the ledger)             |

`cite:verify` resolves every DOI in the catalog through CrossRef and compares
the publisher's registered title against the title the museum displays. It
needs network access, so it is not part of `npm run check`; instead it
maintains `src/works/verified-citations.json`, which the offline tests in
`tests/museum/citations.test.ts` assert against. A citation URL changed
without re-running it fails the build. Where a publisher's own metadata is
wrong, record a `note` on that ledger entry explaining what was verified by
hand — notes survive `--write`.

## Change workflow

For every substantive change:

1. Read the relevant docs (`docs/architecture.md`, `docs/model-contract.md`,
   `docs/numerical-method.md`, or `docs/visual-language.md`).
2. Identify which invariants above are affected.
3. Implement the smallest coherent change.
4. Update or add tests that describe the new behavior.
5. Run `npm run check`.
6. If visual behavior changed, open the app (`npm run dev`) and inspect it at
   desktop and narrow widths; run `npm run test:e2e`.
7. Update documentation only where behavior or architecture actually changed.

Adding or changing a museum work goes through its manifest, a registered
kernel, and `npm run work:validate` — never a JSON edit alone:

1. Write or extend a kernel in `src/museum/runtimes/` (or reuse a registered
   one); it returns state/observables only, never presentation geometry.
2. Add or update the work's portrait — a built-in seed in
   `src/museum/catalog.ts`/`portrait-registry.ts`, or a community v2
   manifest under `src/works/community/` — with formal class, definition
   hash, reviewed regimes, one primary claim per regime, declared
   validations, and semantic visual mappings.
3. Run `npm run work:new -- <slug> "<Title>"` for a new scaffold; it starts
   at `M0` deliberately.
4. Run `npm run work:validate` and `npm run check`; add or extend a test in
   `tests/museum/` for any new runtime, analyzer capability, or visual
   mapping.

## Prohibited shortcuts

- Hiding type errors (`any`, `@ts-ignore`, `@ts-expect-error` without a bug link).
- Weakening or deleting a test to make a change pass.
- Duplicating model equations in UI files.
- Arbitrary particle timing unrelated to integrated rates.
- Hardcoding chart data separately from the trajectory.
- Replacing accessible controls with visual-only interactions.
- Claiming visual verification without opening the application.
- Leaving unused components, abandoned experiments, or commented-out code.
- Fabricating a citation, evidence maturity level, or reporting a declared
  `not-run` validation as passing.
- Adding or editing a citation URL without re-running `npm run cite:verify`.
  A DOI that points at an unrelated paper is still a well-formed https URL,
  so nothing else in the toolchain can catch it; three shipped that way.
- Presenting a conservative system whose invariant visibly drifts. If a work
  conserves energy, mass, or probability, its kernel must hold that invariant
  over the full run and parameter range, and a test in
  `tests/museum/conservation.test.ts` must measure it from real kernel output.
- Letting composition rebind a semantic visual layer's quantity reference,
  scale, domain, or channel meaning.
- Describing an optional analyzer's finite-sample artifact (SCC recurrence,
  finite EDMD, H0 persistence, a fold candidate) as a theorem-strength result
  (invariance, a Koopman spectrum/eigenfunction, a Conley index, continuum
  topology, a validated bifurcation) without a per-work external reviewed
  artifact.
