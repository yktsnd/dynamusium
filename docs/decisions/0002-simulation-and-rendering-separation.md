# ADR 0002: Simulation and rendering separation

## Context

KinetiFlux's numerical results (species quantities, cumulative output,
process rates) must be trustworthy independent of how they happen to be
drawn. If UI components were allowed to compute or adjust derived numbers —
even something as small as a smoothed rate or a re-derived total — the app
would have more than one source of numerical truth, and a rendering bug
could silently misrepresent the simulation.

## Decision

`src/model/` and `src/solver/` must not depend on React or the DOM
(`AGENTS.md`'s architectural boundaries) — they are plain TypeScript,
testable and usable outside a browser. Rendering code consumes simulation
results **only** through the typed contract in `src/model/schema.ts` and
`src/solver/trajectory.ts` (`ModelDefinition`, `ParameterValues`,
`InputProfile`, `Trajectory`, `Frame`, `ProcessRates` — see
[model-contract.md](../model-contract.md)). Exactly one `Trajectory` is
produced per scenario (by `integrate()`, called only from the simulation
store), and every view — `NetworkView`, `RateChart`,
`QuantityChart`, the readouts, the status announcer — reads from that same
object via `frameAt` or the raw series arrays. No component computes a
species quantity, a rate, or the reservoir total itself; no component
duplicates model equations.

## Consequences

- The UI cannot introduce numerical truth. A component can select, scale,
  format, or interpolate (`frameAt`, `seriesMax`, `formatAmount`,
  `rateToWidth`, `quantityToFill`) but never derive a new physically
  meaningful number that didn't come from `integrate()`.
- Solver and model code is unit-testable in isolation (`tests/model/`,
  `tests/solver/`) with no rendering harness, browser, or React Testing
  Library involved.
- Adding or changing a rate law, a profile kind, or the reservoir's
  integration touches `src/model/` and/or `src/solver/` only; rendering code
  does not need to change unless a new _visual_ encoding is introduced.
- Two independent model definitions (`src/model/demonstration-model.ts` and
  `examples/damped-cascade.ts`) can share every rendering component with zero
  model-specific branching, which is itself a regression test for the
  boundary: if a component ever needed to special-case a model, that would
  indicate the contract had leaked.
- This is enforced by convention and code review (`AGENTS.md`'s "Duplicating
  model equations in UI files" is a listed prohibited shortcut), not by a
  build-time boundary (e.g. a separate package/lint rule blocking imports) —
  a future change could add one if the convention proves insufficient.

## Alternatives considered

- **Computing derived series inside components** (e.g. a chart computing a
  smoothed or resampled rate itself, or a vessel computing its own fill from
  raw state rather than a `Frame`): rejected because it would let two views
  of the same instant disagree if their derivation logic diverged even
  slightly, breaking numerical invariant #7 ("chart values and displayed
  labels derive from the same simulation frame") and making a rendering bug
  indistinguishable from a numerical one.
