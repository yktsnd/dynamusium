# AGENTS.md — canonical repository guide

This file is the single source of truth for how to work in this repository.
`CLAUDE.md` and `CONTRIBUTING.md` defer to it. Keep it accurate when behavior
or architecture changes — and only then.

## Product purpose

KinetiFlux is an interactive visualization of deterministic reaction-kinetics
and flow models. A model (species, processes, parameters, an input profile) is
integrated numerically into an immutable trajectory; the UI plays that
trajectory back as an animated network (vessels, channels, particles, an
output reservoir) with synchronized charts.

**Intended users:** people exploring or teaching dynamic physical-chemistry /
mathematical-modeling behavior, and developers studying the architecture.

**Deliberately not in this version:** a graphical model editor, arbitrary
user-defined models in the UI, npm package publishing, server-side anything,
stochastic simulation, stiff-system solvers.

## Repository map

| Path                      | Responsibility                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/`              | Typed model contract (`schema.ts`), demonstration model, input profiles, ODE assembly (`equations.ts`), validation. **No React, no DOM.**                                                      |
| `src/solver/`             | Fixed-step RK4 integration (`rk4.ts`, `integrate.ts`), trajectory type + interpolation (`trajectory.ts`), canonical tolerances (`numerical-tolerance.ts`). **No React, no DOM, no rendering.** |
| `src/state/`              | Zustand store (`simulation-store.ts`) — the one place that composes model + params + profile into a trajectory — and pure selectors.                                                           |
| `src/features/presets/`   | Curated scenarios (parameter/profile/initial overrides).                                                                                                                                       |
| `src/features/playback/`  | rAF loop advancing playback time.                                                                                                                                                              |
| `src/features/inspector/` | Parameter/profile editing panel.                                                                                                                                                               |
| `src/visualization/`      | SVG network: geometry, vessels (`nodes/`), channels, particle engine + layer (`particles/`), reservoir, and the canonical number→visual mappings (`visual-scales.ts`).                         |
| `src/charts/`             | Time-series charts + shared time cursor. Charts render trajectory arrays directly.                                                                                                             |
| `src/design-system/`      | Design tokens (`tokens.css`), type roles, motion constants, icons, brand mark.                                                                                                                 |
| `src/components/`         | Layout and generic controls (transport, presets, legend, announcer).                                                                                                                           |
| `src/lib/`                | Small pure helpers (formatting, accessibility hooks).                                                                                                                                          |
| `docs/`                   | Architecture, model contract, numerical method, visual language, accessibility, ADRs.                                                                                                          |
| `tests/`                  | Vitest unit suites (`model/`, `solver/`, `visualization/`, `state/`) + Playwright e2e (`e2e/`).                                                                                                |
| `examples/`               | A second model definition proving the contract is model-agnostic.                                                                                                                              |
| `scripts/`                | Repo utilities (screenshot capture).                                                                                                                                                           |

## Architectural boundaries

- Model code (`src/model/`) must not depend on React or the DOM.
- Solver code (`src/solver/`) must not depend on rendering.
- Rendering consumes simulation results only through the typed interfaces in
  `src/model/schema.ts` and `src/solver/trajectory.ts`.
- Charts and the animated network read the **same** trajectory object.
- Model definitions live only in `src/model/` (and `examples/`); never
  duplicate equations or model structure in UI components.
- Visual state (particles, fills, cursors) is derived output. It must never
  become the source of numerical truth.

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

These are encoded as tests in `tests/solver/`, `tests/state/`, and
`tests/visualization/`. A change that breaks one needs a documented reason,
not a weakened test.

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

## Standard commands

| Task                   | Command                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| Install                | `npm install` (CI: `npm ci`)                                               |
| Develop                | `npm run dev`                                                              |
| Unit + numerical tests | `npm test`                                                                 |
| Watch tests            | `npm run test:watch`                                                       |
| E2E tests              | `npx playwright install chromium` once, then `npm run test:e2e`            |
| Lint                   | `npm run lint`                                                             |
| Type check             | `npm run typecheck`                                                        |
| Format                 | `npm run format` (check: `npm run format:check`)                           |
| Production build       | `npm run build`                                                            |
| Preview build          | `npm run preview`                                                          |
| **Full validation**    | **`npm run check`** (format check → lint → typecheck → unit tests → build) |

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

## Prohibited shortcuts

- Hiding type errors (`any`, `@ts-ignore`, `@ts-expect-error` without a bug link).
- Weakening or deleting a test to make a change pass.
- Duplicating model equations in UI files.
- Arbitrary particle timing unrelated to integrated rates.
- Hardcoding chart data separately from the trajectory.
- Replacing accessible controls with visual-only interactions.
- Claiming visual verification without opening the application.
- Leaving unused components, abandoned experiments, or commented-out code.
