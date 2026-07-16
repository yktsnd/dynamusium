# Numerical method

The solver lives in `src/solver/` and has no React or DOM dependency. This
document describes what it does and, explicitly, what it does not claim to
do: these are implementation choices suited to the demonstration model
KinetiFlux ships, not universally correct choices for every dynamical
system.

## Method: classical fixed-step RK4

`rk4Step` (`src/solver/rk4.ts`) is the textbook fixed-step, explicit
fourth-order Runge–Kutta method: four derivative evaluations (`k1..k4`) per
step, combined as `y += (dt/6)(k1 + 2k2 + 2k3 + k4)`. It operates on
pre-allocated `Float64Array` scratch buffers (`createRk4Scratch`) so a full
integration run does no per-step heap allocation.

There is no adaptive step-size control and no embedded error estimate (e.g.
no RK45/Dormand–Prince pair). The step size is fixed for the entire run.

## Internal step size

The step `dt` comes from the model's `config: SimulationConfig`
(`src/model/schema.ts`), not from any UI control. For the shipped
demonstration model (`src/model/demonstration-model.ts`) and the example
model (`examples/damped-cascade.ts`), `dt = 0.02 s`. `integrate()`
(`src/solver/integrate.ts`) runs `Math.round(duration / dt)` steps and stores
**every** step as a frame — there is no internal sub-stepping that goes
unrecorded, and no downsampling of the stored trajectory relative to the
integration.

## Interpolation between frames

Because frames are stored at every `dt`, any time within `[0, duration]` that
falls between two stored frames is produced by linear interpolation:
`frameAt(trajectory, t)` (`src/solver/trajectory.ts`) locates the bracketing
frame indices and linearly interpolates quantities, reservoir, and all three
rate channels (`forward`, `reverse`, `net`) independently. This is a display
convenience for scrubbing/hovering at sub-`dt` resolution — the underlying
numerical solution is only actually computed at the `dt` grid points.

## Tolerances (`src/solver/numerical-tolerance.ts`)

Three named constants are the single source of truth for numerical slack in
this codebase; tests and runtime clamping both use them instead of scattering
magic epsilons:

| Constant                          | Value   | Meaning                                                                                                          |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `NONNEGATIVE_TOLERANCE`           | `1e-9`  | How far below zero a quantity can drift before it's treated as a real (counted) violation rather than roundoff.  |
| `MASS_BALANCE_RELATIVE_TOLERANCE` | `1e-8`  | Allowed relative drift in closed-system mass-balance regression checks.                                          |
| `MONOTONICITY_TOLERANCE`          | `1e-12` | Allowed backward step in the cumulative reservoir series before it would count as a real monotonicity violation. |

## Numerical safety: small corrections vs. abort

`integrate()` (`src/solver/integrate.ts`) does not return a bare `Trajectory`.
It returns a `SimulationResult` (`src/solver/simulation-result.ts`) — a typed
union of a `valid` result (`{ trajectory, diagnostics }`) and an `invalid`
result (`{ error, diagnostics }`) — so a numerically unusable run can never be
mistaken for a real trajectory (see [model-contract.md](./model-contract.md)
for the full type).

After every RK4 step, `integrate()` scans all state variables (species
quantities and the reservoir, which share one state vector — see below):

- A **non-finite** value (`NaN`/`Infinity`) always aborts integration
  immediately with a `non-finite` `NumericalError`.
- A value `< 0` but no more negative than `-NONNEGATIVE_TOLERANCE` is ordinary
  floating-point roundoff: it is corrected to `0` and counted in
  `diagnostics.smallClampCount`.
- A value more negative than `-NONNEGATIVE_TOLERANCE` is a genuine failure: it
  aborts integration with a `negative-quantity` `NumericalError`.

Aborting means exactly that: `integrate()` returns immediately with `status:
'invalid'`, carrying the `NumericalError` (`kind`, `message`, `time`, `step`,
`stateIndex`, `stateId`, `value`, `tolerance`) and the `diagnostics`
accumulated up to the failing step. No trajectory is produced and none of the
steps after the failure are computed — an invalid run is never silently
clamped into something that looks like a valid one.

On success, `integrate()` returns `status: 'valid'` with the completed
`trajectory` and the final `diagnostics` (`smallClampCount`,
`reservoirCorrectionCount`, `stepsCompleted`). A nonzero `smallClampCount` is
a signal that the fixed step size may be pushing the current parameter values
toward the edge of what's well-behaved (see Limitations below), even though
the run still succeeded.

## Reservoir as an extra state variable

The cumulative-output reservoir is not computed by post-processing an output
rate — it is integrated as an additional state variable. `compileSystem`
(`src/model/equations.ts`) builds a state vector of length `species.length +
1`, with the reservoir at the last index (`reservoirIndex`); `outflow`
processes add their rate to that index's derivative the same way `conversion`
processes add to a species' derivative. This keeps the reservoir on the same
integration footing (same step, same solver, same clamping) as every species.

The reservoir is subject to the same small-correction-vs-abort logic
described above, applied to its own step-to-step change rather than its
absolute sign: a decrease from the previous step of no more than
`NONNEGATIVE_TOLERANCE` is floating-point noise — the value is corrected back
to the previous frame's reservoir value and counted in
`diagnostics.reservoirCorrectionCount`. A larger decrease aborts integration
with a `reservoir-decrease` `NumericalError`. There is no unconditional
`Math.max` guard forcing monotonicity on every frame — only micro-decreases
within tolerance are corrected; a real backward tick is treated as the
numerical failure it is, not papered over.

## Determinism

- No randomness appears anywhere in `src/model/` or `src/solver/`.
- Frame times are recomputed from the step index (`t = step * dt`) rather
  than accumulated by repeated addition, avoiding floating-point drift over
  long runs.
- Identical `(model, params, profile, initialOverrides)` inputs always
  produce bitwise-identical output arrays — this is what lets the UI treat
  playback speed and scrubbing as pure view state (see
  [architecture.md](./architecture.md)).

## Known limitations

These are properties of the current solver as applied to the demonstration
model, stated plainly rather than left implicit:

- **Fixed step is not suited to stiff systems.** There is no adaptive
  step-size control, so a parameter combination that makes the system stiff
  (e.g. rate constants far beyond the stable region for the fixed `dt`) is
  not clamped or masked — it surfaces as an `invalid` `SimulationResult` (see
  above), and the store halts playback and shows the failure rather than
  displaying an inaccurate solution.
- **First-order mass-action kinetics only.** The rate laws `compileSystem`
  can build are limited to what `ProcessDef` expresses (see
  [model-contract.md](./model-contract.md)); this solver has no support for
  second-order, saturating, or otherwise nonlinear rate expressions.
- **Small-tolerance correction still perturbs strict conservation.**
  Correcting a within-tolerance negative excursion to exactly zero is a real
  (if tiny, at `NONNEGATIVE_TOLERANCE` scale) departure from what unclamped
  continuous integration would have produced; closed-system mass balance is
  only guaranteed up to `MASS_BALANCE_RELATIVE_TOLERANCE`, not exactly. Larger
  excursions are not corrected at all — they abort the run instead (see
  above).

None of this is a general endorsement of RK4-with-tolerance-correction as
correct for arbitrary kinetic systems — it is documentation of the specific,
deliberate tradeoff this project made for a demonstration model with
well-behaved, non-stiff parameter ranges.
