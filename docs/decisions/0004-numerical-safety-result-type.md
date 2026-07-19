# ADR 0004: Numerical safety via a typed result union

**Status:** accepted

**Scope:** concrete tolerances and `SimulationResult` details apply to the preserved specialized
reaction-network solver. ADR 0006 adopts the same no-silent-failure principle through the
museum-wide `WorkRunResult`, without imposing these reaction-specific corrections on every model.

## Context

The fixed-step RK4 solver (`src/solver/integrate.ts`) has no adaptive
step-size control (see [numerical-method.md](../numerical-method.md)).
Floating-point roundoff routinely nudges a quantity or the cumulative-output
reservoir a hair below its previous value, and a parameter combination that
makes the system stiff for the fixed `dt` can make the numerical solution
genuinely wrong — not just noisy. The solver previously handled both cases
the same way: any negative value was clamped to zero, and the reservoir was
forced nondecreasing with an unconditional `Math.max` guard on every stored
frame. That collapsed two very different situations — harmless roundoff, and
a solution that has actually broken down — into the same silent correction.
A caller had no way to tell them apart, and the UI never surfaced either
case; a badly diverging run was displayed exactly as confidently as a good
one, with no indication that the numbers on screen might not mean anything.

## Decision

`integrate()` returns a typed union, `SimulationResult`
(`src/solver/simulation-result.ts`):

```ts
type SimulationResult =
  | { status: 'valid'; trajectory: Trajectory; diagnostics: Diagnostics }
  | { status: 'invalid'; error: NumericalError; diagnostics: Diagnostics };
```

Within a step, the two situations above are handled differently on purpose:

- A quantity dipping below zero by no more than `NONNEGATIVE_TOLERANCE`, or
  the reservoir decreasing by no more than that between steps, is roundoff:
  it is corrected (to `0`, or back to the previous reservoir value) and
  counted in `diagnostics` (`smallClampCount`, `reservoirCorrectionCount`).
- Anything larger — a bigger negative excursion, a non-finite value, or a
  larger reservoir decrease — aborts integration immediately. `integrate()`
  returns `status: 'invalid'` with a structured `NumericalError` (`kind`,
  `message`, `time`, `step`, `stateIndex`, `stateId`, `value`, `tolerance`).
  No trajectory is produced, and no step past the failure is computed.

The store (`src/state/simulation-store.ts`) unpacks this union through
`applyResult` into `status`, `trajectory: Trajectory | null`, `error:
NumericalError | null`, and `diagnostics`. On invalid, it also stops playback
(`playing: false`) and resets `time` to `0`; every playback action (`play`,
`restart`, `setTime`, `advance`) checks `trajectory` first and no-ops when
it's `null`, so an invalid result cannot be played, scrubbed, or advanced
through. `App` (`src/app/App.tsx`) renders `InvalidStatePanel` (`role="alert"`,
the error and diagnostics, a "Reset preset defaults" button) instead of the
network, hides `TransportBar`, and replaces both charts with "unavailable"
placeholders — see [architecture.md](../architecture.md#execution-and-run-identity) and
[accessibility.md](../accessibility.md#invalid-simulation-state).
`resetToPresetDefaults()` (re-selecting the current preset) is the recovery
path back to a valid state.

## Consequences

- A caller — the store, a test, or a future integration point — cannot read
  `trajectory` out of an invalid result; the type system enforces checking
  `status` first. There is no code path where a diverged run is silently
  treated as data.
- The UI must have, and now has, a real representation of "no usable
  solution" — `InvalidStatePanel`, hidden charts, halted playback — instead
  of only ever having a representation of a running or paused simulation.
- `Diagnostics` distinguishes "corrected small noise" from "aborted" even
  within a single run, so a nonzero `smallClampCount` on an otherwise
  `valid` result remains a legitimate (if worth noting) outcome, while any
  `invalid` result is unambiguous.
- Removing the unconditional `Math.max` reservoir guard means a genuine
  backward tick in cumulative output is no longer possible to observe as a
  rendering artifact — it now always means the run aborted with a
  `reservoir-decrease` error, which is easier to reason about than "the
  guard usually fixes it."
- Every call site that used to read a bare `Trajectory` from `integrate()`
  had to change to branch on `SimulationResult['status']` first; there is no
  backward-compatible bare-`Trajectory` return left in the solver.

## Alternatives considered

- **Throwing an exception across the store boundary**: rejected because it
  would force every store action that can trigger integration (`setParam`,
  `setProfileKind`, `setProfileField`, `selectPreset`) to wrap `integrate()`
  in `try`/`catch`, turning a data-flow concern into control-flow, and it
  gives the caller no structured `Diagnostics` for the steps that did
  complete before the failure — only whatever the exception happened to
  carry.
- **Clamping everything and showing a warning badge**: rejected because it
  keeps the core problem — a numerically broken run rendered as if it were
  a solution, just with a badge bolted on nearby. A badge is easy to miss or
  dismiss mentally, especially for the particle/vessel/chart-heavy views
  where the eye is drawn to the animation, not a status chip; it does not
  stop playback, does not prevent scrubbing through the invalid region, and
  does not satisfy the invariant that displayed numbers must derive from a
  trustworthy simulation.
- **Returning partial trajectories for invalid runs** (the frames computed
  before the failure, padded or truncated): rejected because a partial
  trajectory still plays, scrubs, and charts like a complete one — nothing
  in the rendering layer distinguishes "this is the whole run" from "this
  stops abruptly because something broke," and a user scrubbing past the
  last real frame would see either a hard stop with no explanation or
  extrapolated/repeated values, either of which is worse than a single
  explicit failure state.
